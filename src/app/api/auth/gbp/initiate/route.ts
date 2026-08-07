import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { GOOGLE_CLIENT_ID, hasAppCredentials, gbpRedirectUri } from '@/lib/google-oauth'

// Scope Business Profile : lecture des fiches + avis + publication de réponses.
// Scope SENSIBLE → l'écran de consentement OAuth doit le déclarer, et l'app doit
// être validée par Google (ou l'utilisateur ajouté en « test user » en attendant).
const SCOPES = ['https://www.googleapis.com/auth/business.manage'].join(' ')

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))

  if (!hasAppCredentials()) {
    return NextResponse.redirect(new URL('/avis?gbp=no-credentials', req.url))
  }

  const redirectUri = gbpRedirectUri(req.nextUrl.origin)
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state: user.id,
  })

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
}
