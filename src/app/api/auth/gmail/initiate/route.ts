import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { resolveCredentials, googleRedirectUri } from '@/lib/google-oauth'

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.labels',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/calendar.events',
].join(' ')

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))

  // Credentials de l'app BatiPilot ; repli sur ceux de l'utilisateur (ancien système)
  const { data: connection } = await supabase
    .from('gmail_connections')
    .select('client_id, client_secret')
    .eq('user_id', user.id)
    .maybeSingle()

  const { clientId, ok } = resolveCredentials(connection)
  if (!ok) {
    return NextResponse.redirect(new URL('/parametres/gmail?error=no-credentials', req.url))
  }

  const redirectUri = googleRedirectUri(req.nextUrl.origin)
  // Tracé : en cas de redirect_uri_mismatch, l'URI doit être déclarée au
  // caractère près SUR LE CLIENT correspondant à ce client_id (piège classique
  // quand plusieurs clients OAuth coexistent dans la console).
  console.log('[gmail-oauth] redirect_uri:', redirectUri, '| client_id:', clientId,
    '| source:', connection?.client_id ? 'connexion (ancien système)' : 'variable env')
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state: user.id,
  })

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
}
