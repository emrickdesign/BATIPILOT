import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getValidGmailToken } from '@/lib/gmail-token'
import { sendGmailHtml } from '@/lib/gmail-send'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

    const [{ data: quote }, { data: company }, gmailToken] = await Promise.all([
      supabase.from('quotes').select('*, clients(*), quote_lines(*)').eq('id', id).eq('user_id', user.id).single(),
      supabase.from('companies').select('*').eq('user_id', user.id).single(),
      getValidGmailToken(supabase, user.id),
    ])

    if (!quote) return NextResponse.json({ error: 'Devis introuvable' }, { status: 404 })
    const client = quote.clients as any
    if (!client?.email) return NextResponse.json({ error: "Ce client n'a pas d'adresse email" }, { status: 400 })
    if (!gmailToken) return NextResponse.json({ error: 'Gmail non connecté' }, { status: 400 })

    const clientName = client.type === 'professionnel'
      ? client.company_name
      : `${client.first_name || ''} ${client.last_name || ''}`.trim() || 'Client'
    const fmt = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)
    const tmpl = (company as any)?.template_style || {}
    const primaryColor = tmpl.primary_color || '#1a1a2e'

    // Demande de signature électronique : réutilise une demande en attente existante (re-envoi),
    // sinon en crée une nouvelle. Le lien public /signature/{id} est sécurisé par cet uuid seul.
    const { data: existingSig } = await supabase
      .from('document_signatures')
      .select('id')
      .eq('quote_id', id)
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
        .insert({ user_id: user.id, quote_id: id, signer_name: clientName, signer_email: client.email })
        .select('id')
        .single()
      if (sigError || !created) return NextResponse.json({ error: 'Erreur création demande de signature' }, { status: 500 })
      signatureId = created.id
    }
    const signUrl = `${req.nextUrl.origin}/signature/${signatureId}`

    // Corps HTML de l'email (léger, avec CTA vers la signature en ligne — le devis complet
    // est consultable et signable sur la page, pas besoin de PDF joint à ce stade)
    const htmlBody = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>body{font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:600px;margin:0 auto;padding:20px}
.header{background:${primaryColor};color:white;padding:20px 24px;border-radius:8px 8px 0 0}
.body{background:#f8f9fa;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px}
.amount{font-size:24px;font-weight:bold;color:${primaryColor};margin:12px 0}
.note{background:#eff6ff;padding:14px;border-radius:8px;font-size:13px;color:#374151;margin:16px 0}
.cta{display:inline-block;background:${primaryColor};color:white;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:bold;margin:16px 0}
</style></head><body>
<div class="header"><h2 style="margin:0">Devis ${quote.quote_number}</h2><p style="margin:4px 0 0;opacity:.8">${company?.trade_name || ''}</p></div>
<div class="body">
<p>Bonjour ${clientName},</p>
<p>Votre devis <strong>${quote.quote_number}</strong>${quote.title ? ` pour : <em>${quote.title}</em>` : ''} est prêt à consulter et signer en ligne.</p>
<div class="amount">${fmt(quote.total_ttc)} TTC</div>
${quote.valid_until ? `<p style="color:#666;font-size:13px">Valable jusqu'au ${new Date(quote.valid_until).toLocaleDateString('fr-FR')}</p>` : ''}
<div style="text-align:center"><a href="${signUrl}" class="cta">✍️ Consulter et signer en ligne</a></div>
<p style="font-size:12px;color:#999;text-align:center">Lien personnel, valable 30 jours.</p>
${quote.notes ? `<div class="note"><strong>Modalités de paiement :</strong><br>${quote.notes}</div>` : ''}
<p>N'hésitez pas à nous contacter pour toute question.</p>
<p>Cordialement,<br><strong>${company?.trade_name || ''}</strong><br>${company?.phone || ''}</p>
</div></body></html>`

    const sent = await sendGmailHtml({
      accessToken: gmailToken.accessToken,
      fromEmail: gmailToken.gmailEmail,
      to: client.email,
      subject: `Devis ${quote.quote_number} - ${company?.trade_name || 'Votre artisan'}`,
      htmlBody,
    })

    if (!sent.ok) {
      console.error('Gmail send error:', sent.error)
      return NextResponse.json({ error: 'Erreur envoi Gmail' }, { status: 502 })
    }

    // On (re)démarre le compteur de relances : sent_at sert de référence aux relances auto (7j/14j).
    await supabase.from('quotes').update({
      status: 'envoye',
      sent_at: new Date().toISOString(),
      reminder_count: 0,
      reminded_at: null,
    }).eq('id', id)

    // Fait avancer le prospect dans le pipeline (board Prospects) → « Devis envoyé ».
    if (client?.id) {
      await supabase.from('clients').update({ status: 'devis_envoye' })
        .eq('id', client.id).in('status', ['nouveau', 'infos_a_recuperer', 'devis_a_faire'])
    }

    return NextResponse.json({ success: true, signUrl })
  } catch (err: any) {
    console.error('Envoyer devis error:', err)
    return NextResponse.json({ error: err?.message || 'Erreur serveur' }, { status: 500 })
  }
}
