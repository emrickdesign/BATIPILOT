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

    const [{ data: contract }, { data: company }, gmailToken] = await Promise.all([
      supabase.from('subcontractor_contracts').select('*, subcontractors(*)').eq('id', id).eq('user_id', user.id).single(),
      supabase.from('companies').select('*').eq('user_id', user.id).single(),
      getValidGmailToken(supabase, user.id),
    ])

    if (!contract) return NextResponse.json({ error: 'Contrat introuvable' }, { status: 404 })
    const sub = contract.subcontractors as { company_name?: string; email?: string } | null
    if (!sub?.email) return NextResponse.json({ error: "Ce sous-traitant n'a pas d'adresse email" }, { status: 400 })
    if (!gmailToken) return NextResponse.json({ error: 'Gmail non connecté' }, { status: 400 })

    const signerName = sub.company_name || 'Sous-traitant'
    const tmpl = (company as { template_style?: { primary_color?: string } } | null)?.template_style || {}
    const primaryColor = tmpl.primary_color || '#1a1a2e'

    // Réutilise une demande en attente existante (renvoi), sinon en crée une.
    const { data: existingSig } = await supabase
      .from('document_signatures')
      .select('id')
      .eq('contract_id', id)
      .eq('status', 'en_attente')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    let signatureId: string
    if (existingSig) {
      signatureId = existingSig.id
      await supabase.from('document_signatures').update({
        signer_name: signerName,
        signer_email: sub.email,
        sent_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      }).eq('id', signatureId)
    } else {
      const { data: created, error: sigError } = await supabase
        .from('document_signatures')
        .insert({ user_id: user.id, contract_id: id, signer_name: signerName, signer_email: sub.email })
        .select('id')
        .single()
      if (sigError || !created) return NextResponse.json({ error: 'Erreur création demande de signature' }, { status: 500 })
      signatureId = created.id
    }
    const signUrl = `${req.nextUrl.origin}/signature/${signatureId}`

    const htmlBody = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>body{font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:600px;margin:0 auto;padding:20px}
.header{background:${primaryColor};color:white;padding:20px 24px;border-radius:8px 8px 0 0}
.body{background:#f8f9fa;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px}
.cta{display:inline-block;background:${primaryColor};color:white;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:bold;margin:16px 0}
</style></head><body>
<div class="header"><h2 style="margin:0">Contrat de sous-traitance</h2><p style="margin:4px 0 0;opacity:.8">${company?.trade_name || ''}</p></div>
<div class="body">
<p>Bonjour ${signerName},</p>
<p>Veuillez trouver le contrat de sous-traitance${contract.title ? ` pour : <em>${contract.title}</em>` : ''}, à consulter et signer en ligne.</p>
<div style="text-align:center"><a href="${signUrl}" class="cta">✍️ Consulter et signer le contrat</a></div>
<p style="font-size:12px;color:#999;text-align:center">Lien personnel, valable 30 jours.</p>
<p>Cordialement,<br><strong>${company?.trade_name || ''}</strong><br>${company?.phone || ''}</p>
</div></body></html>`

    const sent = await sendGmailHtml({
      accessToken: gmailToken.accessToken,
      fromEmail: gmailToken.gmailEmail,
      to: sub.email,
      subject: `Contrat de sous-traitance — ${company?.trade_name || ''}`,
      htmlBody,
    })
    if (!sent.ok) {
      console.error('Gmail send error (contrat ST):', sent.error)
      return NextResponse.json({ error: 'Erreur envoi Gmail' }, { status: 502 })
    }

    return NextResponse.json({ success: true, signUrl })
  } catch (err) {
    console.error('Envoyer contrat ST error:', err)
    return NextResponse.json({ error: (err as Error)?.message || 'Erreur serveur' }, { status: 500 })
  }
}
