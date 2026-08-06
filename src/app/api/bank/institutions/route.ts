import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { listInstitutions, gocardlessConfigured } from '@/lib/bank/gocardless'

export const dynamic = 'force-dynamic'

// Liste des banques disponibles (pour le sélecteur de connexion).
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  if (!gocardlessConfigured()) return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  try {
    const inst = await listInstitutions('fr')
    return NextResponse.json({ institutions: inst.map(i => ({ id: i.id, name: i.name, logo: i.logo })) })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }
}
