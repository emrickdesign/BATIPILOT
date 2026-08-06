import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { syncUserBank } from '@/lib/bank/sync'
import { bankConfigured } from '@/lib/bank/bridge'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Synchro manuelle « Actualiser » depuis la page Banque.
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  if (!bankConfigured()) return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  try {
    const res = await syncUserBank(supabase, user.id)
    return NextResponse.json(res)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }
}
