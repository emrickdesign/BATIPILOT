import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { notify } from '@/lib/notifications'

// Rappels des actions de réunion (Vercel Cron, 1×/jour) :
//   • échéance aujourd'hui/demain → rappel au salarié
//   • échéance dépassée + non faite → alerte "en retard" (salarié + résumé admin)
// Idempotent grâce au dedup_key (une notif par action / état / jour).
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const service = createServiceClient()
  const today = iso(new Date())
  const tomorrow = iso(new Date(Date.now() + 86_400_000))

  const { data: actions } = await service
    .from('meeting_actions')
    .select('id, user_id, employee_id, title, due_date, status, meeting_id, meetings(title, status)')
    .neq('status', 'done')
    .not('due_date', 'is', null)
    .lte('due_date', tomorrow)

  const rows = (actions || []).filter((a: any) => a.employee_id && a.meetings?.status === 'published')
  const overdueByUser: Record<string, number> = {}
  let sent = 0

  for (const a of rows as any[]) {
    const overdue = a.due_date < today
    const dateFr = new Date(a.due_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
    await notify(service, {
      user_id: a.user_id,
      employee_id: a.employee_id,
      kind: overdue ? 'action_overdue' : 'action_due',
      title: overdue ? 'Action en retard' : 'Action à faire bientôt',
      body: `${a.title} — ${a.meetings?.title || 'réunion'} (échéance ${dateFr})`,
      href: '/terrain/reunions',
      meeting_id: a.meeting_id,
      dedup_key: `act:${a.id}:${overdue ? 'late' : 'soon'}:${today}`,
    })
    sent++
    if (overdue) overdueByUser[a.user_id] = (overdueByUser[a.user_id] || 0) + 1
  }

  // Résumé admin : nombre d'actions en retard
  for (const [userId, n] of Object.entries(overdueByUser)) {
    await notify(service, {
      user_id: userId,
      employee_id: null,
      kind: 'actions_overdue_summary',
      title: `${n} action${n > 1 ? 's' : ''} de réunion en retard`,
      body: 'Des actions assignées ne sont pas encore faites.',
      href: '/reunions/actions',
      dedup_key: `overdue-summary:${today}`,
    })
  }

  return NextResponse.json({ ok: true, reminders: sent })
}
