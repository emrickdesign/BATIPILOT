// Moteur de rapprochement virement ↔ facture. Utilisé par la synchro bancaire
// automatique (cron/manuelle) et par la validation manuelle sur /banque.

import type { SupabaseClient } from '@supabase/supabase-js'

export function normalizeRef(s: string | null | undefined): string {
  return (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function normalizeIban(s: string | null | undefined): string {
  return (s || '').replace(/\s/g, '').toUpperCase()
}

// Mots à ignorer dans un nom : formes juridiques + civilités + articles.
// Sans eux, « SARL MARTIN » et « M. MARTIN » se ramènent tous deux au jeton MARTIN.
const NAME_STOPWORDS = new Set([
  'SARL', 'SAS', 'SASU', 'EURL', 'SCI', 'SA', 'SNC', 'EI', 'EIRL', 'SCOP', 'GAEC',
  'MICRO', 'AUTO', 'ENTREPRISE', 'ETS', 'ETABLISSEMENT', 'ETABLISSEMENTS', 'STE', 'SOCIETE',
  'MR', 'MME', 'MLLE', 'MONSIEUR', 'MADAME', 'MADEMOISELLE',
  'ET', 'DE', 'DU', 'DES', 'LA', 'LE', 'LES', 'AUX',
  'VIR', 'VIREMENT', 'VIRT', 'SEPA', 'RECU', 'PRLV', 'PAIEMENT', 'REGLEMENT', 'FACTURE', 'REF',
])

// Accents retirés, majuscules, découpage en jetons alphanumériques significatifs
// (≥ 3 caractères, hors stopwords). Sert au rapprochement par nom du payeur.
export function nameTokens(...parts: (string | null | undefined)[]): string[] {
  const raw = parts.filter(Boolean).join(' ')
  const toks = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim().split(/\s+/)
    .filter(t => t.length >= 3 && !NAME_STOPWORDS.has(t))
  return Array.from(new Set(toks))
}

// Jeux de mots du libellé bancaire (mêmes règles de normalisation, mais on garde
// tout mot ≥ 3 lettres : c'est là que le nom du client peut apparaître).
export function labelWords(label: string | null | undefined): Set<string> {
  return new Set(
    (label || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim().split(/\s+/).filter(t => t.length >= 3),
  )
}

export type OpenInvoice = {
  id: string
  invoice_number: string
  client_id: string | null
  amount_due: number
  total_ttc: number
}

export type MatchResult = { invoiceId: string; clientId: string | null; method: string } | null

// Montant dû restant d'une facture (retombe sur le TTC si amount_due absent).
function invoiceAmount(i: OpenInvoice): number {
  return i.amount_due || i.total_ttc
}

// Trouve la facture correspondant à un virement reçu, par ordre de confiance
// décroissant. Chaque niveau n'accepte QUE s'il est sans ambiguïté (un seul
// candidat) — sinon on descend, et in fine ça part en rapprochement manuel.
//   1) référence : n° de facture dans le libellé              → quasi certain
//   2) nom du client + montant qui colle                      → très fiable
//   3) IBAN payeur appris + montant / IBAN seul               → fiable (inactif si Bridge ne fournit pas l'IBAN)
//   4) nom du client unique parmi les factures ouvertes       → fiable
//   5) montant unique parmi toutes les factures ouvertes      → dernier recours
// `clientNames` : clientId → jetons significatifs de son nom (nameTokens).
export function matchInvoice(
  tx: { amount: number; label: string | null | undefined; counterparty_iban?: string | null },
  invoices: OpenInvoice[],
  ibanToClient: Map<string, string>,
  clientNames?: Map<string, string[]>,
): MatchResult {
  if (!(tx.amount > 0)) return null
  const label = normalizeRef(tx.label)

  // 1. Référence exacte : le n° de facture apparaît dans le libellé.
  const byRef = invoices.find(i => i.invoice_number && label.includes(normalizeRef(i.invoice_number)))
  if (byRef) return { invoiceId: byRef.id, clientId: byRef.client_id, method: 'reference' }

  // Nom du payeur : combien de jetons du client apparaissent dans le libellé.
  const words = labelWords(tx.label)
  const nameHits = (cid: string | null): number => {
    if (!cid || !clientNames) return 0
    const toks = clientNames.get(cid)
    if (!toks?.length) return 0
    return toks.reduce((n, t) => n + (words.has(t) ? 1 : 0), 0)
  }

  const amountMatches = (i: OpenInvoice) => Math.abs(invoiceAmount(i) - tx.amount) <= 1

  // 2. Nom du client reconnu dans le libellé ET montant qui colle → très fiable.
  if (clientNames) {
    const named = invoices.filter(i => amountMatches(i) && nameHits(i.client_id) > 0)
    if (named.length === 1) return { invoiceId: named[0].id, clientId: named[0].client_id, method: 'nom+montant' }
  }

  // 3. IBAN payeur déjà appris → restreint au client, puis montant.
  const iban = normalizeIban(tx.counterparty_iban)
  if (iban && ibanToClient.has(iban)) {
    const cid = ibanToClient.get(iban)!
    const cand = invoices.filter(i => i.client_id === cid)
    const exact = cand.find(amountMatches)
    if (exact) return { invoiceId: exact.id, clientId: cid, method: 'iban+montant' }
    if (cand.length === 1) return { invoiceId: cand[0].id, clientId: cid, method: 'iban' }
  }

  // 4. Nom du client reconnu, sans autre facture ouverte ambiguë (1 seul candidat).
  if (clientNames) {
    const named = invoices.filter(i => nameHits(i.client_id) > 0)
    if (named.length === 1) return { invoiceId: named[0].id, clientId: named[0].client_id, method: 'nom' }
  }

  // 5. Un seul montant qui colle parmi toutes les factures ouvertes.
  const byAmount = invoices.filter(amountMatches)
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

// ─── Miroir : rapprochement des SORTIES (débit bancaire ↔ dépense/ticket) ───

export type OpenExpense = {
  id: string
  supplier: string | null
  amount_ttc: number
  expense_date: string | null
}

export type ExpenseMatch = { expenseId: string; method: string } | null

// Trouve la dépense correspondant à un débit bancaire (montant < 0), même logique
// prudente que matchInvoice : n'accepte que si un seul candidat. Évite le double
// comptage entre un ticket scanné et la ligne du relevé pour le même achat.
export function matchExpense(
  tx: { amount: number; label: string | null | undefined; tx_date?: string | null },
  expenses: OpenExpense[],
): ExpenseMatch {
  if (!(tx.amount < 0)) return null
  const out = Math.abs(tx.amount)
  const words = labelWords(tx.label)
  const amountMatches = (e: OpenExpense) => Math.abs((e.amount_ttc || 0) - out) <= 1
  const supplierHit = (e: OpenExpense) => {
    const toks = nameTokens(e.supplier)
    return toks.length > 0 && toks.some(t => words.has(t))
  }
  const daysApart = (e: OpenExpense): number => {
    if (!tx.tx_date || !e.expense_date) return 999
    const a = Date.parse(tx.tx_date), b = Date.parse(e.expense_date)
    if (Number.isNaN(a) || Number.isNaN(b)) return 999
    return Math.abs(a - b) / 86400000
  }

  // 1. Fournisseur reconnu dans le libellé + montant qui colle.
  const byBoth = expenses.filter(e => amountMatches(e) && supplierHit(e))
  if (byBoth.length === 1) return { expenseId: byBoth[0].id, method: 'fournisseur+montant' }

  // 2. Montant + date proche (≤ 5 jours), sans ambiguïté.
  const byAmtDate = expenses.filter(e => amountMatches(e) && daysApart(e) <= 5)
  if (byAmtDate.length === 1) return { expenseId: byAmtDate[0].id, method: 'montant+date' }

  // 3. Montant unique parmi les dépenses non rapprochées.
  const byAmt = expenses.filter(amountMatches)
  if (byAmt.length === 1) return { expenseId: byAmt[0].id, method: 'montant' }

  return null
}

// Applique un rapprochement de dépense : marque le débit + la dépense comme rapprochés.
export async function applyExpenseReconciliation(
  supabase: SupabaseClient,
  userId: string,
  opts: { txId: string; expenseId: string; method?: string },
): Promise<void> {
  await supabase.from('bank_transactions').update({
    status: 'rapproche',
    matched_expense_id: opts.expenseId,
    match_method: opts.method || 'manuel',
  }).eq('id', opts.txId).eq('user_id', userId)
  await supabase.from('expenses').update({ reconciled: true })
    .eq('id', opts.expenseId).eq('user_id', userId)
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
