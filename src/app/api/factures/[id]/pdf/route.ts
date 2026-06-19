import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

  const [{ data: invoice }, { data: company }] = await Promise.all([
    supabase.from('invoices').select('*, clients(*), invoice_lines(*)').eq('id', id).eq('user_id', user.id).single(),
    supabase.from('companies').select('*').eq('user_id', user.id).single(),
  ])

  if (!invoice) return NextResponse.json({ error: 'Introuvable' }, { status: 404 })

  const client = invoice.clients as any
  const lines = (invoice.invoice_lines as any[]).sort((a, b) => a.sort_order - b.sort_order)
  const clientName = client?.type === 'professionnel'
    ? client.company_name
    : `${client?.first_name || ''} ${client?.last_name || ''}`.trim() || 'Client'

  const unitLabels: Record<string, string> = {
    m2: 'm²', ml: 'ml', u: 'unité', forfait: 'forfait', h: 'heure', j: 'jour', piece: 'pièce'
  }
  const fmt = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('fr-FR')
  const typeLabels: Record<string, string> = { complete: 'FACTURE', acompte: 'FACTURE D\'ACOMPTE', solde: 'FACTURE DE SOLDE' }

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
  .doc-number { font-size: 16px; font-weight: bold; color: #1a1a2e; }
  .doc-type { font-size: 12px; color: #777; margin-bottom: 8px; }
  .parties { display: flex; justify-content: space-between; margin-bottom: 24px; padding: 16px; background: #f8f9fa; border-radius: 6px; }
  .label { font-size: 10px; color: #777; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
  .parties h3 { font-size: 13px; font-weight: bold; margin-bottom: 4px; }
  .parties p { color: #555; line-height: 1.6; }
  .meta { margin-bottom: 16px; display: flex; gap: 24px; font-size: 11px; color: #555; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  thead tr { background: #1a1a2e; color: white; }
  thead th { padding: 8px 10px; text-align: left; font-size: 10px; font-weight: 600; }
  thead th:not(:first-child) { text-align: right; }
  tbody tr { border-bottom: 1px solid #f0f0f0; }
  tbody tr:nth-child(even) { background: #fafafa; }
  tbody td { padding: 8px 10px; vertical-align: top; }
  tbody td:not(:first-child) { text-align: right; }
  .totals { display: flex; justify-content: flex-end; margin-bottom: 20px; }
  .totals-box { width: 260px; }
  .totals-row { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #f0f0f0; font-size: 12px; }
  .totals-row.bold { font-size: 14px; font-weight: bold; border-bottom: 2px solid #1a1a2e; padding: 8px 0; }
  .totals-row.due { color: #2563eb; font-weight: bold; font-size: 14px; }
  .payment { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 12px; margin-bottom: 16px; font-size: 11px; }
  .payment strong { display: block; margin-bottom: 4px; color: #1d4ed8; }
  .legal { font-size: 9px; color: #999; border-top: 1px solid #eee; padding-top: 10px; margin-top: 10px; }
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
    <div class="doc-type">${typeLabels[invoice.type] || 'FACTURE'}</div>
    <div class="doc-number">${invoice.invoice_number}</div>
    <p>Date : ${fmtDate(invoice.issue_date)}</p>
    ${invoice.due_date ? `<p>Échéance : ${fmtDate(invoice.due_date)}</p>` : ''}
  </div>
</div>

<div class="parties">
  <div>
    <div class="label">Émetteur</div>
    <h3>${company?.trade_name || 'Votre entreprise'}</h3>
    ${company?.address ? `<p>${company.address}</p>` : ''}
  </div>
  <div>
    <div class="label">Facturé à</div>
    <h3>${clientName}</h3>
    ${client?.billing_address ? `<p>${client.billing_address}</p>` : ''}
    ${client?.email ? `<p>${client.email}</p>` : ''}
  </div>
</div>

<table>
  <thead>
    <tr>
      <th style="width:45%">Désignation</th>
      <th style="width:10%">Qté</th>
      <th style="width:10%">Unité</th>
      <th style="width:13%">P.U. HT</th>
      <th style="width:7%">TVA</th>
      <th style="width:15%">Total HT</th>
    </tr>
  </thead>
  <tbody>
    ${lines.map(l => `
    <tr>
      <td><strong>${l.designation}</strong>${l.description ? `<br><span style="color:#777;font-size:10px">${l.description}</span>` : ''}</td>
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
    <div class="totals-row"><span>Total HT</span><span>${fmt(invoice.subtotal_ht)}</span></div>
    <div class="totals-row"><span>TVA</span><span>${fmt(invoice.total_vat)}</span></div>
    <div class="totals-row bold"><span>TOTAL TTC</span><span>${fmt(invoice.total_ttc)}</span></div>
    ${invoice.deposit_already_paid > 0 ? `<div class="totals-row"><span>Acompte versé</span><span>- ${fmt(invoice.deposit_already_paid)}</span></div>` : ''}
    <div class="totals-row due"><span>RESTE À PAYER</span><span>${fmt(invoice.amount_due)}</span></div>
  </div>
</div>

${company?.iban ? `<div class="payment"><strong>Coordonnées bancaires</strong>IBAN : ${company.iban}</div>` : ''}
${invoice.legal_mentions ? `<div class="legal">${invoice.legal_mentions}</div>` : ''}
${company?.payment_terms ? `<div class="legal">Conditions de règlement : ${company.payment_terms}</div>` : ''}
<div class="legal">En cas de retard de paiement, des pénalités de retard de 3 fois le taux légal seront appliquées, ainsi qu'une indemnité forfaitaire de 40€.</div>
</body>
</html>`

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
