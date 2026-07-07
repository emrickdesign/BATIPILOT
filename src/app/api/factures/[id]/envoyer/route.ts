import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { generateInvoicePDF } from '@/lib/pdf-generator'
import { getValidGmailToken } from '@/lib/gmail-token'
import { sendGmailWithPdf } from '@/lib/gmail-send'

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

    // Demande de signature électronique (acquit de paiement) : réutilise une demande en attente
    // existante (re-envoi), sinon en crée une nouvelle.
    const { data: existingSig } = await supabase
      .from('document_signatures')
      .select('id')
      .eq('invoice_id', id)
      .eq('status', 'en_attente')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    let signatureId: string
    if (existingSig) {
      signatureId = existingSig.id
      await supabase.from('document_signatures').update({
        signer_name: clientName,
        signer_email: client.email,
        sent_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      }).eq('id', signatureId)
    } else {
      const { data: created, error: sigError } = await supabase
        .from('document_signatures')
        .insert({ user_id: user.id, invoice_id: id, signer_name: clientName, signer_email: client.email })
        .select('id')
        .single()
      if (sigError || !created) return NextResponse.json({ error: 'Erreur création demande de signature' }, { status: 500 })
      signatureId = created.id
    }
    const signUrl = `${req.nextUrl.origin}/signature/${signatureId}`

    // Générer le PDF (version non signée, jointe pour référence)
    const pdfBuffer = await generateInvoicePDF(invoice, company)

    const htmlBody = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>body{font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:600px;margin:0 auto;padding:20px}
.header{background:${primaryColor};color:white;padding:20px 24px;border-radius:8px 8px 0 0}
.body{background:#f8f9fa;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px}
.amount{font-size:24px;font-weight:bold;color:#dc2626;margin:12px 0}
.iban{background:#eff6ff;padding:14px;border-radius:8px;font-size:13px;color:#1e40af;margin:16px 0}
.warn{background:#fef3c7;padding:14px;border-radius:8px;font-size:13px;color:#92400e;margin:16px 0}
.cta{display:inline-block;background:${primaryColor};color:white;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:bold;margin:16px 0}
</style></head><body>
<div class="header"><h2 style="margin:0">Facture ${invoice.invoice_number}</h2><p style="margin:4px 0 0;opacity:.8">${company?.trade_name || ''}</p></div>
<div class="body">
<p>Bonjour ${clientName},</p>
<p>Veuillez trouver votre facture <strong>${invoice.invoice_number}</strong> (copie PDF jointe pour référence).</p>
<div class="amount">Reste à payer : ${fmt(invoice.amount_due)}</div>
${invoice.due_date ? `<div class="warn">⏰ Règlement à effectuer avant le <strong>${new Date(invoice.due_date).toLocaleDateString('fr-FR')}</strong></div>` : ''}
<div style="text-align:center"><a href="${signUrl}" class="cta">✍️ Consulter et signer en ligne</a></div>
<p style="font-size:12px;color:#999;text-align:center">Lien personnel, valable 30 jours.</p>
${company?.iban ? `<div class="iban"><strong>Coordonnées bancaires :</strong><br>IBAN : ${company.iban}</div>` : ''}
<p>N'hésitez pas à nous contacter pour toute question.</p>
<p>Cordialement,<br><strong>${company?.trade_name || ''}</strong><br>${company?.phone || ''}</p>
</div></body></html>`

    const sent = await sendGmailWithPdf({
      accessToken: gmailToken.accessToken,
      fromEmail: gmailToken.gmailEmail,
      to: client.email,
      subject: `Facture ${invoice.invoice_number} - ${company?.trade_name || 'Votre artisan'}`,
      htmlBody,
      pdfBuffer,
      filename: `${invoice.invoice_number}.pdf`,
    })

    if (!sent.ok) {
      console.error('Gmail send error:', sent.error)
      return NextResponse.json({ error: 'Erreur envoi Gmail' }, { status: 502 })
    }

    await supabase.from('invoices').update({ status: 'envoyee' }).eq('id', id)
    return NextResponse.json({ success: true, signUrl })
  } catch (err: any) {
    console.error('Envoyer facture error:', err)
    return NextResponse.json({ error: err?.message || 'Erreur serveur' }, { status: 500 })
  }
}
