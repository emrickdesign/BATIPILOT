import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import {
  Clock, FileText, Receipt, AlertTriangle, TrendingUp, Wallet, CalendarClock, CheckCircle2,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import StatCard from '@/components/charts/StatCard'
import DonutMetricCard from '@/components/charts/DonutMetricCard'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate } from '@/lib/utils'
import { clientDisplayName } from '@/lib/clients'
import { isRelanceDue, daysUntilExpiry } from '@/lib/relances'
import { devisRelanceMsg, factureRelanceMsg, chantierPlanifMsg } from '@/lib/relance-messages'
import RelanceContact from './RelanceContact'

const num = (v: unknown) => Number(v) || 0
const DAY = 86_400_000

function daysSince(d?: string | null): number {
  if (!d) return 0
  return Math.floor((Date.now() - new Date(d).getTime()) / DAY)
}

type ClientJoined = { type: string; first_name: string | null; last_name: string | null; company_name: string | null; phone?: string | null; email?: string | null } | null

async function getData(userId: string) {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]

  const clientCols = 'type, first_name, last_name, company_name, phone, email'
  const [quotesRes, invoicesRes, projectsRes] = await Promise.all([
    supabase.from('quotes')
      .select(`id, quote_number, status, total_ttc, issue_date, valid_until, reminded_at, clients(${clientCols})`)
      .eq('user_id', userId).eq('status', 'envoye'),
    // Toutes les factures non annulées → sert aux relances ET au donut de répartition
    supabase.from('invoices')
      .select(`id, invoice_number, status, total_ttc, amount_due, due_date, clients(${clientCols})`)
      .eq('user_id', userId).neq('status', 'annulee'),
    supabase.from('projects')
      .select(`id, title, status, clients(${clientCols})`)
      .eq('user_id', userId).eq('status', 'a_planifier'),
  ])

  const quotes = quotesRes.data || []
  const invoices = invoicesRes.data || []
  const projects = projectsRes.data || []

  const aRelancer = quotes
    .filter(q => isRelanceDue(q))
    .sort((a, b) => new Date(a.issue_date).getTime() - new Date(b.issue_date).getTime())

  const openInv = invoices.filter(i => ['envoyee', 'payee_partiellement', 'en_retard'].includes(i.status))
  const aEncaisser = openInv
    .map(inv => ({ ...inv, enRetard: !!inv.due_date && inv.due_date < today }))
    .sort((a, b) => Number(b.enRetard) - Number(a.enRetard) || (a.due_date || '').localeCompare(b.due_date || ''))

  const aConfirmer = projects // tous en statut 'a_planifier'

  // Donut de répartition (montants €)
  const encaisse = invoices.reduce((s, i) => s + (num(i.total_ttc) - num(i.amount_due)), 0)
  const overdueAmount = aEncaisser.filter(i => i.enRetard).reduce((s, i) => s + (num(i.amount_due) || num(i.total_ttc)), 0)
  const openNotOverdue = aEncaisser.filter(i => !i.enRetard).reduce((s, i) => s + (num(i.amount_due) || num(i.total_ttc)), 0)
  const montantEnAttenteSignature = quotes.reduce((s, q) => s + num(q.total_ttc), 0)

  return {
    aRelancer, aEncaisser, aConfirmer,
    montantEnAttenteSignature,
    montantAEncaisser: openInv.reduce((s, inv) => s + (num(inv.amount_due) || num(inv.total_ttc)), 0),
    nbARelancer: aRelancer.length,
    nbFacturesEnRetard: aEncaisser.filter(i => i.enRetard).length,
    donut: { encaisse, overdueAmount, openNotOverdue, devisEnAttente: montantEnAttenteSignature },
  }
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="animate-fade-up flex flex-col">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">{title} {count > 0 && <span className="text-gray-300">· {count}</span>}</h2>
      {/* Hauteur fixe → 4 cases identiques qui ne se referment pas si vides ; scroll interne au-delà */}
      <Card className="border border-gray-200/80 bg-white"><CardContent className="p-2 sm:p-4 h-[300px] overflow-y-auto">{children}</CardContent></Card>
    </div>
  )
}

