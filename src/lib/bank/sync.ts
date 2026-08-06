// Synchronisation des virements reçus depuis la banque connectée + auto-rapprochement.
// Utilisé par le cron (tous les comptes) et par la synchro manuelle (un utilisateur).

import type { SupabaseClient } from '@supabase/supabase-js'
import { getAccountTransactions } from './gocardless'
import { matchInvoice, applyReconciliation, normalizeIban, type OpenInvoice } from './reconcile'

export async function syncUserBank(supabase: SupabaseClient, userId: string): Promise<{ imported: number; matched: number }> {
  const { data: accounts } = await supabase.from('bank_accounts').select('account_id').eq('user_id', userId)
  if (!accounts?.length) return { imported: 0, matched: 0 }

  const [{ data: invRows }, { data: cliRows }] = await Promise.all([
    supabase.from('invoices').select('id, invoice_number, client_id, amount_due, total_ttc')
      .eq('user_id', userId).in('status', ['envoyee', 'en_retard', 'payee_partiellement']),
    supabase.from('clients').select('id, bank_iban').eq('user_id', userId).not('bank_iban', 'is', null),
  ])
  const invoices: OpenInvoice[] = (invRows || []).map(i => ({
    id: i.id, invoice_number: i.invoice_number, client_id: i.client_id,
    amount_due: Number(i.amount_due) || 0, total_ttc: Number(i.total_ttc) || 0,
  }))
  const ibanToClient = new Map<string, string>()
  for (const c of cliRows || []) if (c.bank_iban) ibanToClient.set(normalizeIban(c.bank_iban), c.id)

  let imported = 0, matched = 0
  for (const acc of accounts) {
    let booked
    try { booked = await getAccountTransactions(acc.account_id) } catch { continue }

    const rows = booked.map(t => {
      const pid = t.transactionId || t.internalTransactionId
      const remit = t.remittanceInformationUnstructured || (t.remittanceInformationUnstructuredArray || []).join(' ')
      return {
        user_id: userId,
        provider_tx_id: pid as string | undefined,
        account_id: acc.account_id,
        tx_date: t.bookingDate || t.valueDate || null,
        label: [t.debtorName, remit].filter(Boolean).join(' — ').slice(0, 200),
        amount: Number(t.transactionAmount?.amount) || 0,
        currency: t.transactionAmount?.currency || null,
        counterparty_iban: t.debtorAccount?.iban || null,
        source: 'bank',
        status: 'a_rapprocher',
      }
    }).filter(r => r.provider_tx_id)

    if (!rows.length) continue

    // Dédoublonnage : ne garde que les transactions pas encore importées.
    const { data: existing } = await supabase.from('bank_transactions')
      .select('provider_tx_id').eq('user_id', userId).eq('account_id', acc.account_id)
      .in('provider_tx_id', rows.map(r => r.provider_tx_id as string))
    const seen = new Set((existing || []).map(e => e.provider_tx_id))
    const fresh = rows.filter(r => !seen.has(r.provider_tx_id))

    if (fresh.length) {
      const { data: inserted } = await supabase.from('bank_transactions').insert(fresh)
        .select('id, amount, label, counterparty_iban')
      imported += inserted?.length || 0

      // Auto-rapprochement des nouveaux crédits (référence > IBAN > montant).
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

    await supabase.from('bank_accounts').update({ last_synced_at: new Date().toISOString() }).eq('account_id', acc.account_id)
  }
  return { imported, matched }
}
