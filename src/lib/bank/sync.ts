// Synchronisation des virements reçus depuis Bridge + auto-rapprochement.
// Utilisé par le cron (tous les comptes) et par la synchro manuelle (un utilisateur).

import type { SupabaseClient } from '@supabase/supabase-js'
import { getUserToken, listTransactions } from './bridge'
import { matchInvoice, applyReconciliation, type OpenInvoice } from './reconcile'

export async function syncUserBank(supabase: SupabaseClient, userId: string): Promise<{ imported: number; matched: number }> {
  // Pas de compte connecté → rien à faire.
  const { data: accounts } = await supabase.from('bank_accounts').select('account_id').eq('user_id', userId)
  if (!accounts?.length) return { imported: 0, matched: 0 }

  const token = await getUserToken(userId)
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
  // Bridge ne fournit pas l'IBAN du payeur → apprentissage IBAN inactif ici (référence + montant suffisent).
  const ibanToClient = new Map<string, string>()

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
      .select('id, amount, label, counterparty_iban')
    imported = inserted?.length || 0

    for (const tx of inserted || []) {
      const m = matchInvoice(
        { amount: Number(tx.amount) || 0, label: tx.label, counterparty_iban: tx.counterparty_iban },
        invoices, ibanToClient,
      )
      if (m) {
        await applyReconciliation(supabase, userId, {
          txId: tx.id, invoiceId: m.invoiceId, clientId: m.clientId, method: m.method, counterpartyIban: tx.counterparty_iban,
        })
        matched++
        const inv = invoices.find(i => i.id === m.invoiceId)
        if (inv) inv.amount_due = Math.max((inv.amount_due || inv.total_ttc) - (Number(tx.amount) || 0), 0)
      }
    }
  }

  await supabase.from('bank_accounts').update({ last_synced_at: new Date().toISOString() }).eq('user_id', userId)
  return { imported, matched }
}
