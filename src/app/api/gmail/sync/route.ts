import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function refreshAccessToken(clientId: string, clientSecret: string, refreshToken: string) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) return null
  return res.json()
}

async function gmailFetch(url: string, accessToken: string) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) return null
  return res.json()
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

    const { data: conn } = await supabase
      .from('gmail_connections')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (!conn?.access_token_encrypted) {
      return NextResponse.json({ error: 'Gmail non connecté' }, { status: 400 })
    }

    let accessToken = conn.access_token_encrypted

    // Rafraîchir le token si expiré
    if (conn.expires_at && new Date(conn.expires_at) < new Date()) {
      if (conn.refresh_token_encrypted && conn.client_id && conn.client_secret) {
        const refreshed = await refreshAccessToken(conn.client_id, conn.client_secret, conn.refresh_token_encrypted)
        if (refreshed?.access_token) {
          accessToken = refreshed.access_token
          await supabase.from('gmail_connections').update({
            access_token_encrypted: refreshed.access_token,
            expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
          }).eq('user_id', user.id)
        }
      }
    }

    // Récupérer les 30 derniers emails (INBOX, dernières 48h)
    const after = Math.floor((Date.now() - 48 * 3600 * 1000) / 1000)
    const listRes = await gmailFetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=30&labelIds=INBOX&q=after:${after}`,
      accessToken
    )

    if (!listRes?.messages?.length) {
      return NextResponse.json({ synced: 0, message: 'Aucun nouvel email' })
    }

    // Récupérer les IDs déjà en base pour éviter les doublons
    const { data: existing } = await supabase
      .from('emails')
      .select('gmail_message_id')
      .eq('user_id', user.id)

    const existingIds = new Set((existing || []).map((e: any) => e.gmail_message_id))
    const newMessages = listRes.messages.filter((m: any) => !existingIds.has(m.id))

    if (!newMessages.length) {
      return NextResponse.json({ synced: 0, message: 'Tous les emails sont déjà synchronisés' })
    }

    // Traiter chaque email
    let synced = 0
    for (const msg of newMessages.slice(0, 15)) { // max 15 à la fois
      try {
        const detail = await gmailFetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
          accessToken
        )
        if (!detail) continue

        const headers = detail.payload?.headers || []
        const getHeader = (name: string) => headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || ''

        const from = getHeader('From')
        const fromMatch = from.match(/^(?:"?([^"<]*)"?\s*)?<?([^>]+)>?$/)
        const fromName = fromMatch?.[1]?.trim() || ''
        const fromEmail = fromMatch?.[2]?.trim() || from

        const subject = getHeader('Subject') || '(sans objet)'
        const dateStr = getHeader('Date')
        const receivedAt = dateStr ? new Date(dateStr).toISOString() : new Date().toISOString()

        // Extraire le texte du body
        let bodyText = ''
        const extractText = (part: any): string => {
          if (part.mimeType === 'text/plain' && part.body?.data) {
            return Buffer.from(part.body.data, 'base64').toString('utf-8')
          }
          if (part.parts) return part.parts.map(extractText).join('\n')
          return ''
        }
        bodyText = extractText(detail.payload)
        if (!bodyText && detail.payload?.body?.data) {
          bodyText = Buffer.from(detail.payload.body.data, 'base64').toString('utf-8')
        }
        bodyText = bodyText.slice(0, 2000) // Limiter pour l'IA

        // Classification IA
        let category = 'a_verifier'
        let importance = 'normal'
        let aiSummary = ''
        let aiAction = ''

        if (bodyText || subject) {
          try {
            const aiRes = await anthropic.messages.create({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 400,
              messages: [{
                role: 'user',
                content: `Analyse cet email d'un artisan du bâtiment et retourne uniquement ce JSON :
{"category":"demande_devis|client_a_repondre|relance_client|fournisseur|facture_recue|document_admin|pub_newsletter|spam|personnel|a_verifier","importance":"urgent|important|normal|faible|ignorer","summary":"1 phrase résumé","action":"action recommandée en 1 phrase ou null"}

De: ${fromName} <${fromEmail}>
Objet: ${subject}
Corps: ${bodyText.slice(0, 800)}`
              }],
            })
            const raw = aiRes.content[0].type === 'text' ? aiRes.content[0].text : ''
            const match = raw.match(/\{[\s\S]*\}/)
            if (match) {
              const parsed = JSON.parse(match[0])
              category = parsed.category || 'a_verifier'
              importance = parsed.importance || 'normal'
              aiSummary = parsed.summary || ''
              aiAction = parsed.action || ''
            }
          } catch {}
        }

        await supabase.from('emails').insert({
          user_id: user.id,
          gmail_message_id: msg.id,
          thread_id: detail.threadId || null,
          from_email: fromEmail,
          from_name: fromName,
          subject,
          body_text: bodyText,
          received_at: receivedAt,
          category,
          importance,
          ai_summary: aiSummary,
          ai_recommended_action: aiAction,
          status: 'non_traite',
        })
        synced++
      } catch (e) {
        console.error('Error processing message', msg.id, e)
      }
    }

    return NextResponse.json({ synced, total: newMessages.length })
  } catch (err: any) {
    console.error('Sync error:', err)
    return NextResponse.json({ error: err?.message || 'Erreur serveur' }, { status: 500 })
  }
}
