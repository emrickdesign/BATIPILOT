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
  // Tracé : en cas de redirect_uri_mismatch, c'est CETTE valeur qu'il faut
  // déclarer dans la console Google, au caractère près.
  console.log('[gmail-oauth] redirect_uri envoyée à Google :', redirectUri)
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