const empty = (msg: string) => (
  <div className="flex flex-col items-center justify-center gap-2 text-sm text-gray-400 h-full text-center px-3">
    <CheckCircle2 className="w-5 h-5 text-[#3F7A2E]" /> {msg}
  </div>
)

export default async function RelancesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const d = await getData(user.id)
  const { data: company } = await supabase.from('companies').select('trade_name').eq('user_id', user.id).maybeSingle()
  const companyName = company?.trade_name || null

  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <h1 className="text-2xl md:text-[28px] font-heading font-bold text-marine">Relances</h1>
        <p className="text-gray-500 mt-1 text-sm">Tout ce qui doit être relancé, au même endroit : devis, paiements, chantiers.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 animate-fade-up">
        <StatCard label="Devis à relancer" value={String(d.nbARelancer)} icon={Clock} tone="coral" note="devis sans réponse" />
        <StatCard label="En attente de signature" value={formatCurrency(d.montantEnAttenteSignature)} icon={TrendingUp} tone="amber" note="devis envoyés (TTC)" />
        <StatCard label="Factures en retard" value={String(d.nbFacturesEnRetard)} icon={AlertTriangle} tone="red" note={`${d.nbFacturesEnRetard > 0 ? 'à traiter en priorité' : 'rien en retard'}`} />
        <StatCard label="Reste à encaisser" value={formatCurrency(d.montantAEncaisser)} icon={Wallet} tone="green" note="paiements attendus" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 animate-fade-up">
      {/* Devis à relancer (§9.1) */}
      <Section title="Devis sans réponse" count={d.aRelancer.length}>
        {d.aRelancer.length === 0 ? empty('Aucun devis en attente de relance. 👌') : (
          <div className="divide-y divide-gray-50">
            {d.aRelancer.map(q => {
              const j = daysSince(q.issue_date)
              const c = q.clients as unknown as ClientJoined
              return (
                <div key={q.id} className="flex items-center gap-3 py-2.5 px-1">
                  <span className="grid place-items-center w-9 h-9 rounded-lg bg-accent text-primary flex-shrink-0"><FileText className="w-4 h-4" /></span>
                  <div className="min-w-0 flex-1">
                    <Link href={`/devis/${q.id}`} className="text-sm font-medium text-marine hover:text-primary truncate block">
                      {clientDisplayName(c)} · <span className="font-mono text-xs text-gray-400">{q.quote_number}</span>
                    </Link>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-xs ${j >= 14 ? 'text-[#C0392B] font-medium' : 'text-gray-500'}`}>envoyé il y a {j} j</span>
                      {j >= 14 && <Badge className="bg-[#FBE0DA] text-[#C0392B] border-0 text-[10px]">prioritaire</Badge>}
                      {q.reminded_at && <Badge variant="outline" className="text-[10px]">relancé le {formatDate(q.reminded_at)}</Badge>}
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-marine tabular-nums hidden sm:block">{formatCurrency(q.total_ttc)}</span>
                  {(() => {
                    const m = devisRelanceMsg(clientDisplayName(c), q.quote_number, companyName, daysUntilExpiry(q.valid_until))
                    return <RelanceContact clientName={clientDisplayName(c)} email={c?.email ?? null} phone={c?.phone ?? null} subject={m.subject} body={m.body} sms={m.sms} markQuoteId={q.id} />
                  })()}
                </div>
              )
            })}
          </div>
        )}
      </Section>

      {/* Factures à encaisser (§9.1) */}
      <Section title="Factures non payées" count={d.aEncaisser.length}>
        {d.aEncaisser.length === 0 ? empty('Aucune facture en attente de paiement.') : (
          <div className="divide-y divide-gray-50">
            {d.aEncaisser.map(inv => {
              const c = inv.clients as unknown as ClientJoined
              return (
                <div key={inv.id} className="flex items-center gap-3 py-2.5 px-1">
                  <span className={`grid place-items-center w-9 h-9 rounded-lg flex-shrink-0 ${inv.enRetard ? 'bg-[#FBE0DA] text-[#C0392B]' : 'bg-[#FCE7DE] text-[#C14E33]'}`}><Receipt className="w-4 h-4" /></span>
                  <div className="min-w-0 flex-1">
                    <Link href={`/factures/${inv.id}`} className="text-sm font-medium text-marine hover:text-primary truncate block">
                      {clientDisplayName(c)} · <span className="font-mono text-xs text-gray-400">{inv.invoice_number}</span>
                    </Link>
                    <div className="flex items-center gap-2 mt-0.5">
                      {inv.due_date
                        ? <span className={`text-xs ${inv.enRetard ? 'text-[#C0392B] font-medium' : 'text-gray-500'}`}>{inv.enRetard ? 'échue le' : 'échéance'} {formatDate(inv.due_date)}</span>
                        : <span className="text-xs text-gray-400">sans échéance</span>}
                      {inv.enRetard && <Badge className="bg-[#FBE0DA] text-[#C0392B] border-0 text-[10px]">En retard</Badge>}
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-marine tabular-nums hidden sm:block">{formatCurrency(num(inv.amount_due) || num(inv.total_ttc))}</span>
                  {(() => {
                    const m = factureRelanceMsg(clientDisplayName(c), inv.invoice_number, num(inv.amount_due) || num(inv.total_ttc), inv.due_date, inv.enRetard, companyName)
                    return <RelanceContact clientName={clientDisplayName(c)} email={c?.email ?? null} phone={c?.phone ?? null} subject={m.subject} body={m.body} sms={m.sms} />
                  })()}
                </div>
              )
            })}
          </div>
        )}
      </Section>

      {/* Chantiers à confirmer (§9.1) */}
      <Section title="Chantiers à confirmer / planifier" count={d.aConfirmer.length}>
        {d.aConfirmer.length === 0 ? empty('Aucun chantier en attente de planification.') : (
          <div className="divide-y divide-gray-50">
            {d.aConfirmer.map(p => {
              const c = p.clients as unknown as ClientJoined
              return (
                <div key={p.id} className="flex items-center gap-3 py-2.5 px-1">
                  <span className="grid place-items-center w-9 h-9 rounded-lg bg-amber-100 text-amber-600 flex-shrink-0"><CalendarClock className="w-4 h-4" /></span>
                  <div className="min-w-0 flex-1">
                    <Link href={`/chantiers/${p.id}`} className="text-sm font-medium text-marine hover:text-primary truncate block">{p.title}</Link>
                    <span className="text-xs text-gray-500">{clientDisplayName(c)} · à planifier</span>
                  </div>
                  <Link href="/planning" className="text-xs font-medium text-primary hover:underline hidden sm:block flex-shrink-0">Planifier</Link>
                  {(() => {
                    const m = chantierPlanifMsg(clientDisplayName(c), p.title, companyName)
                    return <RelanceContact clientName={clientDisplayName(c)} email={c?.email ?? null} phone={c?.phone ?? null} subject={m.subject} body={m.body} sms={m.sms} />
                  })()}
                </div>
              )
            })}
          </div>
        )}
      </Section>

      {/* Répartition financière (remplace l'ancienne section avis, gérée dans l'onglet Avis) */}
      <DonutMetricCard
        title="Répartition"
        subtitle="Devis & factures"
        centerLabel="Total"
        total={formatCurrency(d.donut.encaisse + d.donut.openNotOverdue + d.donut.overdueAmount + d.donut.devisEnAttente)}
        format={formatCurrency}
        emptyMessage="Aucun montant à répartir pour le moment."
        segments={[
          { label: 'Encaissé', value: d.donut.encaisse, color: '#4E9331' },
          { label: 'À encaisser', value: d.donut.openNotOverdue, color: '#C9820F' },
          { label: 'En retard', value: d.donut.overdueAmount, color: '#CA4133' },
          { label: 'Devis en attente', value: d.donut.devisEnAttente, color: '#2F6BE8' },
        ]}
      />
      </div>

      <p className="text-[11px] text-gray-400">
        Suggestions automatiques : devis sans réponse depuis 7 j · facture impayée · chantier accepté à planifier. Les demandes d&apos;avis Google se gèrent dans l&apos;onglet <Link href="/avis" className="underline hover:text-gray-600">Avis clients</Link>.
      </p>
    </div>
  )
}
