import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ensureUser, getUserToken, createConnectSession, bankConfigured } from '@/lib/bank/bridge'

export const dynamic = 'force-dynamic'

// Démarre la connexion bancaire : crée (au besoin) l'utilisateur Bridge, ouvre une
// connect-session et renvoie l'URL du tunnel (choix banque + auth chez la banque).
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  if (!bankConfigured()) return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  if (!user.email) return NextResponse.json({ error: 'email_manquant' }, { status: 400 })

  const origin = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin
  const reference = `${user.id}.${Date.now()}`

  try {
    await ensureUser(user.id)
    const token = await getUserToken(user.id)
    const { id, url } = await createConnectSession(token, {
      userEmail: user.email,
      callbackUrl: `${origin}/api/bank/callback`,
      context: reference,
    })
    await supabase.from('bank_connections').insert({
      user_id: user.id, provider: 'bridge', reference, requisition_id: id, status: 'pending',
    })
    return NextResponse.json({ link: url })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }
}
