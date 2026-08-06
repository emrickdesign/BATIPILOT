import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getValidGmailToken } from '@/lib/gmail-token'
import { sendGmailHtml } from '@/lib/gmail-send'

// Renouvelle un devis expiré : recrée le même devis (mêmes lignes) avec de NOUVELLES dates,
// puis l'envoie au client (email Gmail ou lien WhatsApp) avec un message adapté.
// « le précédent n'a pas été signé durant sa validité ».

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
    // draft = duplique le devis sans l'envoyer (pour le modifier avant envoi)
    const channel: 'email' | 'whatsapp' | 'draft' = body?.channel === 'whatsapp' ? 'whatsapp' : body?.channel === 'draft' ? 'draft' : 'email'

    const [{ data: src }, { data: company }] = await Promise.all([
      supabase.from('quotes').select('*, clients(*), quote_lines(*)').eq('id', id).eq('user_id', user.id).single(),
      supabase.from('companies').select('*').eq('user_id', user.id).single(),
    ])
    if (!src) return NextResponse.json({ error: 'Devis introuvable' }, { status: 404 })

    const client = src.clients as { id?: string; email?: string | null; phone?: string | null; type?: string | null; company_name?: string | null; first_name?: string | null; last_name?: string | null } | null
    const clientName = (client?.type === 'professionnel'
      ? client?.company_name
      : `${client?.first_name || ''} ${client?.last_name || ''}`.trim()) || 'Client'

    // Nouvelles dates : aujourd'hui + durée de validité de l'entreprise.
    const vd = Number((company as { quote_validity_days?: number } | null)?.quote_validity_days) || 30
    const validUntil = new Date(); validUntil.setDate(validUntil.getDate() + vd)

    const { count } = await supabase.from('quotes').select('*', { count: 'exact', head: true }).eq('user_id', user.id)
    const quoteNumber = `DEV-${new Date().getFullYear()}-${String((count || 0) + 1).padStart(3, '0')}`

    const { data: nq, error: insErr } = await supabase.from('quotes').insert({
      user_id: user.id,
      client_id: src.client_id,
      project_id: src.project_id,
      quote_number: quoteNumber,
      title: src.title,
      description: src.description,
      status: channel === 'email' ? 'envoye' : channel === 'whatsapp' ? 'pret' : 'brouillon',
      valid_until: validUntil.toISOString().split('T')[0],
      subtotal_ht: src.subtotal_ht,
      total_vat: src.total_vat,
      total_ttc: src.total_ttc,
      deposit_percent: src.deposit_percent,
      deposit_amount: src.deposit_amount,
      notes: src.notes,
      internal_notes: '',
      legal_mentions: src.legal_mentions,
    }).select('*').single()
    if (insErr || !nq) return NextResponse.json({ error: 'Erreur création du nouveau devis' }, { status: 500 })

    const lines = (src.quote_lines as Array<Record<string, unknown>>) || []
    if (lines.length) {
      await supabase.from('quote_lines').insert(lines.map((l, i) => ({
        quote_id: nq.id,
        price_item_id: l.price_item_id ?? null,
        category: l.category,
        designation: l.designation,
        description: l.description,
        quantity: l.quantity,
        unit: l.unit,
        unit_price_ht: l.unit_price_ht,
        vat_rate: l.vat_rate,
        discount_percent: l.discount_percent,
        total_ht: l.total_ht,
        sort_order: (l.sort_order as number) ?? i,
        is_option: l.is_option || false,
      })))
    }

    // Mode brouillon : on duplique seulement, l'artisan modifiera puis enverra lui-même.
    if (channel === 'draft') return NextResponse.json({ success: true, newId: nq.id })

    // Lien de signature du nouveau devis
    const { data: sig } = await supabase.from('document_signatures')
      .insert({ user_id: user.id, quote_id: nq.id, signer_name: clientName, signer_email: client?.email || null })
      .select('id').single()
    const signUrl = sig ? `${req.nextUrl.origin}/signature/${sig.id}` : null

    const trade = (company as { trade_name?: string } | null)?.trade_name || 'Votre artisan'
    const intro = `Je me permets de vous adresser un nouveau devis, le précédent (${src.quote_number}) n'ayant pas été signé durant sa période de validité. N'hésitez pas à me tenir informé si votre projet a évolué.`

    if (channel === 'whatsapp') {
      const text = `Bonjour ${clientName},\n\n${intro}${signUrl ? `\n\nVous pouvez le consulter et le signer ici : ${signUrl}` : ''}\n\nCordialement,\n${trade}`
      return NextResponse.json({ success: true, newId: nq.id, waHref: waHref(client?.phone, text) })
    }

    // Email
    if (!client?.email) return NextResponse.json({ error: "Ce client n'a pas d'email — utilisez WhatsApp", newId: nq.id }, { status: 400 })
    const token = await getValidGmailToken(supabase, user.id)
    if (!token) return NextResponse.json({ error: 'Gmail non connecté', newId: nq.id }, { status: 400 })

    const primaryColor = (company as { template_style?: { primary_color?: string } } | null)?.template_style?.primary_color || '#1a1a2e'
    const htmlBody = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>body{font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:600px;margin:0 auto;padding:20px}
.header{background:${primaryColor};color:white;padding:20px 24px;border-radius:8px 8px 0 0}
.body{background:#f8f9fa;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px}
.amount{font-size:24px;font-weight:bold;color:${primaryColor};margin:12px 0}
.cta{display:inline-block;background:${primaryColor};color:white;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:bold;margin:16px 0}
</style></head><body>
<div class="header"><h2 style="margin:0">Devis ${nq.quote_number}</h2><p style="margin:4px 0 0;opacity:.8">${trade}</p></div>
<div class="body">
<p>Bonjour ${clientName},</p>
<p>${intro}</p>
<p>Votre nouveau devis <strong>${nq.quote_number}</strong>${nq.title ? ` pour : <em>${nq.title}</em>` : ''} :</p>
<div class="amount">${fmtEur(nq.total_ttc)} TTC</div>
<p style="color:#666;font-size:13px">Valable jusqu'au ${validUntil.toLocaleDateString('fr-FR')}</p>
${signUrl ? `<div style="text-align:center"><a href="${signUrl}" class="cta">✍️ Consulter et signer en ligne</a></div>` : ''}
<p>Cordialement,<br><strong>${trade}</strong>${(company as { phone?: string } | null)?.phone ? `<br>${(company as { phone?: string }).phone}` : ''}</p>
</div></body></html>`

    const sent = await sendGmailHtml({ accessToken: token.accessToken, fromEmail: token.gmailEmail, to: client.email, subject: `Nouveau devis ${nq.quote_number} — ${trade}`, htmlBody })
    if (!sent.ok) return NextResponse.json({ error: 'Erreur envoi Gmail', newId: nq.id }, { status: 502 })

    await supabase.from('quotes').update({ sent_at: new Date().toISOString(), reminder_count: 0, reminded_at: null }).eq('id', nq.id)
    return NextResponse.json({ success: true, newId: nq.id })
  } catch (err) {
    return NextResponse.json({ error: (err as Error)?.message || 'Erreur serveur' }, { status: 500 })
  }
}
