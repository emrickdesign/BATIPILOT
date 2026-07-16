import type { SupabaseClient } from '@supabase/supabase-js'
import { monthKey, monthLabel, type MonthExpense, type MonthInvoice, type MonthSubInvoice } from './shared'

type ClientRow = { type?: string | null; company_name?: string | null; first_name?: string | null; last_name?: string | null }
function clientName(c?: ClientRow | null): string {
  if (!c) return ''
  return c.type === 'professionnel'
    ? (c.company_name || '')
    : `${c.first_name || ''} ${c.last_name || ''}`.trim()
}

export type Month = {
  key: string
  label: string
  expenses: MonthExpense[]
  invoices: MonthInvoice[]
  subInvoices: MonthSubInvoice[]
}

/** Achats (dépenses + sous-traitance) et ventes du user, regroupés par mois (récent d'abord). */
export async function loadMonths(supabase: SupabaseClient, userId: string): Promise<Month[]> {
  const [expRes, invRes, subRes] = await Promise.all([
    supabase.from('expenses')
      .select('id, expense_date, created_at, supplier, category, amount_ht, amount_ttc, vat_amount, vat_rate, payment_method, ticket_number, notes, status, storage_path, projects(title)')
      .eq('user_id', userId).neq('status', 'archive'),
    // invoice_lines : indispensable pour ventiler les ventes par taux de TVA (cases CA3)
    supabase.from('invoices')
      .select('id, invoice_number, status, subtotal_ht, total_vat, total_ttc, issue_date, created_at, clients(type, company_name, first_name, last_name), invoice_lines(vat_rate, total_ht)')
      .eq('user_id', userId),
    // Les factures de sous-traitance sont aussi des achats : le comptable en a besoin.
    supabase.from('subcontractor_invoices')
      .select('id, number, issue_date, created_at, amount_ht, amount_ttc, status, storage_path, subcontractors(company_name)')
      .eq('user_id', userId),
  ])

  const months = new Map<string, { expenses: MonthExpense[]; invoices: MonthInvoice[]; subInvoices: MonthSubInvoice[] }>()
  const ensure = (key: string) => {
    if (!months.has(key)) months.set(key, { expenses: [], invoices: [], subInvoices: [] })
    return months.get(key)!
  }

  for (const e of expRes.data || []) {
    const key = monthKey(e.expense_date || e.created_at)
    if (key) ensure(key).expenses.push(e as unknown as MonthExpense)
  }
  for (const i of invRes.data || []) {
    const key = monthKey(i.issue_date || i.created_at)
    if (!key) continue
    ensure(key).invoices.push({
      id: i.id,
      invoice_number: i.invoice_number || '',
      issue_date: i.issue_date,
      subtotal_ht: Number(i.subtotal_ht) || 0,
      total_vat: Number(i.total_vat) || 0,
      total_ttc: Number(i.total_ttc) || 0,
      status: i.status,
      client_name: clientName(i.clients as unknown as ClientRow),
      lines: ((i.invoice_lines as unknown as { vat_rate: number | null; total_ht: number | null }[]) || [])
        .map(l => ({ vat_rate: Number(l.vat_rate) || 0, total_ht: Number(l.total_ht) || 0 })),
    })
  }
  for (const s of subRes.data || []) {
    const key = monthKey(s.issue_date || s.created_at)
    if (!key) continue
    ensure(key).subInvoices.push({
      id: s.id,
      number: s.number || '',
      issue_date: s.issue_date,
      amount_ht: s.amount_ht == null ? null : Number(s.amount_ht),
      amount_ttc: s.amount_ttc == null ? null : Number(s.amount_ttc),
      status: s.status,
      storage_path: s.storage_path,
      company_name: (s.subcontractors as unknown as { company_name?: string } | null)?.company_name || '',
    })
  }

  return [...months.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, v]) => ({ key, label: monthLabel(key), ...v }))
}
