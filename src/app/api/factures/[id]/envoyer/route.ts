import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { generateInvoicePDF } from '@/lib/pdf-generator'
import { getValidGmailToken } from '@/lib/gmail-token'

function encodeSubject(s: string) {
  return /[^\x00-\x7F]/.test(s) ? `=?UTF-8?B?${Buffer.from(s).toString('base64')}?=` : s
}

function buildMultipartEmail(from: string, to: string, subject: string, htmlBody: string, pdfBuffer: Buffer, filename: string) {
  const boundary = `----BatiPilot${Date.now()}`
  const parts = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset=utf-8`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    htmlBody,
    ``,
    `--${boundary}`,
    `Content-Type: application/pdf`,
    `Content-Disposition: attachment; filename="${filename}"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    pdfBuffer.toString('base64').match(/.{1,76}/g)!.join('\r\n'),
    ``,
    `--${boundary}--`,
  ].join('\r\n')
  return Buffer.from(parts).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

    const [{ data: invoice }, { data: company }, gmailToken] = await Promise.all([
      supabase.from('invoices').select('*, clients(*), invoice_lines(*)').eq('id', id).eq('user_id', user.id).single(),
      supabase.from('companies').select('*').eq('user_id', user.id).single(),
      getValidGmailToken(supabase, user.id),
    ])

    if (!invoice) return NextResponse.json({ error: 'Facture introuvable' }, { status: 404 })
    const client = invoice.clients as any
    if (!client?.email) return NextResponse.json({ error: "Ce client n'a pas d'adresse email" }, { status: 400 })
    if (!gmailToken) return NextResponse.json({ error: 'Gmail non connecté' }, { status: 400 })

    const clientName = client.type === 'professionnel'
      ? client.company_name
      : `${client.first_name || ''} ${client.last_name || ''}`.trim() || 'Client'
    const fmt = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)
    const tmpl = (company as any)?.template_style || {}
    const primaryColor = tmpl.primary_color || '#1a1a2e'

    // Générer le PDF
    const pdfBuffer = await generateInvoicePDF(invoice, company)

    const htmlBody = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>body{font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:600px;margin:0 auto;padding:20px}
.header{background:${primaryColor};color:white;padding:20px 24px;border-radius:8px 8px 0 0}
.body{background:#f8f9fa;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px}
.amount{font-size:24px;font-weight:bold;color:#dc2626;margin:12px 0}
.iban{background:#eff6ff;padding:14px;border-radius:8px;font-size:13px;color:#1e40af;margin:16px 0}
.warn{background:#fef3c7;padding:14px;border-radius:8px;font-size:13px;color:#92400e;margin:16px 0}
</style></head><body>
<div class="header"><h2 style="margin:0">Facture ${invoice.invoice_number}</h2><p style="margin:4px 0 0;opacity:.8">${company?.trade_name || ''}</p></div>
<div class="body">
<p>Bonjour ${clientName},</p>
<p>Veuillez trouver en pièce jointe votre facture <strong>${invoice.invoice_number}</strong>.</p>
<div class="amount">Reste à payer : ${fmt(invoice.amount_due)}</div>
${invoice.due_date ? `<div class="warn">⏰ Règlement à effectuer avant le <strong>${new Date(invoice.due_date).toLocaleDateString('fr-FR')}</strong></div>` : ''}
${company?.iban ? `<div class="iban"><strong>Coordonnées bancaires :</strong><br>IBAN : ${company.iban}</div>` : ''}
<p>N'hésitez pas à nous contacter pour toute question.</p>
<p>Cordialement,<br><strong>${company?.trade_name || ''}</strong><br>${company?.phone || ''}</p>
</div></body></html>`

    const subject = encodeSubject(`Facture ${invoice.invoice_number} - ${company?.trade_name || 'Votre artisan'}`)
    const encoded = buildMultipartEmail(gmailToken.gmailEmail, client.email, subject, htmlBody, pdfBuffer, `${invoice.invoice_number}.pdf`)

    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${gmailToken.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: encoded }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('Gmail send error:', err)
      return NextResponse.json({ error: 'Erreur envoi Gmail' }, { status: 502 })
    }

    await supabase.from('invoices').update({ status: 'envoyee' }).eq('id', id)
    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Envoyer facture error:', err)
    return NextResponse.json({ error: err?.message || 'Erreur serveur' }, { status: 500 })
  }
}
