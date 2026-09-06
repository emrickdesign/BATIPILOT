import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getValidGmailToken } from '@/lib/gmail-token'
import { NextRequest, NextResponse } from 'next/server'
import type { PendingAction } from '@/lib/assistant/tools'
import { withinRateLimit } from '@/lib/assistant/guard'

export const dynamic = 'force-dynamic'

// Exécute une action d'envoi APRÈS confirmation explicite de l'utilisateur (bouton).
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

    const { action } = await req.json() as { action: PendingAction }
    if (!action?.canal) return NextResponse.json({ error: 'Action invalide' }, { status: 400 })

    // Rate-limit par utilisateur.
    const rl = createServiceClient()
    if (!(await withinRateLimit(rl, user.id, 30))) {
      return NextResponse.json({ error: 'Trop de requêtes, patiente un instant.' }, { status: 429 })
    }

    if (action.canal === 'email_client') {
      const tok = await getValidGmailToken(supabase, user.id)
      if (!tok) return NextResponse.json({ error: 'Gmail non connecté' }, { status: 400 })
      const raw = [
        `From: ${tok.gmailEmail}`,
        `To: ${action.to}`,
        `Subject: ${action.subject}`,
        'Content-Type: text/plain; charset=utf-8',
        '',
        action.message,
      ].join('\n')
      const encoded = Buffer.from(raw).toString('base64').replace(/\+/g, '-').replace(/\//g, '_')
      const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tok.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: encoded }),
      })
      if (!res.ok) return NextResponse.json({ error: "L'email n'a pas pu être envoyé." }, { status: 500 })
      return NextResponse.json({ ok: true, message: `Email envoyé à ${action.label}.` })
    }

    if (action.canal === 'message_interne') {
      const service = createServiceClient()
      let conversationId: string

      if (action.targetKind === 'conversation') {
        // Groupe / conversation existante : vérifie l'appartenance.
        const { data: conv } = await service.from('conversations').select('id, user_id').eq('id', action.conversationId).maybeSingle()
        if (!conv || conv.user_id !== user.id) return NextResponse.json({ error: 'Conversation introuvable' }, { status: 404 })
        conversationId = conv.id as string
      } else {
        // Salarié : conversation directe existante, sinon on la crée.
        const { data: emp } = await service.from('employees').select('id').eq('id', action.employeeId).eq('user_id', user.id).maybeSingle()
        if (!emp) return NextResponse.json({ error: 'Salarié introuvable' }, { status: 404 })
        const { data: parts } = await service.from('conversation_participants')
          .select('conversation_id, conversations!inner(id, user_id, type)')
          .eq('user_id', user.id).eq('employee_id', emp.id)
        const existing = (parts || []).find(p => (p.conversations as unknown as { type: string } | null)?.type === 'direct')?.conversation_id as string | undefined
        if (existing) {
          conversationId = existing
        } else {
          const { data: conv, error: convErr } = await service.from('conversations')
            .insert({ user_id: user.id, type: 'direct', name: null }).select('id').single()
          if (convErr || !conv) return NextResponse.json({ error: 'Création conversation impossible' }, { status: 500 })
          conversationId = conv.id as string
          await service.from('conversation_participants').insert({ conversation_id: conversationId, user_id: user.id, employee_id: emp.id })
        }
      }

      const { error } = await service.from('messages').insert({
        conversation_id: conversationId, user_id: user.id, sender_type: 'admin', body: action.message,
      })
      if (error) return NextResponse.json({ error: "Le message n'a pas pu être envoyé." }, { status: 500 })
      return NextResponse.json({ ok: true, message: `Message envoyé à ${action.label}.` })
    }

    if (action.canal === 'marquer_facture_payee') {
      const { error } = await supabase.from('invoices')
        .update({ status: 'payee', amount_due: 0 })
        .eq('id', action.invoiceId).eq('user_id', user.id)
      if (error) return NextResponse.json({ error: "La facture n'a pas pu être mise à jour." }, { status: 500 })
      return NextResponse.json({ ok: true, message: `${action.label} marquée payée.` })
    }

    return NextResponse.json({ error: 'Canal non supporté' }, { status: 400 })
  } catch (err) {
    console.error('Assistant execute error:', err)
    return NextResponse.json({ error: (err as Error)?.message || 'Erreur serveur' }, { status: 500 })
  }
}
