// Synchronisation des virements reçus depuis Bridge + auto-rapprochement.
// Utilisé par le cron (tous les comptes) et par la synchro manuelle (un utilisateur).

import type { SupabaseClient } from '@supabase/supabase-js'
import { getUserToken, listTransactions, listAccounts } from './bridge'
import { matchInvoice, applyReconciliation, matchExpense, applyExpenseReconciliation, nameTokens, type OpenInvoice, type OpenExpense } from './reconcile'

export async function syncUserBank(supabase: SupabaseClient, userId: string): Promise<{ imported: number; matched: number }> {
  // Pas de compte connecté → rien à faire.
  const { data: accounts } = await supabase.from('bank_accounts').select('account_id').eq('user_id', userId)
  if (!accounts?.length) return { imported: 0, matched: 0 }

  const token = await getUserToken(userId)

  // Rafraîchit le solde de chaque compte (trésorerie live sur le dashboard).
  try {
    const live = await listAccounts(token)
    const now = new Date().toISOString()
    for (const a of live) {
      await supabase.from('bank_accounts').update({
        balance: typeof a.balance === 'number' ? a.balance : null,
        account_type: a.type || null,
        name: a.name || null,
        currency: a.currency_code || null,
        balance_updated_at: now,
      }).eq('user_id', userId).eq('account_id', String(a.id))
    }
  } catch { /* solde non bloquant : on continue l'import des virements */ }

  const minDate = new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0]
  const txs = await listTransactions(token, minDate)
  if (!txs.length) {
    await supabase.from('bank_accounts').update({ last_synced_at: new Date().toISOString() }).eq('user_id', userId)
    return { imported: 0, matched: 0 }
  }

  const { data: invRows } = await supabase.from('invoices')
    .select('id, invoice_number, client_id, amount_due, total_ttc')
    .eq('user_id', userId).in('status', ['envoyee', 'en_retard', 'payee_partiellement'])
  const invoices: OpenInvoice[] = (invRows || []).map(i => ({
    id: i.id, invoice_number: i.invoice_number, client_id: i.client_id,
    amount_due: Number(i.amount_due) || 0, total_ttc: Number(i.total_ttc) || 0,
  }))
  // Bridge ne fournit pas l'IBAN du payeur → apprentissage IBAN inactif ici.
  const ibanToClient = new Map<string, string>()

  // Noms des clients → jetons, pour reconnaître le payeur dans le libellé bancaire.
  const { data: clientRows } = await supabase.from('clients')
    .select('id, first_name, last_name, company_name').eq('user_id', userId)
  const clientNames = new Map<string, string[]>()
  for (const c of clientRows || []) {
    const toks = nameTokens(c.company_name, c.first_name, c.last_name)
    if (toks.length) clientNames.set(c.id, toks)
  }

  // Dépenses non rapprochées → pour rattacher les DÉBITS bancaires (miroir des entrées).
  const { data: expRows } = await supabase.from('expenses')
    .select('id, supplier, amount_ttc, expense_date')
    .eq('user_id', userId).eq('reconciled', false)
  const expenses: OpenExpense[] = (expRows || []).map(e => ({
    id: e.id, supplier: e.supplier, amount_ttc: Number(e.amount_ttc) || 0, expense_date: e.expense_date,
  }))

  // Texte de rapprochement = libellé nettoyé + brut (le nom du payeur est parfois
  // seulement dans le brut). Le libellé stocké/affiché reste le nettoyé.
  const matchText = new Map<string, string>()
  for (const t of txs) {
    matchText.set(`bridge-${t.id}`, `${t.clean_description || ''} ${t.provider_description || ''}`.trim())
  }

  const rows = txs.map(t => ({
    user_id: userId,
    provider_tx_id: `bridge-${t.id}`,
    account_id: String(t.account_id ?? ''),
    tx_date: t.date || null,
    label: (t.clean_description || t.provider_description || '').slice(0, 200),
    amount: Number(t.amount) || 0,
    currency: t.currency_code || null,
    counterparty_iban: null as string | null,
    source: 'bank',
    status: 'a_rapprocher',
  }))

  // Dédoublonnage vs déjà importées.
  const { data: existing } = await supabase.from('bank_transactions')
    .select('provider_tx_id').eq('user_id', userId).in('provider_tx_id', rows.map(r => r.provider_tx_id))
  const seen = new Set((existing || []).map(e => e.provider_tx_id))
  const fresh = rows.filter(r => !seen.has(r.provider_tx_id))

  let imported = 0, matched = 0
  if (fresh.length) {
    const { data: inserted } = await supabase.from('bank_transactions').insert(fresh)
      .select('id, amount, label, tx_date, counterparty_iban, provider_tx_id')
    imported = inserted?.length || 0

    const usedExpenses = new Set<string>()
    for (const tx of inserted || []) {
      const amount = Number(tx.amount) || 0
      const label = matchText.get(tx.provider_tx_id) || tx.label

      // Entrée (> 0) → facture.
      const m = matchInvoice({ amount, label, counterparty_iban: tx.counterparty_iban }, invoices, ibanToClient, clientNames)
      if (m) {
        await applyReconciliation(supabase, userId, {
          txId: tx.id, invoiceId: m.invoiceId, clientId: m.clientId, method: m.method, counterpartyIban: tx.counterparty_iban,
        })
        matched++
        const inv = invoices.find(i => i.id === m.invoiceId)
        if (inv) inv.amount_due = Math.max((inv.amount_due || inv.total_ttc) - amount, 0)
        continue
      }

      // Sortie (< 0) → dépense/ticket (miroir), sans réutiliser une dépense déjà prise ce tour.
      if (amount < 0) {
        const pool = expenses.filter(e => !usedExpenses.has(e.id))
        const em = matchExpense({ amount, label, tx_date: tx.tx_date }, pool)
        if (em) {
          await applyExpenseReconciliation(supabase, userId, { txId: tx.id, expenseId: em.expenseId, method: em.method })
          usedExpenses.add(em.expenseId)
          matched++
        }
      }
    }
  }

  await supabase.from('bank_accounts').update({ last_synced_at: new Date().toISOString() }).eq('user_id', userId)
  return { imported, matched }
}
