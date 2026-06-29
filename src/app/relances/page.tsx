import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import {
  Clock, FileText, Receipt, AlertTriangle, TrendingUp, Wallet,
  CheckCircle2, type LucideIcon,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate } from '@/lib/utils'
import { clientDisplayName } from '@/lib/clients'
import RelanceButton from './RelanceButton'

const num = (v: unknown) => Number(v) || 0
const DAY = 86_400_000
const SEUIL_RELANCE = 7 // jours avant qu'un devis envoyé soit « à relancer »

function daysSince(d?: string | null): number {
  if (!d) return 0
  return Math.floor((Date.now() - new Date(d).getTime()) / DAY)
}

type ClientLite = { type: string; first_name: string | null; last_name: string | null; company_name: string | null } | null

async function getData(userId: string) {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]

  const [quotesRes, invoicesRes] = await Promise.all([
    supabase.from('quotes')
      .select('id, quote_number, status, total_ttc, issue_date, reminded_at, client_id, clients(type, first_name, last_name, company_name)')
      .eq('user_id', userId).eq('status', 'envoye'),
    supabase.from('invoices')
      .select('id, invoice_number, status, total_ttc, amount_due, due_date, issue_date, clients(type, first_name, last_name, company_name)')
      .eq('user_id', userId).in('status', ['envoyee', 'payee_partiellement', 'en_retard']),
  ])

  const quotes = quotesRes.data || []
  const invoices = invoicesRes.data || []

  // Devis à relancer : envoyés depuis ≥ 7j et pas relancés (ou relancés il y a ≥ 7j)
  const aRelancer = quotes
    .filter(q => daysSince(q.issue_date) >= SEUIL_RELANCE && (!q.reminded_at || daysSince(q.reminded_at) >= SEUIL_RELANCE))
    .sort((a, b) => new Date(a.issue_date).getTime() - new Date(b.issue_date).getTime())

  // Factures à encaisser, en retard d'abord
  const aEncaisser = invoices
    .map(inv => ({ ...inv, enRetard: !!inv.due_date && inv.due_date < today }))
    .sort((a, b) => Number(b.enRetard) - Number(a.enRetard) || (a.due_date || '').localeCompare(b.due_date || ''))

  return {
    aRelancer,
    aEncaisser,
    montantEnAttenteSignature: quotes.reduce((s, q) => s + num(q.total_ttc), 0),
    montantAEncaisser: invoices.reduce((s, inv) => s + (num(inv.amount_due) || num(inv.total_ttc)), 0),
    nbARelancer: aRelancer.length,
    nbFacturesEnRetard: aEncaisser.filter(i => i.enRetard).length,
  }
}

function Kpi({ label, value, icon: Icon, tile, sub }: { label: string; value: string; icon: LucideIcon; tile: string; sub?: string }) {
  return (
    <Card className="border border-gray-200/80 bg-white h-full">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500 font-medium">{label}</span>
          <span className={`grid place-items-center w-8 h-8 rounded-lg ${tile}`}><Icon className="w-4 h-4" /></span>
        </div>
        <div className="text-[24px] font-bold text-marine mt-2 leading-none">{value}</div>
        {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
      </CardContent>
    </Card>
  )
}

export default async function RelancesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const d = await getData(user.id)

  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <h1 className="text-2xl md:text-[28px] font-heading font-bold text-marine">Relances & encaissements</h1>
        <p className="text-gray-500 mt-1 text-sm">Les devis à relancer et les factures à encaisser, au même endroit.</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 animate-fade-up">
        <Kpi label="Devis à relancer" value={String(d.nbARelancer)} icon={Clock} tile="bg-accent text-primary" />
        <Kpi label="En attente de signature" value={formatCurrency(d.montantEnAttenteSignature)} icon={TrendingUp} tile="bg-violet-100 text-violet-600" sub="devis envoyés (TTC)" />
        <Kpi label="Factures en retard" value={String(d.nbFacturesEnRetard)} icon={AlertTriangle} tile="bg-rose-100 text-rose-600" />
        <Kpi label="Reste à encaisser" value={formatCurrency(d.montantAEncaisser)} icon={Wallet} tile="bg-emerald-100 text-emerald-600" />
      </div>

      {/* Devis à relancer */}
      <div className="animate-fade-up">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Devis à relancer</h2>
        <Card className="border border-gray-200/80 bg-white">
          <CardContent className="p-2 sm:p-4">
            {d.aRelancer.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-gray-400 py-6 justify-center">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Aucun devis en attente de relance. 👌
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {d.aRelancer.map(q => {
                  const j = daysSince(q.issue_date)
                  return (
                    <div key={q.id} className="flex items-center gap-3 py-2.5 px-1">
                      <span className="grid place-items-center w-9 h-9 rounded-lg bg-accent text-primary flex-shrink-0">
                        <FileText className="w-4 h-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <Link href={`/devis/${q.id}`} className="text-sm font-medium text-marine hover:text-primary truncate block">
                          {clientDisplayName(q.clients as unknown as ClientLite)} · <span className="font-mono text-xs text-gray-400">{q.quote_number}</span>
                        </Link>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-xs ${j >= 14 ? 'text-rose-600 font-medium' : 'text-gray-500'}`}>envoyé il y a {j} j</span>
                          {q.reminded_at && <Badge variant="outline" className="text-[10px]">relancé le {formatDate(q.reminded_at)}</Badge>}
                        </div>
                      </div>
                      <span className="text-sm font-semibold text-marine tabular-nums hidden sm:block">{formatCurrency(q.total_ttc)}</span>
                      <RelanceButton quoteId={q.id} />
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Factures à encaisser */}
      <div className="animate-fade-up">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Factures à encaisser</h2>
        <Card className="border border-gray-200/80 bg-white">
          <CardContent className="p-2 sm:p-4">
            {d.aEncaisser.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-gray-400 py-6 justify-center">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Aucune facture en attente de paiement.
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {d.aEncaisser.map(inv => (
                  <Link key={inv.id} href={`/factures/${inv.id}`} className="flex items-center gap-3 py-2.5 px-1 hover:bg-gray-50 rounded-lg">
                    <span className={`grid place-items-center w-9 h-9 rounded-lg flex-shrink-0 ${inv.enRetard ? 'bg-rose-100 text-rose-600' : 'bg-blue-100 text-blue-600'}`}>
                      <Receipt className="w-4 h-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium text-marine truncate block">
                        {clientDisplayName(inv.clients as unknown as ClientLite)} · <span className="font-mono text-xs text-gray-400">{inv.invoice_number}</span>
                      </span>
                      <div className="flex items-center gap-2 mt-0.5">
                        {inv.due_date
                          ? <span className={`text-xs ${inv.enRetard ? 'text-rose-600 font-medium' : 'text-gray-500'}`}>{inv.enRetard ? 'échue le' : 'échéance'} {formatDate(inv.due_date)}</span>
                          : <span className="text-xs text-gray-400">sans échéance</span>}
                        {inv.enRetard && <Badge className="bg-rose-100 text-rose-700 border-0 text-[10px]">En retard</Badge>}
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-marine tabular-nums">{formatCurrency(num(inv.amount_due) || num(inv.total_ttc))}</span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
