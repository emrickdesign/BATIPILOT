import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ReceiptText, FileWarning, Send, CheckCircle2, Wallet, FileText } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import MonthActions, { type MonthExpense } from './MonthActions'

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
const num = (v: unknown) => Number(v) || 0

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

async function getData(userId: string) {
  const supabase = await createClient()
  const [expRes, invRes] = await Promise.all([
    supabase.from('expenses')
      .select('id, expense_date, created_at, supplier, category, amount_ht, amount_ttc, vat_amount, vat_rate, payment_method, ticket_number, notes, status, storage_path, projects(title)')
      .eq('user_id', userId).neq('status', 'archive'),
    supabase.from('invoices')
      .select('id, invoice_number, status, total_ttc, issue_date, created_at')
      .eq('user_id', userId),
  ])

  const expenses = expRes.data || []
  const invoices = invRes.data || []

  // Regroupe par mois (clé YYYY-MM)
  const months = new Map<string, { expenses: MonthExpense[]; invoices: typeof invoices }>()
  const ensure = (key: string) => {
    if (!months.has(key)) months.set(key, { expenses: [], invoices: [] })
    return months.get(key)!
  }
  for (const e of expenses) {
    const key = monthKey(e.expense_date || e.created_at)
    if (key) ensure(key).expenses.push(e as unknown as MonthExpense)
  }
  for (const inv of invoices) {
    const key = monthKey(inv.issue_date || inv.created_at)
    if (key) ensure(key).invoices.push(inv)
  }

  const isPaid = (s: string) => s === 'payee' || s === 'paye'
  const isSent = (s: string) => s !== 'brouillon'

  return [...months.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, { expenses: exp, invoices: inv }]) => ({
      key,
      label: monthLabel(key),
      expenses: exp,
      invoices: inv.map(i => ({ invoice_number: (i as { invoice_number?: string }).invoice_number || '', total_ttc: num(i.total_ttc), issue_date: i.issue_date, status: i.status })),
      nbTickets: exp.length,
      totalDepenses: exp.reduce((s, e) => s + num(e.amount_ttc), 0),
      aVerifier: exp.filter(e => e.status === 'a_verifier').length,
      justifManquants: exp.filter(e => !e.storage_path).length,
      envoyeCompta: exp.filter(e => e.status === 'envoye_comptable').length,
      facturesTransmises: inv.filter(i => isSent(i.status)).length,
      paiementsDetectes: inv.filter(i => isPaid(i.status)).length,
    }))
}

function Stat({ icon: Icon, value, label, tone }: { icon: typeof Wallet; value: string; label: string; tone: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={`grid place-items-center w-9 h-9 rounded-lg flex-shrink-0 ${tone}`}><Icon className="w-4 h-4" /></span>
      <div className="min-w-0">
        <div className="text-base font-bold text-marine leading-none">{value}</div>
        <div className="text-[11px] text-gray-500 leading-tight mt-0.5">{label}</div>
      </div>
    </div>
  )
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
        <p className="text-gray-500 mt-1 text-sm">Tes dépenses et factures regroupées par mois, prêtes à envoyer à la comptable.</p>
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
            <Card key={m.key} className="border border-gray-200/80 bg-white animate-fade-up" style={{ animationDelay: `${i * 50}ms` }}>
              <CardContent className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg font-heading font-bold text-marine capitalize">{m.label}</h2>
                    {m.justifManquants > 0 && (
                      <Badge className="bg-amber-100 text-amber-700 border-0 gap-1 text-xs">
                        <FileWarning className="w-3 h-3" /> {m.justifManquants} justificatif{m.justifManquants > 1 ? 's' : ''} manquant{m.justifManquants > 1 ? 's' : ''}
                      </Badge>
                    )}
                    {m.envoyeCompta === m.nbTickets && m.nbTickets > 0 && (
                      <Badge className="bg-[#F3E5D6] text-[#8A4B24] border-0 gap-1 text-xs">
                        <CheckCircle2 className="w-3 h-3" /> envoyé
                      </Badge>
                    )}
                  </div>
                  <MonthActions monthKey={m.key} label={m.label} expenses={m.expenses} invoices={m.invoices} />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  <Stat icon={ReceiptText} value={String(m.nbTickets)} label="tickets / dépenses" tone="bg-[#FCE7DE] text-[#C14E33]" />
                  <Stat icon={Wallet} value={formatCurrency(m.totalDepenses)} label="total dépenses TTC" tone="bg-accent text-primary" />
                  <Stat icon={FileWarning} value={String(m.aVerifier)} label="à vérifier" tone="bg-amber-100 text-amber-600" />
                  <Stat icon={Send} value={String(m.envoyeCompta)} label="envoyés compta" tone="bg-[#F3E5D6] text-[#8A4B24]" />
                  <Stat icon={FileText} value={String(m.facturesTransmises)} label="factures transmises" tone="bg-[#EFE7DA] text-[#8A5A2A]" />
                  <Stat icon={CheckCircle2} value={String(m.paiementsDetectes)} label="paiements détectés" tone="bg-[#E9F2DB] text-[#3F7A2E]" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
