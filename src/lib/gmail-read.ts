// Lecture Gmail EN DIRECT (rapide, lecture seule) pour l'assistant : renvoie les
// vrais derniers mails de la boîte, sans dépendre de la table locale `emails`
// (qui n'est fraîche qu'après une synchro complète).

import type { SupabaseClient } from '@supabase/supabase-js'

async function refreshAccessToken(clientId: string, clientSecret: string, refreshToken: string) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
  })
  if (!res.ok) return null
  return res.json() as Promise<{ access_token: string; expires_in: number }>
}

// Jeton Gmail valide (rafraîchi si expiré). null si Gmail non connecté.
export async function getGmailAccessToken(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data: conn } = await supabase.from('gmail_connections').select('*').eq('user_id', userId).single()
  if (!conn?.access_token_encrypted) return null
  let token: string = conn.access_token_encrypted
  if (conn.expires_at && new Date(conn.expires_at) < new Date() && conn.refresh_token_encrypted && conn.client_id && conn.client_secret) {
    const r = await refreshAccessToken(conn.client_id, conn.client_secret, conn.refresh_token_encrypted)
    if (r?.access_token) {
      token = r.access_token
      await supabase.from('gmail_connections').update({
        access_token_encrypted: r.access_token,
        expires_at: new Date(Date.now() + r.expires_in * 1000).toISOString(),
      }).eq('user_id', userId)
    }
  }
  return token
}

export type RecentMail = { from: string; subject: string; dateMs: number }

// Les N derniers mails de l'INBOX, triés du plus récent au plus ancien.
export async function fetchRecentInbox(accessToken: string, n = 5): Promise<RecentMail[]> {
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${n}&labelIds=INBOX`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  if (!listRes.ok) return []
  const list = await listRes.json() as { messages?: { id: string }[] }
  const ids = (list.messages || []).map(m => m.id)
  if (!ids.length) return []

  const mails = await Promise.all(ids.map(async id => {
    const r = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    if (!r.ok) return null
    const msg = await r.json() as { internalDate?: string; payload?: { headers?: { name: string; value: string }[] } }
    const h = (name: string) => msg.payload?.headers?.find(x => x.name.toLowerCase() === name.toLowerCase())?.value || ''
    const rawFrom = h('From')
    const from = rawFrom.replace(/<[^>]*>/, '').replace(/"/g, '').trim() || rawFrom || 'Expéditeur inconnu'
    return { from, subject: h('Subject') || '(sans objet)', dateMs: Number(msg.internalDate) || 0 } as RecentMail
  }))

  return mails.filter((m): m is RecentMail => m !== null).sort((a, b) => b.dateMs - a.dateMs)
}
