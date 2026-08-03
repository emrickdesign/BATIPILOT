import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// Met en veille une catégorie de todo du tableau de bord pour N jours.
// L'écriture est scellée à l'utilisateur connecté (RLS + user_id serveur).
const ALLOWED_KEYS = new Set([
  'relances', 'factures_echues', 'rapprocher', 'tickets', 'comptable', 'heures', 'planning',
])
const MAX_DAYS = 3650

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const key = String(body?.key || '')
  const days = Number(body?.days)
  if (!ALLOWED_KEYS.has(key)) return NextResponse.json({ error: 'Catégorie inconnue' }, { status: 400 })
  if (!Number.isFinite(days) || days < 1 || days > MAX_DAYS) {
    return NextResponse.json({ error: 'Durée invalide' }, { status: 400 })
  }

  const snoozeUntil = new Date(Date.now() + days * 86_400_000).toISOString()
  const { error } = await supabase
    .from('dashboard_snoozes')
    .upsert({ user_id: user.id, todo_key: key, snooze_until: snoozeUntil }, { onConflict: 'user_id,todo_key' })
  if (error) return NextResponse.json({ error: 'Enregistrement impossible' }, { status: 500 })

  return NextResponse.json({ ok: true, snooze_until: snoozeUntil })
}
