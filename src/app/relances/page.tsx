import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import {
  Clock, FileText, Receipt, AlertTriangle, TrendingUp, Wallet, Star, CalendarClock,
  CheckCircle2, Phone, Mail, MessageCircle, type LucideIcon,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate } from '@/lib/utils'
import { clientDisplayName } from '@/lib/clients'
import RelanceButton from './RelanceButton'

const num = (v: unknown) => Number(v) || 0
const DAY = 86_400_000
const SEUIL_RELANCE = 7 // devis envoyé → à relancer (doc §9.3)
const CLOSED = ['termine', 'a_facturer', 'facture', 'paye']

function daysSince(d?: string | null): number {
  if (!d) return 0
  return Math.floor((Date.now() - new Date(d).getTime()) / DAY)
}

type ClientJoined = { type: string; first_name: string | null; last_name: string | null; company_name: string | null; phone?: string | null; email?: string | null } | null

function waLink(phone?: string | null) {
  if (!phone) return null
  let p = phone.replace(/\D/g, '')
  if (p.startsWith('0')) p = '33' + p.slice(1)
  return p.length >= 8 ? `https://wa.me/${p}` : null
}

function ContactActions({ client }: { client: ClientJoined }) {
  const wa = waLink(client?.phone)
  const base = 'grid place-items-center w-8 h-8 rounded-lg bg-gray-50 text-gray-500 hover:bg-accent hover:text-primary transition-colors flex-shrink-0'
  return (
    <div className="flex items-center gap-1 flex-shrink-0">
      {client?.phone && <a href={`tel:${client.phone}`} title="Appeler" className={base}><Phone className="w-3.5 h-3.5" /></a>}
      {wa && <a href={wa} target="_blank" rel="noopener noreferrer" title="WhatsApp" className={base}><MessageCircle className="w-3.5 h-3.5" /></a>}
      {client?.email && <a href={`mailto:${client.email}`} title="Email" className={base}><Mail className="w-3.5 h-3.5" /></a>}
    </div>
  )
}

async function getData(userId: string) {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]
  const avisDepuis = new Date(Date.now() - 30 * DAY).toISOString().split('T')[0]

  const clientCols = 'type, first_name, last_name, company_name, phone, email'
  const [quotesRes, invoicesRes, projectsRes] = await Promise.all([
    supabase.from('quotes')
      .select(`id, quote_number, status, total_ttc, issue_date, reminded_at, clients(${clientCols})`)
      .eq('user_id', userId).eq('status', 'envoye'),
    supabase.from('invoices')
      .select(`id, invoice_number, status, total_ttc, amount_due, due_date, clients(${clientCols})`)
      .eq('user_id', userId).in('status', ['envoyee', 'payee_partiellement', 'en_retard']),
    supabase.from('projects')
      .select(`id, title, status, start_date, end_date, clients(${clientCols})`)
      .eq('user_id', userId).in('status', ['a_planifier', ...CLOSED]),
  ])

  const quotes = quotesRes.data || []
  const invoices = invoicesRes.data || []
  const projects = projectsRes.data || []

  const aRelancer = quotes
    .filter(q => daysSince(q.issue_date) >= SEUIL_RELANCE && (!q.reminded_at || daysSince(q.reminded_at) >= SEUIL_RELANCE))
    .sort((a, b) => new Date(a.issue_date).getTime() - new Date(b.issue_date).getTime())

  const aEncaisser = invoices
    .map(inv => ({ ...inv, enRetard: !!inv.due_date && inv.due_date < today }))
    .sort((a, b) => Number(b.enRetard) - Number(a.enRetard) || (a.due_date || '').localeCompare(b.due_date || ''))

  // Chantiers à confirmer / planifier (devis accepté → chantier à planifier)
  const aConfirmer = projects.filter(p => p.status === 'a_planifier')

  // Avis client à demander : chantier terminé récemment (≤ 30 j)
  const avisADemander = projects.filter(p => CLOSED.includes(p.status) && p.end_date && p.end_date >= avisDepuis && p.end_date <= today)
    .sort((a, b) => (b.end_date || '').localeCompare(a.end_date || ''))

  return {
    aRelancer, aEncaisser, aConfirmer, avisADemander,
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

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="animate-fade-up">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">{title} {count > 0 && <span className="text-gray-300">· {count}</span>}</h2>
      <Card className="border border-gray-200/80 bg-white"><CardContent className="p-2 sm:p-4">{children}</CardContent></Card>
    </div>
  )
}

const empty = (msg: string) => (
  <div className="flex items-center gap-2 text-sm text-gray-400 py-6 justify-center">
    <CheckCircle2 className="w-4 h-4 text-[#3F7A2E]" /> {msg}
  </div>
)

export default async function RelancesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const d = await getData(user.id)

  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <h1 className="text-2xl md:text-[28px] font-heading font-bold text-marine">Relances</h1>
        <p className="text-gray-500 mt-1 text-sm">Tout ce qui doit être relancé, au même endroit : devis, paiements, chantiers, avis.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 animate-fade-up">
        <Kpi label="Devis à relancer" value={String(d.nbARelancer)} icon={Clock} tile="bg-accent text-primary" />
        <Kpi label="En attente de signature" value={formatCurrency(d.montantEnAttenteSignature)} icon={TrendingUp} tile="bg-[#F3E5D6] text-[#8A4B24]" sub="devis envoyés (TTC)" />
        <Kpi label="Factures en retard" value={String(d.nbFacturesEnRetard)} icon={AlertTriangle} tile="bg-[#FBE0DA] text-[#C0392B]" />
        <Kpi label="Reste à encaisser" value={formatCurrency(d.montantAEncaisser)} icon={Wallet} tile="bg-[#E9F2DB] text-[#3F7A2E]" />
      </div>

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
                  <ContactActions client={c} />
                  <RelanceButton quoteId={q.id} />
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
                  <ContactActions client={c} />
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
                  <ContactActions client={c} />
                </div>
              )
            })}
          </div>
        )}
      </Section>

      {/* Avis clients à demander (§9.1 / §9.3) */}
      <Section title="Avis clients à demander" count={d.avisADemander.length}>
        {d.avisADemander.length === 0 ? empty('Aucun chantier récemment terminé.') : (
          <div className="divide-y divide-gray-50">
            {d.avisADemander.map(p => {
              const c = p.clients as unknown as ClientJoined
              return (
                <div key={p.id} className="flex items-center gap-3 py-2.5 px-1">
                  <span className="grid place-items-center w-9 h-9 rounded-lg bg-yellow-100 text-yellow-600 flex-shrink-0"><Star className="w-4 h-4" /></span>
                  <div className="min-w-0 flex-1">
                    <Link href={`/chantiers/${p.id}`} className="text-sm font-medium text-marine hover:text-primary truncate block">{p.title}</Link>
                    <span className="text-xs text-gray-500">{clientDisplayName(c)} · terminé le {p.end_date ? formatDate(p.end_date) : '—'}</span>
                  </div>
                  <ContactActions client={c} />
                </div>
              )
            })}
          </div>
        )}
      </Section>

      <p className="text-[11px] text-gray-400">
        Suggestions automatiques : devis sans réponse depuis 7 j · facture impayée · chantier accepté à planifier · avis à demander après un chantier terminé. « Information manquante » et « client à rappeler » suivront avec un suivi de relances dédié.
      </p>
    </div>
  )
}
