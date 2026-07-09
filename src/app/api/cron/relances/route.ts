import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getValidGmailToken } from '@/lib/gmail-token'
import { sendGmailHtml } from '@/lib/gmail-send'

// Chrono universel des relances de devis (Vercel Cron, 1×/jour).
// Un devis resté au statut « envoyé » (donc NON signé électroniquement — la signature
// le fait passer en « accepté ») est relancé automatiquement :
//   • 7 jours sans réponse  → relance n°1
//   • 14 jours sans réponse → relance n°2
// Au-delà de 2 relances, ou si le devis est expiré (valid_until dépassé), on n'envoie plus.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const DAY = 86_400_000
const fmt = (n: number | string) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(n) || 0)

// Seuils (jours) indexés par nombre de relances déjà envoyées.
const THRESHOLDS = [7, 14]

type ClientRow = {
  id?: string; email?: string | null; type?: string | null
  company_name?: string | null; first_name?: string | null; last_name?: string | null
}
type QuoteRow = {
  id: string; user_id: string; quote_number: string; title: string | null
  total_ttc: number | string; valid_until: string | null; issue_date: string | null
  sent_at: string | null; reminder_count: number; clients: ClientRow | null
}
type CompanyRow = {
  trade_name?: string | null; phone?: string | null
  template_style?: { primary_color?: string } | null
} | null

function buildEmail(opts: {
  quote: QuoteRow; company: CompanyRow; clientName: string; signUrl: string; reminderNo: number
}): { subject: string; htmlBody: string } {
  const { quote, company, clientName, signUrl, reminderNo } = opts
  const primaryColor = (company?.template_style?.primary_color as string) || '#1a1a2e'
  const trade = company?.trade_name || 'Votre artisan'
  const relance = reminderNo === 1
    ? "Nous n'avons pas encore eu votre retour sur ce devis."
    : "Sauf erreur de notre part, ce devis est toujours en attente de votre décision."
  const subject = `Relance — devis ${quote.quote_number} · ${trade}`
  const htmlBody = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>body{font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:600px;margin:0 auto;padding:20px}
.header{background:${primaryColor};color:white;padding:20px 24px;border-radius:8px 8px 0 0}
.body{background:#f8f9fa;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px}
.amount{font-size:24px;font-weight:bold;color:${primaryColor};margin:12px 0}
.cta{display:inline-block;background:${primaryColor};color:white;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:bold;margin:16px 0}
</style></head><body>
<div class="header"><h2 style="margin:0">Devis ${quote.quote_number}</h2><p style="margin:4px 0 0;opacity:.8">${trade}</p></div>
<div class="body">
<p>Bonjour ${clientName},</p>
<p>${relance}</p>
<p>Votre devis <strong>${quote.quote_number}</strong>${quote.title ? ` pour : <em>${quote.title}</em>` : ''} reste consultable et signable en ligne :</p>
<div class="amount">${fmt(quote.total_ttc)} TTC</div>
${quote.valid_until ? `<p style="color:#666;font-size:13px">Valable jusqu'au ${new Date(quote.valid_until).toLocaleDateString('fr-FR')}</p>` : ''}
<div style="text-align:center"><a href="${signUrl}" class="cta">✍️ Consulter et signer en ligne</a></div>
<p style="font-size:12px;color:#999;text-align:center">Lien personnel.</p>
<p>Nous restons à votre disposition pour toute question ou ajustement.</p>
<p>Cordialement,<br><strong>${trade}</strong>${company?.phone ? `<br>${company.phone}` : ''}</p>
</div></body></html>`
  return { subject, htmlBody }
}

async function runRelances(req: NextRequest) {
  // Sécurité : Vercel Cron envoie « Authorization: Bearer <CRON_SECRET> ».
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  // Mode simulation : compte les relances dues sans rien envoyer ni modifier.
  const dryRun = req.nextUrl.searchParams.get('dryRun') === '1'

  const service = createServiceClient()
  const today = new Date().toISOString().split('T')[0]
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin

  const { data: quotes, error } = await service
    .from('quotes')
    .select('id, user_id, quote_number, title, total_ttc, valid_until, issue_date, sent_at, reminder_count, clients(*)')
    .eq('status', 'envoye')
    .lt('reminder_count', THRESHOLDS.length)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const companyCache = new Map<string, CompanyRow>()
  const tokenCache = new Map<string, { accessToken: string; gmailEmail: string } | null>()
  const getCompany = async (userId: string): Promise<CompanyRow> => {
    if (!companyCache.has(userId)) {
      const { data } = await service.from('companies').select('*').eq('user_id', userId).single()
      companyCache.set(userId, (data as CompanyRow) ?? null)
    }
    return companyCache.get(userId) ?? null
  }
  const getToken = async (userId: string) => {
    if (!tokenCache.has(userId)) tokenCache.set(userId, await getValidGmailToken(service, userId))
    return tokenCache.get(userId)!
  }

  let sent = 0
  const skipped: Record<string, number> = {}
  const bump = (k: string) => { skipped[k] = (skipped[k] || 0) + 1 }

  for (const q of (quotes || []) as unknown as QuoteRow[]) {
    const client = q.clients
    // Devis expiré → on ne relance plus
    if (q.valid_until && q.valid_until < today) { bump('expire'); continue }
    if (!client?.email) { bump('sans_email'); continue }
    const clientEmail: string = client.email

    const ref = q.sent_at || q.issue_date
    if (!ref) { bump('sans_date'); continue }
    const days = Math.floor((Date.now() - new Date(ref).getTime()) / DAY)
    const threshold = THRESHOLDS[q.reminder_count]
    if (days < threshold) { bump('pas_encore_du'); continue }

    if (dryRun) { sent++; continue }

    const token = await getToken(q.user_id)
    if (!token) { bump('gmail_non_connecte'); continue }
    const company = await getCompany(q.user_id)

    const clientName = (client.type === 'professionnel'
      ? client.company_name
      : `${client.first_name || ''} ${client.last_name || ''}`.trim()) || 'Client'

    // Lien de signature : réutilise la demande en attente, sinon en crée une.
    let signatureId: string | null = null
    const { data: sig } = await service
      .from('document_signatures')
      .select('id')
      .eq('quote_id', q.id)
      .eq('status', 'en_attente')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (sig) {
      signatureId = sig.id
      await service.from('document_signatures')
        .update({ expires_at: new Date(Date.now() + 30 * DAY).toISOString() })
        .eq('id', signatureId)
    } else {
      const { data: created } = await service
        .from('document_signatures')
        .insert({ user_id: q.user_id, quote_id: q.id, signer_name: clientName, signer_email: clientEmail })
        .select('id')
        .single()
      signatureId = created?.id ?? null
    }
    if (!signatureId) { bump('erreur_signature'); continue }

    const { subject, htmlBody } = buildEmail({
      quote: q, company, clientName,
      signUrl: `${baseUrl}/signature/${signatureId}`,
      reminderNo: q.reminder_count + 1,
    })

    const res = await sendGmailHtml({
      accessToken: token.accessToken,
      fromEmail: token.gmailEmail,
      to: clientEmail,
      subject,
      htmlBody,
    })
    if (!res.ok) { bump('erreur_envoi'); continue }

    await service.from('quotes').update({
      reminder_count: q.reminder_count + 1,
      reminded_at: new Date().toISOString(),
    }).eq('id', q.id)
    sent++
  }

  return NextResponse.json({ ok: true, dryRun, sent, examined: quotes?.length || 0, skipped })
}

export async function GET(req: NextRequest) {
  return runRelances(req)
}
