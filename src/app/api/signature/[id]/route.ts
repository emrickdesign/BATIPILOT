import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/service'
import { generateQuotePDF, generateInvoicePDF, type ClientSignatureInfo } from '@/lib/pdf-generator'
import { getValidGmailToken } from '@/lib/gmail-token'
import { sendGmailWithPdf } from '@/lib/gmail-send'
import { isProspect } from '@/lib/clients'
import type { ClientStatus } from '@/types'

const signSchema = z.object({
  signerName: z.string().trim().min(1).max(200),
  signerEmail: z.string().trim().max(200).optional(),
  signatureImage: z.string().startsWith('data:image/png;base64,'),
  consent: z.literal(true),
})

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return req.headers.get('x-real-ip') || 'inconnue'
}

// Route publique — pas de session (le client final n'a pas de compte BatiPilot).
// Sécurité : uuid non-devinable en URL, accès exclusivement via service_role (RLS
// contournée intentionnellement, même pattern que les URLs signées audio salarié).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const service = createServiceClient()

    const { data: sig } = await service.from('document_signatures').select('*').eq('id', id).single()
    if (!sig) return NextResponse.json({ error: 'Lien invalide' }, { status: 404 })
    if (sig.status === 'signee') return NextResponse.json({ error: 'Ce document a déjà été signé' }, { status: 409 })
    if (sig.status !== 'en_attente') return NextResponse.json({ error: "Ce lien n'est plus valide" }, { status: 410 })
    if (sig.expires_at && new Date(sig.expires_at) < new Date()) {
      await service.from('document_signatures').update({ status: 'expiree' }).eq('id', id)
      return NextResponse.json({ error: 'Ce lien a expiré' }, { status: 410 })
    }

    const body = await req.json().catch(() => null)
    const parsed = signSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Données invalides' }, { status: 400 })
    const { signerName, signerEmail, signatureImage } = parsed.data

    const ip = clientIp(req)
    const userAgent = req.headers.get('user-agent') || 'inconnu'
    const signedAt = new Date().toISOString()
    const imageBuffer = Buffer.from(signatureImage.split(',')[1] || '', 'base64')
    if (imageBuffer.length === 0) return NextResponse.json({ error: 'Signature vide' }, { status: 400 })

    let quote: any = null
    let invoice: any = null
    let company: any = null
    let clientRow: any = null

    if (sig.quote_id) {
      const [{ data: q }, { data: comp }] = await Promise.all([
        service.from('quotes').select('*, clients(*), quote_lines(*)').eq('id', sig.quote_id).single(),
        service.from('companies').select('*').eq('user_id', sig.user_id).single(),
      ])
      quote = q; company = comp; clientRow = q?.clients
    } else if (sig.invoice_id) {
      const [{ data: inv }, { data: comp }] = await Promise.all([
        service.from('invoices').select('*, clients(*), invoice_lines(*)').eq('id', sig.invoice_id).single(),
        service.from('companies').select('*').eq('user_id', sig.user_id).single(),
      ])
      invoice = inv; company = comp; clientRow = inv?.clients
    }
    if (!quote && !invoice) return NextResponse.json({ error: 'Document introuvable' }, { status: 404 })

    // Hash du document tel que présenté au signataire (preuve d'intégrité)
    const unsignedBuffer = quote ? await generateQuotePDF(quote, company) : await generateInvoicePDF(invoice, company)
    const documentHash = createHash('sha256').update(unsignedBuffer).digest('hex')

    const signaturePayload: ClientSignatureInfo = { name: signerName, signedAt, imageBuffer, hash: documentHash }
    const signedPdfBuffer = quote
      ? await generateQuotePDF(quote, company, signaturePayload)
      : await generateInvoicePDF(invoice, company, signaturePayload)

    const finalEmail = signerEmail || sig.signer_email

    await service.from('document_signatures').update({
      status: 'signee',
      signer_name: signerName,
      signer_email: finalEmail,
      signature_image: signatureImage,
      document_hash: documentHash,
      signed_at: signedAt,
      signer_ip: ip,
      signer_user_agent: userAgent,
    }).eq('id', id)

    if (quote) {
      await service.from('quotes').update({ status: 'accepte' }).eq('id', sig.quote_id).eq('user_id', sig.user_id)
      // Même effet que l'acceptation manuelle (QuoteActions) : le prospect atterrit dans « Accepté ».
      if (clientRow?.id && clientRow?.status && isProspect(clientRow.status as ClientStatus)) {
        await service.from('clients').update({ status: 'devis_accepte' }).eq('id', clientRow.id)
      }
    }

    // Notifications email — best-effort, la signature reste valide même si l'envoi échoue
    try {
      const gmailToken = await getValidGmailToken(service, sig.user_id)
      if (gmailToken) {
        const docNumber = quote ? quote.quote_number : invoice.invoice_number
        const docLabel = quote ? 'devis' : 'facture'
        const filename = `${docNumber}-signe.pdf`

        if (finalEmail) {
          await sendGmailWithPdf({
            accessToken: gmailToken.accessToken,
            fromEmail: gmailToken.gmailEmail,
            to: finalEmail,
            subject: `${quote ? 'Devis' : 'Facture'} ${docNumber} signé — votre copie`,
            htmlBody: `<p>Bonjour ${signerName},</p><p>Voici la copie signée de votre ${docLabel} <strong>${docNumber}</strong>.</p><p>Cordialement,<br>${company?.trade_name || ''}</p>`,
            pdfBuffer: signedPdfBuffer,
            filename,
          })
        }
        await sendGmailWithPdf({
          accessToken: gmailToken.accessToken,
          fromEmail: gmailToken.gmailEmail,
          to: gmailToken.gmailEmail,
          subject: `✓ ${quote ? 'Devis' : 'Facture'} ${docNumber} signé par ${signerName}`,
          htmlBody: `<p>${signerName} vient de signer le ${docLabel} <strong>${docNumber}</strong>.</p><p>Document signé en pièce jointe.</p>`,
          pdfBuffer: signedPdfBuffer,
          filename,
        })
      }
    } catch (mailErr) {
      console.error('Erreur envoi email confirmation signature:', mailErr)
    }

    // Notifie le dashboard entreprise en direct (même pattern broadcast que la messagerie)
    try {
      await service.channel(`document-signature:${id}`).send({ type: 'broadcast', event: 'signed', payload: { id, signedAt } })
    } catch {
      // best-effort
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Signature error:', err)
    return NextResponse.json({ error: err?.message || 'Erreur serveur' }, { status: 500 })
  }
}
