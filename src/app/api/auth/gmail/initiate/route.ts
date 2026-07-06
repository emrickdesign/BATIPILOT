import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

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

  const { data: connection } = await supabase
    .from('gmail_connections')
    .select('client_id')
    .eq('user_id', user.id)
    .single()

  if (!connection?.client_id) {
    return NextResponse.redirect(new URL('/parametres/gmail?error=no-credentials', req.url))
  }

  const redirectUri = `${req.nextUrl.origin}/api/auth/gmail/callback`
  const params = new URLSearchParams({
    client_id: connection.client_id,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state: user.id,
  })

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
}
