import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { pennylaneAuthorizeUrl, pennylaneOAuthConfigured } from '@/lib/einvoicing/pennylane'

// « Se connecter avec Pennylane » : redirige vers l'écran d'autorisation Pennylane (OAuth 2.0).
// Nécessite l'application partenaire TonPilote (PENNYLANE_CLIENT_ID / PENNYLANE_CLIENT_SECRET).

const SETTINGS = '/parametres/facturation-electronique'
export const STATE_COOKIE = 'tp_pennylane_state'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))
  if (!pennylaneOAuthConfigured()) {
    return NextResponse.redirect(new URL(`${SETTINGS}?error=${encodeURIComponent('La connexion Pennylane en un clic n’est pas encore activée : utilisez le token API.')}`, req.url))
  }

  const state = randomBytes(24).toString('base64url')
  const redirectUri = `${req.nextUrl.origin}/api/einvoicing/pennylane/callback`
  const res = NextResponse.redirect(pennylaneAuthorizeUrl(state, redirectUri))
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true, sameSite: 'lax', secure: req.nextUrl.protocol === 'https:',
    path: '/api/einvoicing/pennylane', maxAge: 600,
  })
  return res
}
