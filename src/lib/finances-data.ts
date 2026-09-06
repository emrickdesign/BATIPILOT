// Requêtes partagées entre l'onglet Finances (hub) et les pages détail.
// Tout part du flux bancaire (vérité cash) + factures/dépenses (sens métier).

import { createClient } from '@/lib/supabase/server'
import { clientDisplayName } from '@/lib/clients'

const num = (v: unknown) => Number(v) || 0
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

export type Mouvement = {
  id: string
  date: string | null
  label: string | null
  amount: number
  status: string
  method: string | null
  ref: string | null
  kind: 'in' | 'out'
}
export type MonthAgg = { key: string; label: string; in: number; out: number; net: number }
export type TresorerieData = {
  solde: number
  hasBalance: boolean
  months: MonthAgg[]
  mouvements: Mouvement[]
  resteAEncaisser: number
  aDecaisser: number
  nbARapprocher: number
}

// 12 mois d'historique pour permettre le sélecteur de période.
export async function getTresorerieData(userId: string): Promise<TresorerieData> {
  const supabase = await createClient()
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() - 11, 1)
  const startIso = start.toISOString().split('T')[0]

  const [accRes, txRes, openInvRes, subToPayRes] = await Promise.all([
    supabase.from('bank_accounts').select('balance').eq('user_id', userId),
    supabase.from('bank_transactions')
      .select('id, tx_date, label, amount, status, match_method, matched_invoice_id, matched_expense_id')
      .eq('user_id', userId).neq('status', 'ignore').gte('tx_date', startIso).order('tx_date', { ascending: false }),
    supabase.from('invoices').select('amount_due, total_ttc')
      .eq('user_id', userId).in('status', ['envoyee', 'en_retard', 'payee_partiellement']),
    supabase.from('subcontractor_invoices').select('amount_ttc, amount_ht, status')
      .eq('user_id', userId).in('status', ['a_valider', 'validee']),
  ])

  const accounts = accRes.data || []
  const solde = accounts.reduce((s, a) => s + num(a.balance), 0)
  const hasBalance = accounts.some(a => a.balance !== null && a.balance !== undefined)
  const txns = txRes.data || []

  const invIds = [...new Set(txns.map(t => t.matched_invoice_id).filter(Boolean))] as string[]
  const expIds = [...new Set(txns.map(t => t.matched_expense_id).filter(Boolean))] as string[]
  const [invRefRes, expRefRes] = await Promise.all([
    invIds.length ? supabase.from('invoices').select('id, invoice_number').in('id', invIds) : Promise.resolve({ data: [] }),
    expIds.length ? supabase.from('expenses').select('id, supplier').in('id', expIds) : Promise.resolve({ data: [] }),
  ])
  const invRef = new Map((invRefRes.data || []).map(i => [i.id, i.invoice_number as string]))
  const expRef = new Map((expRefRes.data || []).map(e => [e.id, (e.supplier as string) || 'Dépense']))

  const mouvements: Mouvement[] = txns.map(t => {
    const amount = num(t.amount)
    const ref = t.matched_invoice_id ? invRef.get(t.matched_invoice_id) || null
      : t.matched_expense_id ? expRef.get(t.matched_expense_id) || null : null
    return {
      id: t.id, date: t.tx_date, label: t.label, amount,
      status: t.status as string, method: (t.match_method as string) || null, ref,
      kind: amount >= 0 ? 'in' : 'out',
    }
  })

  const months: MonthAgg[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: MONTHS[d.getMonth()], in: 0, out: 0, net: 0 })
  }
  const byKey = new Map(months.map(m => [m.key, m]))
  for (const t of txns) {
    if (!t.tx_date) continue
    const m = byKey.get(String(t.tx_date).slice(0, 7))
    if (!m) continue
    const a = num(t.amount)
    if (a >= 0) m.in += a; else m.out += a
  }
  for (const m of months) m.net = m.in + m.out

  const resteAEncaisser = (openInvRes.data || []).reduce((s, i) => s + (num(i.amount_due) || num(i.total_ttc)), 0)
  const aDecaisser = (subToPayRes.data || []).reduce((s, i) => s + (num(i.amount_ttc) || num(i.amount_ht) * 1.2), 0)
  // Compte les virements à rapprocher sur TOUT l'historique (pas seulement les 12 mois
  // affichés) — cohérent avec l'atelier Paiements, qui ne filtre pas par date.
  const { count: nbAR } = await supabase.from('bank_transactions')
    .select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'a_rapprocher')
  const nbARapprocher = nbAR || 0

  return { solde, hasBalance, months, mouvements, resteAEncaisser, aDecaisser, nbARapprocher }
}

// ─── Paiements (atelier de rapprochement) : virements à rapprocher + factures ouvertes ───

export type TxItem = {
  id: string
  tx_date: string | null
  label: string | null
  amount: number
  suggestion?: { invoiceId: string; invoiceNumber: string; clientName: string; clientId: string | null; amountDue: number } | null
}
export type PaiementOpenInvoice = { id: string; invoice_number: string; clientName: string; due: number; client_id: string | null }
export type PaiementsData = { transactions: TxItem[]; openInvoices: PaiementOpenInvoice[] }
type ClientLite = { type: string; first_name: string | null; last_name: string | null; company_name: string | null } | null

export async function getPaiementsData(userId: string): Promise<PaiementsData> {
  const supabase = await createClient()
  const [txRes, invRes] = await Promise.all([
    supabase.from('bank_transactions').select('id, tx_date, label, amount')
      .eq('user_id', userId).eq('status', 'a_rapprocher').order('tx_date', { ascending: false }),
    supabase.from('invoices').select('id, invoice_number, status, total_ttc, amount_due, client_id, clients(type, first_name, last_name, company_name)')
      .eq('user_id', userId).in('status', ['envoyee', 'en_retard', 'payee_partiellement']),
  ])

  const openInvoices: PaiementOpenInvoice[] = (invRes.data || []).map(inv => ({
    id: inv.id,
    invoice_number: inv.invoice_number as string,
    clientName: clientDisplayName(inv.clients as unknown as ClientLite),
    due: num(inv.amount_due) || num(inv.total_ttc),
    client_id: (inv.client_id as string | null) || null,
  }))

  const used = new Set<string>()
  const transactions: TxItem[] = (txRes.data || []).map(tx => {
    const amount = num(tx.amount)
    let suggestion: TxItem['suggestion'] = null
    if (amount > 0) {
      const label = (tx.label || '').toUpperCase()
      const candidates = openInvoices.filter(i => !used.has(i.id))
      const byAmount = candidates.filter(i => Math.abs(i.due - amount) <= 1)
      const nameMatch = (i: PaiementOpenInvoice) => {
        const token = i.clientName.toUpperCase().split(/\s+/).find(w => w.length >= 4)
        return token ? label.includes(token) : false
      }
      const best = byAmount.find(nameMatch) || byAmount[0] || candidates.find(nameMatch)
      if (best) {
        used.add(best.id)
        suggestion = { invoiceId: best.id, invoiceNumber: best.invoice_number, clientName: best.clientName, clientId: best.client_id, amountDue: best.due }
      }
    }
    return { id: tx.id, tx_date: tx.tx_date, label: tx.label, amount, suggestion }
  })

  return { transactions, openInvoices }
}
