import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createRequisition, gocardlessConfigured } from '@/lib/bank/gocardless'

export const dynamic = 'force-dynamic'

// Démarre la connexion à une banque : crée une requisition GoCardless et renvoie
// le lien vers lequel rediriger l'admin (auth chez sa banque).
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  if (!gocardlessConfigured()) return NextResponse.json({ error: 'not_configured' }, { status: 503 })

  const { institutionId } = await req.json().catch(() => ({}))
  if (!institutionId) return NextResponse.json({ error: 'institutionId requis' }, { status: 400 })

  const origin = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin
  const reference = `${user.id}.${Date.now()}`

  try {
    const { id, link } = await createRequisition({
      institutionId,
      redirect: `${origin}/api/bank/callback`,
      reference,
    })
    await supabase.from('bank_connections').insert({
      user_id: user.id,
      provider: 'gocardless',
      reference,
      requisition_id: id,
      institution_id: institutionId,
      status: 'pending',
    })
    return NextResponse.json({ link })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }
}
