import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getValidGmailToken } from '@/lib/gmail-token'
import { sendGmailHtml } from '@/lib/gmail-send'
import { relanceCopy } from '@/lib/relances'

// Relance manuelle d'un devis « envoyé » : message adapté à la position dans la validité,
// envoyé par email (Gmail) ou renvoyé comme lien WhatsApp pré-rempli. Marque reminded_at.

const fmtEur = (n: number | string) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(n) || 0)

function waHref(phone: string | null | undefined, text: string): string | null {
  if (!phone) return null
  let p = phone.replace(/\D/g, '')
  if (p.startsWith('0')) p = '33' + p.slice(1)
  return p.length >= 8 ? `https://wa.me/${p}?text=${encodeURIComponent(text)}` : null
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const channel: 'email' | 'whatsapp' = body?.channel === 'whatsapp' ? 'whatsapp' : 'email'

    const [{ data: quote }, { data: company }] = await Promise.all([
      supabase.from('quotes').select('*, clients(*)').eq('id', id).eq('user_id', user.id).single(),
      supabase.from('companies').select('*').eq('user_id', user.id).single(),
    ])
    if (!quote) return NextResponse.json({ error: 'Devis introuvable' }, { status: 404 })

    const client = quote.clients as { id?: string; email?: string | null; phone?: string | null; type?: string | null; company_name?: string | null; first_name?: string | null; last_name?: string | null } | null
    const clientName = (client?.type === 'professionnel'
      ? client?.company_name
      : `${client?.first_name || ''} ${client?.last_name || ''}`.trim()) || 'Client'
    const trade = (company as { trade_name?: string } | null)?.trade_name || 'Votre artisan'
    const line = relanceCopy(quote.issue_date, quote.valid_until)

    // Lien de signature : réutilise une demande en attente, sinon en crée une.
    const { data: existing } = await supabase.from('document_signatures')
      .select('id').eq('quote_id', id).eq('status', 'en_attente').order('created_at', { ascending: false }).limit(1).maybeSingle()
    let signatureId = existing?.id as string | undefined
    if (!signatureId) {
      const { data: created } = await supabase.from('document_signatures')
        .insert({ user_id: user.id, quote_id: id, signer_name: clientName, signer_email: client?.email || null })
        .select('id').single()
      signatureId = created?.id
    }
    const signUrl = signatureId ? `${req.nextUrl.origin}/signature/${signatureId}` : null

    if (channel === 'whatsapp') {
      const text = `Bonjour ${clientName},\n\n${line} Merci de le signer pour valider votre projet.${signUrl ? `\n\nConsulter et signer : ${signUrl}` : ''}\n\nCordialement,\n${trade}`
      await supabase.from('quotes').update({ reminded_at: new Date().toISOString() }).eq('id', id)
      return NextResponse.json({ success: true, waHref: waHref(client?.phone, text) })
    }

    // Email
    if (!client?.email) return NextResponse.json({ error: "Ce client n'a pas d'email — utilisez WhatsApp" }, { status: 400 })
    const token = await getValidGmailToken(supabase, user.id)
    if (!token) return NextResponse.json({ error: 'Gmail non connecté' }, { status: 400 })

    const primaryColor = (company as { template_style?: { primary_color?: string } } | null)?.template_style?.primary_color || '#1a1a2e'
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
<p>${line}</p>
<p>Merci de le signer pour valider votre projet :</p>
<div class="amount">${fmtEur(quote.total_ttc)} TTC</div>
${signUrl ? `<div style="text-align:center"><a href="${signUrl}" class="cta">✍️ Consulter et signer en ligne</a></div>` : ''}
<p>Cordialement,<br><strong>${trade}</strong>${(company as { phone?: string } | null)?.phone ? `<br>${(company as { phone?: string }).phone}` : ''}</p>
</div></body></html>`

    const sent = await sendGmailHtml({ accessToken: token.accessToken, fromEmail: token.gmailEmail, to: client.email, subject: `Relance — devis ${quote.quote_number} · ${trade}`, htmlBody })
    if (!sent.ok) return NextResponse.json({ error: 'Erreur envoi Gmail' }, { status: 502 })

    await supabase.from('quotes').update({ reminded_at: new Date().toISOString() }).eq('id', id)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error)?.message || 'Erreur serveur' }, { status: 500 })
  }
}
