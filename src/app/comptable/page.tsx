import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import MonthCard from './MonthCard'
import type { MonthExpense, MonthInvoice, MonthSubInvoice } from './shared'

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

function monthKey(d?: string | null): string | null {
  if (!d) return null
  const date = new Date(d)
  if (isNaN(date.getTime())) return null
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}
function monthLabel(key: string): string {
  const [y, m] = key.split('-')
  return `${MONTHS[Number(m) - 1]} ${y}`
}

type ClientRow = { type?: string | null; company_name?: string | null; first_name?: string | null; last_name?: string | null }
function clientName(c?: ClientRow | null): string {
  if (!c) return ''
  return c.type === 'professionnel'
    ? (c.company_name || '')
    : `${c.first_name || ''} ${c.last_name || ''}`.trim()
}

async function getData(userId: string) {
  const supabase = await createClient()
  const [expRes, invRes, subRes] = await Promise.all([
    supabase.from('expenses')
      .select('id, expense_date, created_at, supplier, category, amount_ht, amount_ttc, vat_amount, vat_rate, payment_method, ticket_number, notes, status, storage_path, projects(title)')
      .eq('user_id', userId).neq('status', 'archive'),
    supabase.from('invoices')
      .select('id, invoice_number, status, subtotal_ht, total_vat, total_ttc, issue_date, created_at, clients(type, company_name, first_name, last_name)')
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

export default async function ComptablePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const months = await getData(user.id)

  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <h1 className="text-2xl md:text-[28px] font-heading font-bold text-marine">Préparation comptable</h1>
        <p className="text-gray-500 mt-1 text-sm">Tes achats et tes ventes regroupés par mois, prêts à envoyer à la comptable. Clique un chiffre pour voir le détail.</p>
      </div>

      {months.length === 0 ? (
        <Card className="border border-gray-200/80 bg-white">
          <CardContent className="p-10 text-center text-gray-400">
            Aucune dépense ni facture pour l&apos;instant. Scanne un ticket ou crée une facture pour démarrer.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {months.map((m, i) => (
            <MonthCard key={m.key} monthKey={m.key} label={m.label} expenses={m.expenses}
              invoices={m.invoices} subInvoices={m.subInvoices} index={i} />
          ))}
        </div>
      )}
    </div>
  )
}
