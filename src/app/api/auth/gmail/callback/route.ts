import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl

  const code = searchParams.get('code')
  const errorParam = searchParams.get('error')
  const userId = searchParams.get('state')

  if (errorParam) {
    console.error('Google OAuth error:', errorParam)
    return NextResponse.redirect(`${origin}/parametres/gmail?error=denied`)
  }

  if (!code || !userId) {
    return NextResponse.redirect(`${origin}/parametres/gmail?error=denied`)
  }

  try {
    const supabase = await createClient()

    // Récupérer les credentials OAuth stockés
    const { data: connection, error: connError } = await supabase
      .from('gmail_connections')
      .select('client_id, client_secret')
      .eq('user_id', userId)
      .maybeSingle()

    if (connError) {
      console.error('DB error fetching connection:', connError)
      return NextResponse.redirect(`${origin}/parametres/gmail?error=no-credentials`)
    }

    if (!connection?.client_id || !connection?.client_secret) {
      return NextResponse.redirect(`${origin}/parametres/gmail?error=no-credentials`)
    }

    const redirectUri = `${origin}/api/auth/gmail/callback`

    // Échange du code contre les tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: connection.client_id,
        client_secret: connection.client_secret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })

    const tokenText = await tokenRes.text()
    if (!tokenRes.ok) {
      console.error('Token exchange failed:', tokenText)
      return NextResponse.redirect(`${origin}/parametres/gmail?error=token-failed`)
    }

    const tokens = JSON.parse(tokenText)
    const expiresIn = typeof tokens.expires_in === 'number' ? tokens.expires_in : 3600
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

    // Récupérer l'email Gmail
    let gmailEmail: string | null = null
    try {
      const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      })
      if (userInfoRes.ok) {
        const userInfo = await userInfoRes.json()
        gmailEmail = userInfo.email ?? null
      }
    } catch (e) {
      console.error('Could not fetch Gmail userinfo:', e)
    }

    // Sauvegarder les tokens
    const { error: updateError } = await supabase
      .from('gmail_connections')
      .update({
        access_token_encrypted: tokens.access_token,
        refresh_token_encrypted: tokens.refresh_token ?? null,
        expires_at: expiresAt,
        gmail_email: gmailEmail,
      })
      .eq('user_id', userId)

    if (updateError) {
      console.error('DB update error:', updateError)
      return NextResponse.redirect(`${origin}/parametres/gmail?error=token-failed`)
    }

    return NextResponse.redirect(`${origin}/parametres/gmail?success=connected`)
  } catch (err: any) {
    console.error('Unhandled callback error:', err)
    return NextResponse.redirect(`${origin}/parametres/gmail?error=token-failed`)
  }
}
