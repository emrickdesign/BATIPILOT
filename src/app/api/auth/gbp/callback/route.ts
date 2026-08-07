import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, gbpRedirectUri } from '@/lib/google-oauth'

export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl
  const code = searchParams.get('code')
  const errorParam = searchParams.get('error')
  const userId = searchParams.get('state')

  if (errorParam) {
    console.error('[gbp-callback] Google a refusé :', errorParam)
    return NextResponse.redirect(`${origin}/avis?gbp=denied`)
  }
  if (!code || !userId) {
    console.error('[gbp-callback] Paramètres manquants — code:', !!code, '| state:', !!userId)
    return NextResponse.redirect(`${origin}/avis?gbp=denied`)
  }

  try {
    const supabase = await createClient()
    const redirectUri = gbpRedirectUri(origin)

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })
    const tokenText = await tokenRes.text()
    if (!tokenRes.ok) {
      console.error('[gbp-callback] Échange du code refusé :', tokenText)
      return NextResponse.redirect(`${origin}/avis?gbp=token-failed`)
    }
    const tokens = JSON.parse(tokenText)
    const expiresIn = typeof tokens.expires_in === 'number' ? tokens.expires_in : 3600
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

    // Email du compte Google connecté (info, best-effort)
    let googleEmail: string | null = null
    try {
      const u = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      })
      if (u.ok) googleEmail = (await u.json()).email ?? null
    } catch {}

    const { error } = await supabase.from('google_business_connections').upsert({
      user_id: userId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? null,
      expires_at: expiresAt,
      google_email: googleEmail,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })

    if (error) {
      console.error('[gbp-callback] Enregistrement refusé :', error.message)
      return NextResponse.redirect(`${origin}/avis?gbp=token-failed`)
    }

    console.log('[gbp-callback] OK — connecté :', googleEmail, '| refresh_token:', !!tokens.refresh_token)
    return NextResponse.redirect(`${origin}/avis?gbp=connected`)
  } catch (err: any) {
    console.error('[gbp-callback] Erreur :', err)
    return NextResponse.redirect(`${origin}/avis?gbp=token-failed`)
  }
}
