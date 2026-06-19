import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// Génération PDF côté serveur avec HTML → utilise Chromium via @vercel/og ou génération HTML simple
// Pour le MVP on génère un HTML bien formaté que le navigateur peut imprimer en PDF
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

  const [{ data: quote }, { data: company }] = await Promise.all([
    supabase.from('quotes').select('*, clients(*), quote_lines(*)').eq('id', id).eq('user_id', user.id).single(),
    supabase.from('companies').select('*').eq('user_id', user.id).single(),
  ])

  if (!quote) return NextResponse.json({ error: 'Introuvable' }, { status: 404 })

  const client = quote.clients as any
  const lines = (quote.quote_lines as any[]).sort((a, b) => a.sort_order - b.sort_order)
  const clientName = client?.type === 'professionnel'
    ? client.company_name
    : `${client?.first_name || ''} ${client?.last_name || ''}`.trim() || 'Client'

  const unitLabels: Record<string, string> = {
    m2: 'm²', ml: 'ml', u: 'unité', forfait: 'forfait', h: 'heure', j: 'jour', piece: 'pièce'
  }
  const fmt = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('fr-FR')

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #111; padding: 30px 40px; max-width: 800px; margin: 0 auto; }
  .header { display: flex; justify-content: space-between; margin-bottom: 30px; }
  .company h1 { font-size: 18px; font-weight: bold; color: #1a1a2e; margin-bottom: 4px; }
  .company p { color: #555; line-height: 1.5; }
  .doc-info { text-align: right; }
  .doc-info .doc-number { font-size: 16px; font-weight: bold; color: #1a1a2e; }
  .doc-info .doc-type { font-size: 12px; color: #777; margin-bottom: 8px; }
  .parties { display: flex; justify-content: space-between; margin-bottom: 24px; padding: 16px; background: #f8f9fa; border-radius: 6px; }
  .parties .label { font-size: 10px; color: #777; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
  .parties h3 { font-size: 13px; font-weight: bold; margin-bottom: 4px; }
  .parties p { color: #555; line-height: 1.6; }
  .meta { margin-bottom: 16px; display: flex; gap: 24px; font-size: 11px; color: #555; }
  .meta strong { color: #111; }
  .object { margin-bottom: 20px; padding: 10px 14px; border-left: 3px solid #2563eb; background: #eff6ff; }
  .object p { font-size: 11px; color: #1d4ed8; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  thead tr { background: #1a1a2e; color: white; }
  thead th { padding: 8px 10px; text-align: left; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px; }
  thead th:not(:first-child) { text-align: right; }
  tbody tr { border-bottom: 1px solid #f0f0f0; }
  tbody tr:nth-child(even) { background: #fafafa; }
  tbody td { padding: 8px 10px; vertical-align: top; }
  tbody td:not(:first-child) { text-align: right; }
  .designation { font-weight: 600; }
  .desc { color: #777; font-size: 10px; margin-top: 2px; }
  .totals { display: flex; justify-content: flex-end; margin-bottom: 20px; }
  .totals-box { width: 260px; }
  .totals-row { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #f0f0f0; font-size: 12px; }
  .totals-row.total-ttc { font-size: 14px; font-weight: bold; border-bottom: 2px solid #1a1a2e; padding: 8px 0; }
  .totals-row.acompte { color: #2563eb; font-weight: 600; }
  .notes { font-size: 10px; color: #555; margin-bottom: 16px; padding: 10px; background: #f8f9fa; border-radius: 4px; }
  .legal { font-size: 9px; color: #999; border-top: 1px solid #eee; padding-top: 10px; margin-top: 10px; }
  .signature { margin-top: 30px; display: flex; justify-content: flex-end; }
  .signature-box { border: 1px solid #ddd; padding: 12px 20px; text-align: center; width: 200px; }
  .signature-box .label { font-size: 10px; color: #777; margin-bottom: 30px; }
  @media print { body { padding: 20px; } }
</style>
</head>
<body>
<div class="header">
  <div class="company">
    <h1>${company?.trade_name || 'Votre entreprise'}</h1>
    ${company?.address ? `<p>${company.address}</p>` : ''}
    ${company?.phone ? `<p>${company.phone}</p>` : ''}
    ${company?.email ? `<p>${company.email}</p>` : ''}
    ${company?.siret ? `<p>SIRET : ${company.siret}</p>` : ''}
  </div>
  <div class="doc-info">
    <div class="doc-type">DEVIS</div>
    <div class="doc-number">${quote.quote_number}</div>
    <p>Date : ${fmtDate(quote.issue_date)}</p>
    ${quote.valid_until ? `<p>Valable jusqu'au : ${fmtDate(quote.valid_until)}</p>` : ''}
  </div>
</div>

<div class="parties">
  <div>
    <div class="label">Prestataire</div>
    <h3>${company?.trade_name || 'Votre entreprise'}</h3>
    ${company?.address ? `<p>${company.address}</p>` : ''}
  </div>
  <div>
    <div class="label">Client</div>
    <h3>${clientName}</h3>
    ${client?.billing_address ? `<p>${client.billing_address}</p>` : ''}
    ${client?.email ? `<p>${client.email}</p>` : ''}
    ${client?.phone ? `<p>${client.phone}</p>` : ''}
  </div>
</div>

${quote.title || quote.description ? `
<div class="object">
  ${quote.title ? `<p><strong>Objet : ${quote.title}</strong></p>` : ''}
  ${quote.description ? `<p style="margin-top:4px">${quote.description}</p>` : ''}
</div>` : ''}

<table>
  <thead>
    <tr>
      <th style="width:40%">Désignation</th>
      <th style="width:8%">Qté</th>
      <th style="width:10%">Unité</th>
      <th style="width:13%">P.U. HT</th>
      <th style="width:7%">TVA</th>
      <th style="width:13%">Total HT</th>
    </tr>
  </thead>
  <tbody>
    ${lines.map(l => `
    <tr>
      <td>
        <div class="designation">${l.designation}</div>
        ${l.description ? `<div class="desc">${l.description}</div>` : ''}
      </td>
      <td>${l.quantity}</td>
      <td>${unitLabels[l.unit] || l.unit}</td>
      <td>${fmt(l.unit_price_ht)}</td>
      <td>${l.vat_rate}%</td>
      <td>${fmt(l.total_ht)}</td>
    </tr>`).join('')}
  </tbody>
</table>

<div class="totals">
  <div class="totals-box">
    <div class="totals-row"><span>Total HT</span><span>${fmt(quote.subtotal_ht)}</span></div>
    <div class="totals-row"><span>TVA</span><span>${fmt(quote.total_vat)}</span></div>
    <div class="totals-row total-ttc"><span>TOTAL TTC</span><span>${fmt(quote.total_ttc)}</span></div>
    ${quote.deposit_amount ? `<div class="totals-row acompte"><span>Acompte demandé (${quote.deposit_percent}%)</span><span>${fmt(quote.deposit_amount)}</span></div>` : ''}
  </div>
</div>

${quote.notes ? `<div class="notes"><strong>Notes :</strong> ${quote.notes}</div>` : ''}

<div class="signature">
  <div class="signature-box">
    <div class="label">Bon pour accord<br>Date et signature du client</div>
  </div>
</div>

${quote.legal_mentions ? `<div class="legal">${quote.legal_mentions}</div>` : ''}
${company?.payment_terms ? `<div class="legal">Conditions de règlement : ${company.payment_terms}</div>` : ''}
</body>
</html>`

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `inline; filename="${quote.quote_number}.html"`,
    },
  })
}
