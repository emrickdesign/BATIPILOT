import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { normalizeScanned, buildAchatsExtractionPrompt } from '@/lib/achats'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

type GmailPart = { filename?: string; mimeType?: string; body?: { attachmentId?: string; data?: string }; parts?: GmailPart[] }

// Cherche la première pièce jointe PDF dans un message Gmail (récursif).
function findPdfAttachment(part: GmailPart | undefined | null): { attachmentId: string; filename: string } | null {
  if (!part) return null
  const fn = part.filename || ''
  if (part.body?.attachmentId && (part.mimeType === 'application/pdf' || fn.toLowerCase().endsWith('.pdf'))) {
    return { attachmentId: part.body.attachmentId, filename: fn || 'document.pdf' }
  }
  if (Array.isArray(part.parts)) {
    for (const p of part.parts) {
      const found = findPdfAttachment(p)
      if (found) return found
    }
  }
  return null
}

async function gmailFetchAttachment(messageId: string, attachmentId: string, accessToken: string): Promise<Buffer | null> {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  if (!res.ok) return null
  const json = await res.json()
  if (!json?.data) return null
  return Buffer.from(String(json.data).replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

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

// Tente d'extraire le montant TTC d'une facture depuis le texte du mail.
// Heuristique volontairement prudente : renvoie 0 si rien de fiable (le montant
// est souvent dans le PDF joint) — la dépense reste « à vérifier » pour l'artisan.
function extractInvoiceAmount(text: string): number {
  if (!text) return 0
  const t = text.replace(/ /g, ' ')
  const parse = (s: string): number => {
    let x = s.replace(/\s/g, '')
    if (/,\d{2}$/.test(x)) x = x.replace(/\./g, '').replace(',', '.') // 1.234,56 → 1234.56
    else x = x.replace(/,/g, '')                                       // 1,234.56 → 1234.56
    const n = Number(x)
    return Number.isFinite(n) ? n : 0
  }
  const kw = t.match(/(?:total\s*ttc|net\s*à\s*payer|montant\s*(?:total|ttc)?|à\s*payer)[^0-9]{0,20}([0-9][0-9\s.,]*)\s*(?:€|eur)/i)
  if (kw) return parse(kw[1])
  const all = [...t.matchAll(/([0-9][0-9\s.,]*)\s*(?:€|eur)/gi)].map(m => parse(m[1])).filter(n => n > 0 && n < 1_000_000)
  return all.length ? Math.max(...all) : 0
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
{"category":"demande_devis|client_a_repondre|relance_client|fournisseur|facture_recue|bon_livraison|document_admin|pub_newsletter|spam|personnel|a_verifier","importance":"urgent|important|normal|faible|ignorer","summary":"1 phrase résumé","action":"action recommandée en 1 phrase ou null"}

Notes : "facture_recue" = facture d'un fournisseur de matériaux. "bon_livraison" = bon de livraison d'un fournisseur (liste de marchandise livrée, souvent en pièce jointe).

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

        const { data: insertedEmail } = await supabase.from('emails').insert({
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
        }).select('id').single()
        synced++

        // Facture / bon de livraison fournisseur reçu par email → entre dans le
        // système Achats (avec extraction du PDF joint). L'index unique
        // (user_id, source_email_id) empêche tout doublon au re-sync.
        if ((category === 'facture_recue' || category === 'bon_livraison') && insertedEmail?.id) {
          try {
            const docType = category === 'facture_recue' ? 'facture' : 'bl'

            // Extraction détaillée depuis le PDF joint si présent.
            let scanned = normalizeScanned({ supplier: fromName || fromEmail })
            let storagePath: string | null = null
            const att = findPdfAttachment(detail.payload)
            if (att) {
              const bytes = await gmailFetchAttachment(msg.id, att.attachmentId, accessToken)
              if (bytes) {
                const safe = att.filename.replace(/[^a-zA-Z0-9.\-_]/g, '_')
                storagePath = `achats/${user.id}/email-${Date.now()}-${safe}`
                await supabase.storage.from('documents').upload(storagePath, bytes, { contentType: 'application/pdf', upsert: false }).catch(() => {})
                try {
                  const ex = await anthropic.messages.create({
                    model: 'claude-sonnet-4-6',
                    max_tokens: 4096,
                    messages: [{ role: 'user', content: [
                      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: bytes.toString('base64') } },
                      { type: 'text', text: buildAchatsExtractionPrompt(docType) },
                    ] }],
                  })
                  const exText = ex.content[0]?.type === 'text' ? ex.content[0].text : ''
                  const jm = exText.match(/```json\n?([\s\S]*?)\n?```/) || exText.match(/(\{[\s\S]*\})/)
                  if (jm) scanned = normalizeScanned(JSON.parse(jm[1] || jm[0]))
                  if (!scanned.supplier) scanned.supplier = fromName || fromEmail
                } catch (e) { console.error('Extraction PDF email:', e) }
              }
            }

            // Facture → dépense (la facture, c'est la sortie d'argent). BL → pas de dépense.
            let expenseId: string | null = null
            if (docType === 'facture') {
              const ttc = scanned.total_ttc ?? extractInvoiceAmount(bodyText)
              const ht = scanned.total_ht ?? 0
              const { data: exp } = await supabase.from('expenses').insert({
                user_id: user.id,
                supplier: scanned.supplier || fromName || fromEmail,
                expense_date: scanned.doc_date || receivedAt.slice(0, 10),
                amount_ttc: ttc,
                amount_ht: ht,
                vat_amount: scanned.vat_amount ?? 0,
                category: 'Matériaux',
                ticket_number: scanned.doc_number,
                storage_path: storagePath,
                notes: `Facture reçue par email : ${subject}`.slice(0, 500),
                status: 'a_verifier',
                source: 'email',
                source_email_id: insertedEmail.id,
              }).select('id').single()
              expenseId = exp?.id ?? null
            }

            const { data: doc } = await supabase.from('supplier_documents').insert({
              user_id: user.id,
              doc_type: docType,
              supplier: scanned.supplier,
              doc_number: scanned.doc_number,
              doc_date: scanned.doc_date || receivedAt.slice(0, 10),
              total_ht: scanned.total_ht,
              total_ttc: scanned.total_ttc,
              vat_amount: scanned.vat_amount,
              storage_path: storagePath,
              source: 'email',
              source_email_id: insertedEmail.id,
              expense_id: expenseId,
              status: 'a_verifier',
            }).select('id').single()

            if (doc?.id && scanned.lines.length) {
              await supabase.from('supplier_document_lines').insert(
                scanned.lines.map((l, i) => ({ document_id: doc.id, user_id: user.id, ...l, sort_order: i })),
              )
            }
          } catch (e) {
            console.error('Ingestion achats email:', e)
          }
        }
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
