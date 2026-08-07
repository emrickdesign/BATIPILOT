import { SupabaseClient } from '@supabase/supabase-js'
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } from './google-oauth'

// Renvoie un access_token Business Profile valide (rafraîchi si expiré), ou null
// si l'utilisateur n'a pas connecté sa fiche Google.
export async function getValidGbpToken(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data: conn } = await supabase
    .from('google_business_connections')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (!conn?.access_token) return null
  let accessToken = conn.access_token as string

  const isExpired = conn.expires_at && new Date(conn.expires_at).getTime() < Date.now() + 60_000
  if (isExpired && conn.refresh_token && GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: conn.refresh_token,
        grant_type: 'refresh_token',
      }),
    })
    if (res.ok) {
      const r = await res.json()
      if (r?.access_token) {
        accessToken = r.access_token
        await supabase.from('google_business_connections').update({
          access_token: r.access_token,
          expires_at: new Date(Date.now() + (r.expires_in || 3600) * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('user_id', userId)
      }
    }
  }

  return accessToken
}
