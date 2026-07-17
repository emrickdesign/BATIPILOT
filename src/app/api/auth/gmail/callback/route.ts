import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { resolveCredentials, googleRedirectUri } from '@/lib/google-oauth'

export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl

  const code = searchParams.get('code')
  const errorParam = searchParams.get('error')
  const userId = searchParams.get('state')

  if (errorParam) {
    console.error('[gmail-callback] Google a refusé :', errorParam)
    return NextResponse.redirect(`${origin}/parametres/gmail?error=denied`)
  }

  // Cette branche redirigeait en silence : impossible de diagnostiquer ensuite.
  if (!code || !userId) {
    console.error('[gmail-callback] Paramètres manquants — code:', !!code, '| state(userId):', !!userId)
    return NextResponse.redirect(`${origin}/parametres/gmail?error=denied`)
  }

  try {
    const supabase = await createClient()

    // Credentials de l'app BatiPilot ; repli sur ceux de l'utilisateur (ancien système)
    const { data: connection } = await supabase
      .from('gmail_connections')
      .select('client_id, client_secret')
      .eq('user_id', userId)
      .maybeSingle()

    const { clientId, clientSecret, ok } = resolveCredentials(connection)
    if (!ok) {
      console.error('Gmail OAuth : aucun credential (ni app, ni utilisateur)')
      return NextResponse.redirect(`${origin}/parametres/gmail?error=no-credentials`)
    }

    // Doit être STRICTEMENT la même que celle envoyée par initiate
    const redirectUri = googleRedirectUri(origin)

    // Échange du code contre les tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })

    const tokenText = await tokenRes.text()
    if (!tokenRes.ok) {
      // C'est ici qu'un client_secret erroné se manifeste (invalid_client)
      console.error('[gmail-callback] Échange du code refusé par Google :', tokenText)
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

    // Upsert : l'utilisateur ne crée plus la ligne lui-même (plus de save-credentials)
    const { error: updateError } = await supabase
      .from('gmail_connections')
      .upsert({
        user_id: userId,
        access_token_encrypted: tokens.access_token,
        refresh_token_encrypted: tokens.refresh_token ?? null,
        expires_at: expiresAt,
        gmail_email: gmailEmail,
      }, { onConflict: 'user_id' })

    if (updateError) {
      // Typiquement : RLS (session absente dans le callback) ou clé étrangère
      console.error('[gmail-callback] Enregistrement en base refusé :', updateError.message, '| code:', updateError.code)
      return NextResponse.redirect(`${origin}/parametres/gmail?error=token-failed`)
    }

    console.log('[gmail-callback] OK — connecté :', gmailEmail, '| refresh_token reçu :', !!tokens.refresh_token)
    return NextResponse.redirect(`${origin}/parametres/gmail?success=connected`)
  } catch (err: any) {
    console.error('Unhandled callback error:', err)
    return NextResponse.redirect(`${origin}/parametres/gmail?error=token-failed`)
  }
}
