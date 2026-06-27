import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function classifyByKeywords(subject: string, fromEmail: string) {
  const sub = (subject || '').toLowerCase()
  const from = (fromEmail || '').toLowerCase()
  if (from.includes('noreply') || from.includes('no-reply') || from.includes('newsletter') || from.includes('notification') || from.includes('promo') || from.includes('marketing')) {
    return { category: 'pub_newsletter', importance: 'ignorer', summary: 'Email automatique ou newsletter', action: null }
  }
  if (sub.includes('facture') || sub.includes('invoice') || sub.includes('receipt') || sub.includes('avoir') || sub.includes('reçu')) {
    return { category: 'facture_recue', importance: 'normal', summary: 'Document de facturation', action: 'Vérifier et archiver' }
  }
  if (sub.includes('devis') || sub.includes('estimation') || sub.includes('quote') || sub.includes('demande de prix')) {
    return { category: 'demande_devis', importance: 'important', summary: 'Demande ou document de devis', action: 'Traiter le devis' }
  }
  if (sub.includes('relance') || sub.includes('rappel') || sub.includes('reminder') || sub.includes('urgent')) {
    return { category: 'relance_client', importance: 'important', summary: 'Relance ou rappel', action: 'Répondre rapidement' }
  }
  if (sub.includes('commande') || sub.includes('livraison') || sub.includes('expedition') || sub.includes('bon de commande')) {
    return { category: 'fournisseur', importance: 'normal', summary: 'Commande ou livraison fournisseur', action: null }
  }
  if (sub.includes('contrat') || sub.includes('attestation') || sub.includes('cerfa') || sub.includes('assurance') || sub.includes('déclaration')) {
    return { category: 'document_admin', importance: 'normal', summary: 'Document administratif', action: 'Archiver' }
  }
  return { category: 'a_verifier', importance: 'faible', summary: '', action: null }
}

async function classifyWithAI(subject: string, fromName: string, fromEmail: string, bodyText: string) {
  try {
    const aiRes = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `Analyse cet email d'un artisan du bâtiment et retourne uniquement ce JSON :
{"category":"demande_devis|client_a_repondre|relance_client|fournisseur|facture_recue|document_admin|pub_newsletter|spam|personnel|a_verifier","importance":"urgent|important|normal|faible|ignorer","summary":"1 phrase résumé","action":"action recommandée en 1 phrase ou null"}

De: ${fromName} <${fromEmail}>
Objet: ${subject}
Corps: ${bodyText.slice(0, 600)}`
      }],
    })
    const raw = aiRes.content[0].type === 'text' ? aiRes.content[0].text : ''
    const match = raw.match(/\{[\s\S]*\}/)
    if (match) return JSON.parse(match[0])
  } catch {}
  return classifyByKeywords(subject, fromEmail)
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Non connecté', { status: 401 })

  const { data: conn } = await supabase.from('gmail_connections').select('*').eq('user_id', user.id).single()
  if (!conn?.access_token_encrypted) return new Response('Gmail non connecté', { status: 400 })

  let accessToken = conn.access_token_encrypted

  if (conn.expires_at && new Date(conn.expires_at) < new Date()) {
    if (conn.refresh_token_encrypted && conn.client_id && conn.client_secret) {
      const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: conn.client_id, client_secret: conn.client_secret,
          refresh_token: conn.refresh_token_encrypted, grant_type: 'refresh_token',
        }),
      })
      if (refreshRes.ok) {
        const refreshed = await refreshRes.json()
        if (refreshed?.access_token) {
          accessToken = refreshed.access_token
          await supabase.from('gmail_connections').update({
            access_token_encrypted: refreshed.access_token,
            expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
          }).eq('user_id', user.id)
        }
      }
    }
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)) } catch {}
      }

      try {
        send({ type: 'status', message: 'Scan de votre boîte Gmail en cours...' })

        // Paginer tous les IDs
        const allIds: string[] = []
        let pageToken: string | undefined
        do {
          const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages')
          url.searchParams.set('maxResults', '500')
          url.searchParams.set('labelIds', 'INBOX')
          if (pageToken) url.searchParams.set('pageToken', pageToken)

          const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } })
          if (!res.ok) { send({ type: 'error', message: 'Erreur Gmail API' }); controller.close(); return }

          const page = await res.json()
          if (page.messages) allIds.push(...page.messages.map((m: any) => m.id))
          pageToken = page.nextPageToken
          send({ type: 'scanning', found: allIds.length })
        } while (pageToken)

        send({ type: 'found', total: allIds.length })

        // Filtrer déjà synchronisés
        const { data: existing } = await supabase.from('emails').select('gmail_message_id').eq('user_id', user.id)
        const existingIds = new Set((existing || []).map((e: any) => e.gmail_message_id))
        const toProcess = allIds.filter(id => !existingIds.has(id))

        if (toProcess.length === 0) {
          send({ type: 'done', synced: 0, message: 'Votre boîte est déjà à jour !' })
          controller.close()
          return
        }

        send({ type: 'toprocess', count: toProcess.length })

        const ninetyDaysAgo = Date.now() - 90 * 24 * 3600 * 1000
        let synced = 0
        const BATCH = 5

        for (let i = 0; i < toProcess.length; i += BATCH) {
          const batch = toProcess.slice(i, i + BATCH)

          await Promise.all(batch.map(async (msgId) => {
            try {
              const res = await fetch(
                `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=full`,
                { headers: { Authorization: `Bearer ${accessToken}` } }
              )
              if (!res.ok) return

              const detail = await res.json()
              const headers = detail.payload?.headers || []
              const getH = (name: string) => headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || ''

              const from = getH('From')
              const fm = from.match(/^(?:"?([^"<]*)"?\s*)?<?([^>]+)>?$/)
              const fromName = fm?.[1]?.trim() || ''
              const fromEmail = fm?.[2]?.trim() || from
              const subject = getH('Subject') || '(sans objet)'
              const dateStr = getH('Date')
              const receivedAt = dateStr ? new Date(dateStr).toISOString() : new Date().toISOString()

              let bodyText = ''
              const extractText = (part: any): string => {
                if (part.mimeType === 'text/plain' && part.body?.data) return Buffer.from(part.body.data, 'base64').toString('utf-8')
                if (part.parts) return part.parts.map(extractText).join('\n')
                return ''
              }
              bodyText = extractText(detail.payload)
              if (!bodyText && detail.payload?.body?.data) bodyText = Buffer.from(detail.payload.body.data, 'base64').toString('utf-8')
              bodyText = bodyText.slice(0, 1500)

              const useAI = new Date(receivedAt).getTime() > ninetyDaysAgo
              const cls = useAI
                ? await classifyWithAI(subject, fromName, fromEmail, bodyText)
                : classifyByKeywords(subject, fromEmail)

              await supabase.from('emails').insert({
                user_id: user.id,
                gmail_message_id: msgId,
                thread_id: detail.threadId || null,
                from_email: fromEmail,
                from_name: fromName,
                subject,
                body_text: bodyText,
                received_at: receivedAt,
                category: cls.category || 'a_verifier',
                importance: cls.importance || 'normal',
                ai_summary: cls.summary || '',
                ai_recommended_action: cls.action || null,
                status: 'non_traite',
              })
              synced++
            } catch {}
          }))

          send({ type: 'progress', processed: Math.min(i + BATCH, toProcess.length), total: toProcess.length, synced })
          await new Promise(r => setTimeout(r, 50))
        }

        send({ type: 'done', synced, total: toProcess.length })
      } catch (err: any) {
        send({ type: 'error', message: err?.message || 'Erreur inattendue' })
      }

      controller.close()
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  })
}
