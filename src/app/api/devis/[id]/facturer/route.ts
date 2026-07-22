import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100

type QLineRow = {
  id: string; designation: string; description?: string; quantity: number; unit: string
  unit_price_ht: number; vat_rate: number; discount_percent?: number; total_ht: number; sort_order?: number
}
type PriorInv = { billed_percent: number | null; type: string; situation_number: number | null; status: string }
type NewLine = {
  quote_line_id?: string; designation: string; description?: string; quantity: number; unit: string
  unit_price_ht: number; vat_rate: number; discount_percent: number; total_ht: number; sort_order: number
}

/**
 * Facture un devis accepté selon un mode :
 *  - 'complete'  : facture unique (100 % du marché) — reprend les lignes du devis.
 *  - 'acompte'   : X % du marché à la commande.
 *  - 'situation' : facture d'avancement, cumul Y % du marché (déduit ce qui est
 *                  déjà facturé). Mappée sur le type 'intermediaire'.
 *  - 'solde'     : facture le reliquat (100 % − déjà facturé).
 * Applique une retenue de garantie optionnelle (retenue sur le net à payer).
 * La TVA est ventilée par taux du devis (indispensable en multi-taux).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const mode: string = body.mode || 'complete'
  const percentIn = Number(body.percent) || 0
  const retentionPct = Math.max(0, Math.min(100, Number(body.retentionPct) || 0))

  const { data: quote } = await supabase
    .from('quotes').select('*, quote_lines(*)')
    .eq('id', id).eq('user_id', user.id).single()
  if (!quote) return NextResponse.json({ error: 'Devis introuvable' }, { status: 404 })
  if (quote.status !== 'accepte' && quote.status !== 'transforme')
    return NextResponse.json({ error: 'Le devis doit être accepté' }, { status: 400 })

  // Les lignes « option » ne sont pas facturées (hors marché validé).
  const qLines = ((quote.quote_lines as QLineRow[]) || []).filter(l => !(l as { is_option?: boolean }).is_option)
  const marketHt = Number(quote.subtotal_ht) || qLines.reduce((s, l) => s + (Number(l.total_ht) || 0), 0)
  if (marketHt <= 0) return NextResponse.json({ error: 'Devis sans montant' }, { status: 400 })

  // Déjà facturé sur ce devis (hors factures annulées).
  const { data: prior } = await supabase
    .from('invoices').select('billed_percent, type, situation_number, status')
    .eq('user_id', user.id).eq('quote_id', quote.id).neq('status', 'annulee')
  const previousPct = ((prior as PriorInv[]) || []).reduce((s, inv) => {
    const bp = inv.billed_percent
    if (bp !== null && bp !== undefined) return s + Number(bp)
    return s + (inv.type === 'complete' ? 100 : 0) // legacy : facture complète = 100 %
  }, 0)
  const situationNumber = (prior || []).length + 1

  // Delta de % facturé par cette facture.
  let delta: number
  if (mode === 'acompte') delta = percentIn
  else if (mode === 'situation') delta = percentIn - previousPct       // percentIn = cumul cible
  else if (mode === 'solde') delta = 100 - previousPct
  else delta = 100 - previousPct                                       // complete
  delta = r2(delta)
  if (delta <= 0) return NextResponse.json({ error: `Rien à facturer (déjà facturé : ${r2(previousPct)} %)` }, { status: 400 })
  if (r2(previousPct + delta) > 100.01) return NextResponse.json({ error: `Dépasse 100 % du marché (déjà ${r2(previousPct)} %)` }, { status: 400 })
  const cumul = r2(previousPct + delta)

  // Ventilation par taux de TVA du devis.
  const byRate = new Map<number, number>() // rate -> base HT du marché
  for (const l of qLines) {
    const rate = Number(l.vat_rate) || 0
    byRate.set(rate, (byRate.get(rate) || 0) + (Number(l.total_ht) || 0))
  }
  const rates = [...byRate.entries()].sort((a, b) => a[0] - b[0])

  const fullDetail = mode === 'complete' && previousPct === 0
  let lines: NewLine[]
  if (fullDetail) {
    // Facture complète : reprise fidèle des lignes du devis.
    lines = [...qLines]
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map((l, i) => ({
        quote_line_id: l.id, designation: l.designation, description: l.description,
        quantity: l.quantity, unit: l.unit, unit_price_ht: l.unit_price_ht,
        vat_rate: l.vat_rate, discount_percent: l.discount_percent || 0,
        total_ht: l.total_ht, sort_order: i,
      }))
  } else {
    const label =
      mode === 'acompte' ? `Acompte ${r2(delta)} % — devis ${quote.quote_number}` :
      mode === 'solde' ? `Solde des travaux — devis ${quote.quote_number}` :
      `Situation n°${situationNumber} — avancement ${cumul} % — devis ${quote.quote_number}`
    const multi = rates.length > 1
    lines = rates.map(([rate, base], i) => ({
      designation: multi ? `${label} (travaux TVA ${rate} %)` : label,
      description: mode === 'situation' ? `Facturation à l'avancement (${r2(delta)} % du marché sur cette situation).` : undefined,
      quantity: 1, unit: 'forfait', unit_price_ht: r2(base * delta / 100),
      vat_rate: rate, discount_percent: 0, total_ht: r2(base * delta / 100), sort_order: i,
    }))
  }

  const subtotalHt = r2(lines.reduce((s, l) => s + Number(l.total_ht), 0))
  const totalVat = r2(lines.reduce((s, l) => s + Number(l.total_ht) * Number(l.vat_rate) / 100, 0))
  const totalTtc = r2(subtotalHt + totalVat)
  const retentionAmount = r2(totalTtc * retentionPct / 100)
  const amountDue = r2(totalTtc - retentionAmount)

  const typeMap: Record<string, string> = { acompte: 'acompte', situation: 'intermediaire', solde: 'solde', complete: 'complete' }
  const invType = typeMap[mode] || 'complete'

  const { count } = await supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('user_id', user.id)
  const invoiceNumber = `FAC-${new Date().getFullYear()}-${String((count || 0) + 1).padStart(3, '0')}`
  const dueDate = new Date(); dueDate.setDate(dueDate.getDate() + 30)

  const retentionNote = retentionPct > 0
    ? ` Retenue de garantie de ${retentionPct} % (${retentionAmount.toLocaleString('fr-FR')} €) libérable à la levée des réserves ou 1 an après réception.`
    : ''

  const { data: invoice, error } = await supabase.from('invoices').insert({
    user_id: user.id, client_id: quote.client_id, project_id: quote.project_id, quote_id: quote.id,
    invoice_number: invoiceNumber, type: invType, status: 'brouillon',
    issue_date: new Date().toISOString().split('T')[0], due_date: dueDate.toISOString().split('T')[0],
    subtotal_ht: subtotalHt, total_vat: totalVat, total_ttc: totalTtc,
    deposit_already_paid: 0, amount_due: amountDue,
    billed_percent: delta, situation_number: situationNumber, market_total_ht: r2(marketHt),
    retention_pct: retentionPct, retention_amount: retentionAmount,
    legal_mentions: (quote.legal_mentions || '') + retentionNote,
  }).select().single()
  if (error || !invoice) return NextResponse.json({ error: 'Erreur création facture' }, { status: 500 })

  await supabase.from('invoice_lines').insert(lines.map(l => ({ ...l, invoice_id: invoice.id })))

  // Marché entièrement facturé → le devis passe en 'transforme'.
  if (cumul >= 99.99) await supabase.from('quotes').update({ status: 'transforme' }).eq('id', quote.id)

  return NextResponse.json({ invoiceId: invoice.id, cumul, delta })
}
