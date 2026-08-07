import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// Enregistre la fiche active choisie par l'utilisateur (compte gérant plusieurs fiches).
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { location, title } = await req.json().catch(() => ({}))
  if (!location) return NextResponse.json({ error: 'bad-request' }, { status: 400 })

  // account_name = préfixe accounts/X (avant /locations/…)
  const account = String(location).split('/locations/')[0] || null

  const { error } = await supabase.from('google_business_connections').update({
    location_name: location,
    location_title: title || null,
    account_name: account,
    updated_at: new Date().toISOString(),
  }).eq('user_id', user.id)

  if (error) return NextResponse.json({ error: 'save-failed' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
