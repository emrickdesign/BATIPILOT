import { SupabaseClient } from '@supabase/supabase-js'

export async function getValidGmailToken(supabase: SupabaseClient, userId: string): Promise<{ accessToken: string; gmailEmail: string } | null> {
  const { data: conn } = await supabase
    .from('gmail_connections')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (!conn?.access_token_encrypted) return null

  let accessToken = conn.access_token_encrypted

  // Refresh si expiré (ou si on est à moins de 60s de l'expiration)
  const isExpired = conn.expires_at && new Date(conn.expires_at).getTime() < Date.now() + 60_000

  if (isExpired && conn.refresh_token_encrypted && conn.client_id && conn.client_secret) {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: conn.client_id,
        client_secret: conn.client_secret,
        refresh_token: conn.refresh_token_encrypted,
        grant_type: 'refresh_token',
      }),
    })

    if (res.ok) {
      const refreshed = await res.json()
      if (refreshed?.access_token) {
        accessToken = refreshed.access_token
        await supabase.from('gmail_connections').update({
          access_token_encrypted: refreshed.access_token,
          expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
        }).eq('user_id', userId)
      }
    }
  }

  return { accessToken, gmailEmail: conn.gmail_email || '' }
}
