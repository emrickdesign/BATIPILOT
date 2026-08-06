// Moteur de rapprochement virement ↔ facture. Utilisé par la synchro bancaire
// automatique (cron/manuelle) et par la validation manuelle sur /banque.

import type { SupabaseClient } from '@supabase/supabase-js'

export function normalizeRef(s: string | null | undefined): string {
  return (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function normalizeIban(s: string | null | undefined): string {
  return (s || '').replace(/\s/g, '').toUpperCase()
}

export type OpenInvoice = {
  id: string
  invoice_number: string
  client_id: string | null
  amount_due: number
  total_ttc: number
}

export type MatchResult = { invoiceId: string; clientId: string | null; method: string } | null

// Trouve la facture correspondant à un virement reçu, par ordre de confiance :
// 1) référence (n° de facture dans le libellé)  2) IBAN payeur connu + montant
// 3) montant unique parmi les factures ouvertes.
export function matchInvoice(
  tx: { amount: number; label: string | null | undefined; counterparty_iban?: string | null },
  invoices: OpenInvoice[],
  ibanToClient: Map<string, string>,
): MatchResult {
  if (!(tx.amount > 0)) return null
  const label = normalizeRef(tx.label)

  // 1. Référence exacte : le n° de facture apparaît dans le libellé.
  const byRef = invoices.find(i => i.invoice_number && label.includes(normalizeRef(i.invoice_number)))
  if (byRef) return { invoiceId: byRef.id, clientId: byRef.client_id, method: 'reference' }

  // 2. IBAN payeur déjà appris → restreint au client, puis montant.
  const iban = normalizeIban(tx.counterparty_iban)
  if (iban && ibanToClient.has(iban)) {
    const cid = ibanToClient.get(iban)!
    const cand = invoices.filter(i => i.client_id === cid)
    const exact = cand.find(i => Math.abs((i.amount_due || i.total_ttc) - tx.amount) <= 1)
    if (exact) return { invoiceId: exact.id, clientId: cid, method: 'iban+montant' }
    if (cand.length === 1) return { invoiceId: cand[0].id, clientId: cid, method: 'iban' }
  }

  // 3. Un seul montant qui colle parmi toutes les factures ouvertes.
  const byAmount = invoices.filter(i => Math.abs((i.amount_due || i.total_ttc) - tx.amount) <= 1)
  if (byAmount.length === 1) return { invoiceId: byAmount[0].id, clientId: byAmount[0].client_id, method: 'montant' }

  return null
}

// Recalcule amount_due + statut d'une facture depuis la somme des virements
// rapprochés (idempotent : encaisse/dé-encaisse selon l'état réel des transactions).
export async function recomputeInvoice(supabase: SupabaseClient, userId: string, invoiceId: string): Promise<void> {
  const { data: inv } = await supabase.from('invoices').select('total_ttc, status').eq('id', invoiceId).eq('user_id', userId).single()
  if (!inv) return
  const { data: txs } = await supabase.from('bank_transactions')
    .select('amount').eq('user_id', userId).eq('matched_invoice_id', invoiceId).eq('status', 'rapproche')
  const paid = (txs || []).reduce((s: number, t: { amount: number | string }) => s + (Number(t.amount) || 0), 0)
  const total = Number(inv.total_ttc) || 0
  const due = Math.max(total - paid, 0)
  let status = inv.status as string
  if (paid <= 0) {
    if (status === 'payee' || status === 'payee_partiellement') status = 'envoyee'
  } else if (due <= 0.5) {
    status = 'payee'
  } else {
    status = 'payee_partiellement'
  }
  await supabase.from('invoices').update({ amount_due: due, status }).eq('id', invoiceId).eq('user_id', userId)
}

// Applique un rapprochement : marque la transaction, apprend l'IBAN du client,
// recalcule la facture. Réutilisé par la synchro auto et la validation manuelle.
export async function applyReconciliation(
  supabase: SupabaseClient,
  userId: string,
  opts: { txId: string; invoiceId: string; clientId: string | null; method?: string; counterpartyIban?: string | null },
): Promise<void> {
  await supabase.from('bank_transactions').update({
    status: 'rapproche',
    matched_invoice_id: opts.invoiceId,
    matched_client_id: opts.clientId,
    match_method: opts.method || 'manuel',
  }).eq('id', opts.txId).eq('user_id', userId)

  // Apprentissage IBAN : mémorise l'IBAN payeur sur le client (si vide).
  const iban = normalizeIban(opts.counterpartyIban)
  if (iban && opts.clientId) {
    await supabase.from('clients').update({ bank_iban: iban })
      .eq('id', opts.clientId).eq('user_id', userId).is('bank_iban', null)
  }

  await recomputeInvoice(supabase, userId, opts.invoiceId)
}
