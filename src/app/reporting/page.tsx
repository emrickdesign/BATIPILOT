import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import {
  TrendingUp, FileText, CheckCircle2, XCircle, Clock, HardHat, Wallet, Users2,
  Send, Percent, Target, Coins, BellRing, UserPlus, CalendarClock, Banknote,
  type LucideIcon,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import StatCard, { type StatTone } from '@/components/charts/StatCard'
import DonutMetricCard from '@/components/charts/DonutMetricCard'
import { formatCurrency } from '@/lib/utils'
import { projectStatusLabels } from '@/lib/chantiers'
import { prospectStatuses, clientDisplayName } from '@/lib/clients'
import type { ProjectStatus, ClientStatus } from '@/types'

const BRAND = '#E0674C'
const RCOLORS = ['#D05C43', '#C77D0E', '#8A4B24', '#3F7A2E', '#2F7DE0', '#0E9F8E', '#B8860B', '#94918A']
const kEur = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1).replace('.', ',')} k€` : `${Math.round(v)} €`)
const MONTHS = ['Janv', 'Févr', 'Mars', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc']
const CLOSED: ProjectStatus[] = ['termine', 'facture', 'paye', 'archive']
const num = (v: unknown) => Number(v) || 0

type Periode = 'mois' | 'trimestre' | 'annee' | 'tout'
const PERIODES: { key: Periode; label: string }[] = [
  { key: 'mois', label: 'Ce mois' },
  { key: 'trimestre', label: 'Trimestre' },
  { key: 'annee', label: 'Année' },
  { key: 'tout', label: 'Tout' },
]

function sinceDate(p: Periode): string | null {
  const now = new Date()
  if (p === 'mois') return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  if (p === 'trimestre') {
    const qStart = Math.floor(now.getMonth() / 3) * 3
    return new Date(now.getFullYear(), qStart, 1).toISOString().split('T')[0]
  }
  if (p === 'annee') return new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0]
  return null // tout
}

async function getData(userId: string, periode: Periode) {
  const supabase = await createClient()
  const now = new Date()
  const since = sinceDate(periode)
  const today = now.toISOString().split('T')[0]

  const [quotesR, invoicesR, projectsR, expensesR, timesR, employeesR, documentsR, clientsR, assignmentsR] = await Promise.all([
    supabase.from('quotes').select('id, status, total_ttc, subtotal_ht, issue_date, created_at, project_id, client_id, reminded_at').eq('user_id', userId),
    supabase.from('invoices').select('status, total_ttc, subtotal_ht, amount_due, issue_date, created_at, client_id, quote_id').eq('user_id', userId),
    supabase.from('projects').select('id, title, status, start_date, end_date, project_type').eq('user_id', userId),
    supabase.from('expenses').select('amount_ht, amount_ttc, category, expense_date, created_at, status, project_id').eq('user_id', userId),
    supabase.from('time_entries').select('employee_id, project_id, hours, date, status').eq('user_id', userId),
    supabase.from('employees').select('id, full_name, hourly_cost, color, active').eq('user_id', userId),
    supabase.from('documents').select('id').eq('user_id', userId),
    supabase.from('clients').select('id, type, first_name, last_name, company_name, status, created_at').eq('user_id', userId),
    supabase.from('assignments').select('employee_id, project_id, date').eq('user_id', userId),
  ])

  const inPeriod = (d?: string | null) => !since || (!!d && d >= since)

  const quotesAll = quotesR.data || []
  const invAll = invoicesR.data || []
  const pr = projectsR.data || []
  const expAll = expensesR.data || []
  const tmAll = timesR.data || []
  const emp = employeesR.data || []
  const cl = clientsR.data || []
  const asg = assignmentsR.data || []
  const docCount = (documentsR.data || []).length

  // Filtrés sur la période sélectionnée (KPIs)
  const q = quotesAll.filter(x => inPeriod(x.issue_date || x.created_at))
  const inv = invAll.filter(x => inPeriod(x.issue_date || x.created_at))
  const exp = expAll.filter(x => inPeriod(x.expense_date || x.created_at))
  const tm = tmAll.filter(x => inPeriod(x.date))

  const empCost = new Map(emp.map(e => [e.id, num(e.hourly_cost)]))
  const projTitle = new Map(pr.map(p => [p.id, p.title]))
  const projType = new Map(pr.map(p => [p.id, p.project_type || 'Non défini']))
  const clName = new Map(cl.map(c => [c.id, clientDisplayName(c)]))

  const isSigned = (s: string) => s === 'accepte' || s === 'transforme'
  const isPaid = (s: string) => s === 'payee' || s === 'paye'
  const isOpen = (s: string) => s === 'envoyee' || s === 'en_retard' || s === 'payee_partiellement'

  // ── §4.1 Financière ─────────────────────────────────────────────────
  const encaisse = inv.filter(x => isPaid(x.status)).reduce((s, x) => s + num(x.total_ttc), 0)
  const facture = inv.filter(x => x.status !== 'brouillon').reduce((s, x) => s + num(x.total_ttc), 0)
  const openInv = invAll.filter(x => isOpen(x.status)) // snapshot, hors période
  const resteAEncaisser = openInv.reduce((s, x) => s + (num(x.amount_due) || num(x.total_ttc)), 0)
  const depensesTotal = exp.reduce((s, x) => s + num(x.amount_ttc), 0)

  // Reste à encaisser par client
  const resteByClient = new Map<string, number>()
  for (const i of openInv) {
    const k = i.client_id || '?'
    resteByClient.set(k, (resteByClient.get(k) || 0) + (num(i.amount_due) || num(i.total_ttc)))
  }
  const resteClients = [...resteByClient].map(([id, value]) => ({ label: clName.get(id) || 'Client', value }))
    .filter(x => x.value > 0).sort((a, b) => b.value - a.value).slice(0, 6)

  // Dépenses par catégorie
  const depByCat = new Map<string, number>()
  for (const e of exp) { const k = e.category || 'Autre'; depByCat.set(k, (depByCat.get(k) || 0) + num(e.amount_ttc)) }
  const depCats = [...depByCat].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8)

  // Séries 6 derniers mois (indépendant de la période)
  const months = Array.from({ length: 6 }, (_, k) => new Date(now.getFullYear(), now.getMonth() - (5 - k), 1))
  const inMonth = (s: string | null | undefined, m: Date) => {
    if (!s) return false
    const x = new Date(s); return x.getFullYear() === m.getFullYear() && x.getMonth() === m.getMonth()
  }
  const finMensuel = months.map(m => ({
    label: MONTHS[m.getMonth()],
    a: invAll.filter(i => i.status !== 'brouillon' && inMonth(i.issue_date || i.created_at, m)).reduce((s, i) => s + num(i.total_ttc), 0),
    b: invAll.filter(i => isPaid(i.status) && inMonth(i.issue_date || i.created_at, m)).reduce((s, i) => s + num(i.total_ttc), 0),
  }))

  // ── §4.2 Commerciale ────────────────────────────────────────────────
  const prospectsActuels = cl.filter(c => prospectStatuses.includes(c.status as ClientStatus)).length
  const nouveauxProspects = cl.filter(c => prospectStatuses.includes(c.status as ClientStatus) && inPeriod(c.created_at)).length
  const devisCrees = q.length
  const devisEnvoyes = q.filter(x => x.status !== 'brouillon').length
  const devisAcceptes = q.filter(x => isSigned(x.status)).length
  const devisRefuses = q.filter(x => x.status === 'refuse').length
  const devisEnAttente = q.filter(x => x.status === 'envoye').length
  const decided = devisAcceptes + devisRefuses
  const tauxAccept = decided > 0 ? Math.round((devisAcceptes / decided) * 100) : 0
  const montantDevise = q.filter(x => x.status !== 'brouillon').reduce((s, x) => s + num(x.total_ttc), 0)
  const montantSigne = q.filter(x => isSigned(x.status)).reduce((s, x) => s + num(x.total_ttc), 0)
  const montantMoyenDevis = devisEnvoyes > 0 ? montantDevise / devisEnvoyes : 0
  const relancesEffectuees = q.filter(x => x.reminded_at && inPeriod(x.reminded_at)).length
  const devisMensuel = months.map(m => ({
    label: MONTHS[m.getMonth()],
    value: quotesAll.filter(x => x.status !== 'brouillon' && inMonth(x.issue_date || x.created_at, m)).reduce((s, x) => s + num(x.total_ttc), 0),
  }))

  // ── §4.3 Chantiers & marge ──────────────────────────────────────────
  const chantiersEnCours = pr.filter(x => x.status === 'en_cours').length
  const chantiersTermines = pr.filter(x => CLOSED.includes(x.status as ProjectStatus)).length
  const chantiersEnRetard = pr.filter(x => !CLOSED.includes(x.status as ProjectStatus) && x.end_date && x.end_date < today).length

  const hoursByProject = new Map<string, number>()
  const laborByProject = new Map<string, number>()
  for (const t of tm) {
    if (!t.project_id) continue
    hoursByProject.set(t.project_id, (hoursByProject.get(t.project_id) || 0) + num(t.hours))
    laborByProject.set(t.project_id, (laborByProject.get(t.project_id) || 0) + num(t.hours) * (empCost.get(t.employee_id) || 0))
  }
  const expByProject = new Map<string, number>()
  for (const e of exp) {
    if (!e.project_id) continue
    expByProject.set(e.project_id, (expByProject.get(e.project_id) || 0) + num(e.amount_ht || e.amount_ttc))
  }
  const revByProject = new Map<string, number>()
  for (const x of q) {
    if (x.project_id && isSigned(x.status)) revByProject.set(x.project_id, (revByProject.get(x.project_id) || 0) + num(x.subtotal_ht))
  }
  const projectIds = new Set<string>([...revByProject.keys(), ...expByProject.keys(), ...laborByProject.keys()])
  const marges = [...projectIds].map(id => {
    const rev = revByProject.get(id) || 0
    const cost = (expByProject.get(id) || 0) + (laborByProject.get(id) || 0)
    return { id, title: projTitle.get(id) || 'Chantier', rev, cost, marge: rev - cost }
  }).sort((a, b) => b.rev - a.rev)
  const margeGlobale = marges.reduce((s, m) => s + m.marge, 0)
  const revGlobal = marges.reduce((s, m) => s + m.rev, 0)
  const heuresParChantier = [...hoursByProject].map(([id, value]) => ({ label: projTitle.get(id) || 'Chantier', value }))
    .filter(x => x.value > 0).sort((a, b) => b.value - a.value).slice(0, 6)

  // ── §4.4 Équipe & heures ────────────────────────────────────────────
  const heuresDeclarees = tm.reduce((s, x) => s + num(x.hours), 0)
  const heuresValidees = tm.filter(x => x.status === 'valide').reduce((s, x) => s + num(x.hours), 0)
  const masseSalariale = tm.reduce((s, x) => s + num(x.hours) * (empCost.get(x.employee_id) || 0), 0)
  const hoursByEmp = new Map<string, number>()
  for (const t of tm) hoursByEmp.set(t.employee_id, (hoursByEmp.get(t.employee_id) || 0) + num(t.hours))
  const repartition = emp.map(e => ({ name: e.full_name, color: e.color, hours: hoursByEmp.get(e.id) || 0 }))
    .filter(e => e.hours > 0).sort((a, b) => b.hours - a.hours)
  const hoursByType = new Map<string, number>()
  for (const t of tm) { if (!t.project_id) continue; const ty = projType.get(t.project_id) || 'Non défini'; hoursByType.set(ty, (hoursByType.get(ty) || 0) + num(t.hours)) }
  const tempsParType = [...hoursByType].map(([label, value]) => ({ label, value })).filter(x => x.value > 0).sort((a, b) => b.value - a.value)

  // ── §4.5 Prévision ──────────────────────────────────────────────────
  const invoicedQuoteIds = new Set(invAll.map(i => i.quote_id).filter(Boolean))
  const devisSignesNonFactures = quotesAll.filter(x => isSigned(x.status) && !invoicedQuoteIds.has(x.id))
  const nbSignesNonFactures = devisSignesNonFactures.length
  const montantSignesNonFactures = devisSignesNonFactures.reduce((s, x) => s + num(x.total_ttc), 0)
  const encaissementsPrevus = resteAEncaisser + montantSignesNonFactures

  const chantiersAVenirArr = pr.filter(p => !CLOSED.includes(p.status as ProjectStatus) &&
    ((p.status === 'a_planifier' || p.status === 'planifie') || (p.start_date && p.start_date > today)))
  const chantiersAVenir = chantiersAVenirArr.length
  const listChantiersAVenir = chantiersAVenirArr
    .map(p => ({ id: p.id, title: p.title, start_date: p.start_date || null, status: p.status }))
    .sort((a, b) => (a.start_date || '9999').localeCompare(b.start_date || '9999')).slice(0, 5)

  // Charge équipe — 4 prochaines semaines (jours-homme affectés vs capacité)
  const activeEmpCount = emp.filter(e => e.active !== false).length
  const capacite = activeEmpCount * 5
  const startWeek = new Date(now); const dow = (startWeek.getDay() + 6) % 7
  startWeek.setDate(now.getDate() - dow); startWeek.setHours(0, 0, 0, 0)
  const charge = Array.from({ length: 4 }, (_, k) => {
    const ws = new Date(startWeek); ws.setDate(startWeek.getDate() + k * 7)
    const we = new Date(ws); we.setDate(ws.getDate() + 7)
    const wsS = ws.toISOString().split('T')[0], weS = we.toISOString().split('T')[0]
    const jours = asg.filter(a => a.date >= wsS && a.date < weS).length
    const etat: 'creuse' | 'ok' | 'surcharge' = capacite > 0 && jours > capacite ? 'surcharge'
      : capacite > 0 && jours < capacite * 0.4 ? 'creuse' : 'ok'
    return { label: k === 0 ? 'Cette sem.' : `S+${k}`, jours, etat }
  })

  return {
    fin: { encaisse, facture, resteAEncaisser, depensesTotal, margeGlobale, revGlobal, finMensuel, depCats, resteClients },
    com: { prospectsActuels, nouveauxProspects, devisCrees, devisEnvoyes, devisAcceptes, devisRefuses, devisEnAttente, tauxAccept, montantDevise, montantSigne, montantMoyenDevis, relancesEffectuees, devisMensuel },
    cha: { chantiersEnCours, chantiersTermines, chantiersEnRetard, marges: marges.slice(0, 6), heuresParChantier },
    equ: { heuresDeclarees, heuresValidees, masseSalariale, repartition, tempsParType },
    prev: { nbSignesNonFactures, montantSignesNonFactures, chantiersAVenir, listChantiersAVenir, encaissementsPrevus, charge, capacite },
    docCount,
  }
}

function Kpi({ label, value, icon, tone, note }: { label: string; value: string; icon: LucideIcon; tone: StatTone; note?: string }) {
  return <StatCard label={label} value={value} icon={icon} tone={tone} note={note} />
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="animate-fade-up">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">{title}</h2>
        {hint && <span className="text-[11px] text-gray-400">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

// Barres verticales appariées (ex. facturé vs encaissé) — montants en €
function PairBars({ data, aLabel, bLabel }: { data: { label: string; a: number; b: number }[]; aLabel: string; bLabel: string }) {
  const max = Math.max(...data.flatMap(d => [d.a, d.b]), 1)
  return (
    <div>
      <div className="flex items-center gap-3 text-xs text-gray-500 mb-3 justify-end">
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-gray-300" /> {aLabel}</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: BRAND }} /> {bLabel}</span>
      </div>
      <div className="flex items-end justify-between gap-2 h-36">
        {data.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
            <div className="w-full flex items-end justify-center gap-1 flex-1">
              <div className="w-1/2 max-w-[16px] rounded-t bg-gray-200" style={{ height: `${Math.max((d.a / max) * 100, d.a > 0 ? 3 : 0)}%` }} title={`${aLabel} : ${formatCurrency(d.a)}`} />
              <div className="w-1/2 max-w-[16px] rounded-t" style={{ height: `${Math.max((d.b / max) * 100, d.b > 0 ? 3 : 0)}%`, backgroundColor: BRAND }} title={`${bLabel} : ${formatCurrency(d.b)}`} />
            </div>
            <span className="text-[11px] text-gray-400">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Barres verticales simples — montants en €
function MonthBars({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(...data.map(d => d.value), 1)
  return (
    <div className="flex items-end justify-between gap-2 h-36">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
          <div className="w-full flex items-end justify-center flex-1">
            <div className="w-full max-w-[26px] rounded-t" style={{ height: `${Math.max((d.value / max) * 100, d.value > 0 ? 3 : 0)}%`, backgroundColor: BRAND }} title={formatCurrency(d.value)} />
          </div>
          <span className="text-[11px] text-gray-400">{d.label}</span>
        </div>
      ))}
    </div>
  )
}

// Barres horizontales — formateur passé en prop
function HBars({ data, fmt, color }: { data: { label: string; value: number; color?: string }[]; fmt: (n: number) => string; color?: string }) {
  const max = Math.max(...data.map(d => d.value), 1)
  return (
    <div className="space-y-2.5">
      {data.map((r, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="text-sm text-gray-700 w-32 truncate">{r.label}</span>
          <div className="flex-1 h-2.5 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, backgroundColor: r.color || color || BRAND }} />
          </div>
          <span className="text-sm font-semibold text-marine tabular-nums w-20 text-right">{fmt(r.value)}</span>
        </div>
      ))}
    </div>
  )
}

const Panel = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <Card className="border border-gray-200/80 bg-white">
    <CardContent className="p-5">
      <h3 className="text-sm font-semibold text-gray-500 mb-3">{title}</h3>
      {children}
    </CardContent>
  </Card>
)

const Empty = ({ children }: { children: React.ReactNode }) => (
  <p className="text-sm text-gray-400 py-6 text-center">{children}</p>
)

export default async function ReportingPage({ searchParams }: { searchParams: Promise<{ periode?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const sp = await searchParams
  const periode: Periode = (['mois', 'trimestre', 'annee', 'tout'] as Periode[]).includes(sp.periode as Periode)
    ? (sp.periode as Periode) : 'mois'
  const d = await getData(user.id, periode)
  const fmtEur = (n: number) => formatCurrency(n)
  const fmtH = (n: number) => `${n} h`

  return (
    <div className="space-y-7">
      {/* Header + sélecteur de période */}
      <div className="flex flex-wrap items-end justify-between gap-3 animate-fade-up">
        <div>
          <h1 className="text-2xl md:text-[28px] font-heading font-bold text-marine">Reporting dirigeant</h1>
          <p className="text-gray-500 mt-1 text-sm">Comment évolue l&apos;entreprise — financier, commercial, chantiers, équipe, prévision.</p>
        </div>
        <div className="flex items-center gap-1 p-1 rounded-xl bg-[#F4F0E9]">
          {PERIODES.map(p => (
            <Link
              key={p.key}
              href={`/reporting?periode=${p.key}`}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                periode === p.key ? 'bg-white text-marine shadow-[var(--shadow-xs)]' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              {p.label}
            </Link>
          ))}
        </div>
      </div>

      {/* §4.1 Financière */}
      <Section title="Vue financière">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Kpi label="Encaissé" value={fmtEur(d.fin.encaisse)} icon={Banknote} tone="green" />
          <Kpi label="Facturé" value={fmtEur(d.fin.facture)} icon={Send} tone="blue" note="hors brouillons" />
          <Kpi label="Reste à encaisser" value={fmtEur(d.fin.resteAEncaisser)} icon={Coins} tone="amber" note="toutes périodes" />
          <Kpi label="Dépenses" value={fmtEur(d.fin.depensesTotal)} icon={Wallet} tone="red" />
          <Kpi label="Marge estimée" value={fmtEur(d.fin.margeGlobale)} icon={TrendingUp} tone="coral" note={`sur ${fmtEur(d.fin.revGlobal)} signés`} />
        </div>
        <div className="grid lg:grid-cols-2 gap-4 mt-4">
          <Card className="border border-gray-200/80 bg-white">
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold text-gray-500 mb-1">Facturé vs encaissé</h3>
              <p className="text-[11px] text-gray-400 mb-3">6 derniers mois</p>
              <PairBars data={d.fin.finMensuel} aLabel="Facturé" bLabel="Encaissé" />
            </CardContent>
          </Card>
          <DonutMetricCard
            title="Dépenses par catégorie"
            subtitle="Sur la période"
            total={fmtEur(d.fin.depensesTotal)}
            segments={d.fin.depCats.map((c, i) => ({ label: c.label, value: c.value, color: RCOLORS[i % RCOLORS.length] }))}
            format={kEur}
            emptyMessage="Aucune dépense sur la période."
          />
        </div>
        <div className="grid lg:grid-cols-2 gap-4 mt-4">
          <DonutMetricCard
            title="Reste à encaisser par client"
            subtitle="Factures en attente de paiement"
            total={fmtEur(d.fin.resteAEncaisser)}
            segments={d.fin.resteClients.map((c, i) => ({ label: c.label, value: c.value, color: RCOLORS[i % RCOLORS.length] }))}
            format={kEur}
            emptyMessage="Aucune facture en attente. 🎉"
          />
        </div>
      </Section>

      {/* §4.2 Commerciale */}
      <Section title="Vue commerciale">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi label="Prospects" value={String(d.com.prospectsActuels)} icon={UserPlus} tone="blue" note={`${d.com.nouveauxProspects} nouveau${d.com.nouveauxProspects > 1 ? 'x' : ''} sur la période`} />
          <Kpi label="Devis créés" value={String(d.com.devisCrees)} icon={FileText} tone="terre" note={`${d.com.devisEnvoyes} envoyés`} />
          <Kpi label="Devis acceptés" value={String(d.com.devisAcceptes)} icon={CheckCircle2} tone="green" note={`${d.com.devisRefuses} refusé${d.com.devisRefuses > 1 ? 's' : ''}`} />
          <Kpi label="Taux d'acceptation" value={`${d.com.tauxAccept} %`} icon={Percent} tone="coral" note={`${d.com.devisEnAttente} en attente`} />
          <Kpi label="Montant devisé" value={fmtEur(d.com.montantDevise)} icon={Target} tone="blue" note="TTC, hors brouillons" />
          <Kpi label="Montant signé" value={fmtEur(d.com.montantSigne)} icon={CheckCircle2} tone="green" />
          <Kpi label="Devis moyen" value={fmtEur(d.com.montantMoyenDevis)} icon={FileText} tone="terre" note="par devis envoyé" />
          <Kpi label="Relances effectuées" value={String(d.com.relancesEffectuees)} icon={BellRing} tone="amber" />
        </div>
        <div className="mt-4">
          <Card className="border border-gray-200/80 bg-white">
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold text-gray-500 mb-1">Montant des devis envoyés</h3>
              <p className="text-[11px] text-gray-400 mb-3">6 derniers mois</p>
              <MonthBars data={d.com.devisMensuel} />
            </CardContent>
          </Card>
        </div>
        <p className="text-[11px] text-gray-400 mt-2">Source des prospects et délai demande→devis : non suivis pour l&apos;instant (champs à ajouter ultérieurement).</p>
      </Section>

      {/* §4.3 Chantiers & marge */}
      <Section title="Vue chantiers">
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <Kpi label="En cours" value={String(d.cha.chantiersEnCours)} icon={HardHat} tone="coral" />
              <Kpi label="Terminés" value={String(d.cha.chantiersTermines)} icon={CheckCircle2} tone="green" />
              <Kpi label="En retard" value={String(d.cha.chantiersEnRetard)} icon={XCircle} tone="red" />
            </div>
            <Panel title="Heures par chantier">
              {d.cha.heuresParChantier.length === 0 ? <Empty>Aucune heure rattachée à un chantier.</Empty> : <HBars data={d.cha.heuresParChantier} fmt={fmtH} color="#2F7DE0" />}
            </Panel>
          </div>

          <Card className="lg:col-span-2 border border-gray-200/80 bg-white">
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold text-gray-500 mb-3">Rentabilité par chantier (marge estimée)</h3>
              {d.cha.marges.length === 0 ? (
                <Empty>Aucune donnée — rattachez devis, dépenses et heures à vos chantiers.</Empty>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                        <th className="pb-2 font-medium">Chantier</th>
                        <th className="pb-2 font-medium text-right">Signé HT</th>
                        <th className="pb-2 font-medium text-right">Coûts</th>
                        <th className="pb-2 font-medium text-right">Marge</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.cha.marges.map(m => (
                        <tr key={m.id} className="border-b border-gray-50 last:border-0">
                          <td className="py-2">
                            <Link href={`/chantiers/${m.id}`} className="text-marine hover:text-primary font-medium truncate block max-w-[180px]">{m.title}</Link>
                          </td>
                          <td className="py-2 text-right tabular-nums text-gray-600">{fmtEur(m.rev)}</td>
                          <td className="py-2 text-right tabular-nums text-gray-600">{fmtEur(m.cost)}</td>
                          <td className={`py-2 text-right tabular-nums font-semibold ${m.marge >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{fmtEur(m.marge)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        <p className="text-[11px] text-gray-400 mt-2">Coûts = dépenses HT + main-d&apos;œuvre déclarée. Marge réelle et temps prévu vs réel : disponibles une fois les heures prévues renseignées (à venir).</p>
      </Section>

      {/* §4.4 Équipe & heures */}
      <Section title="Vue équipe" hint="Outil d'organisation, pas de surveillance">
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="grid grid-cols-1 gap-3">
            <Kpi label="Heures déclarées" value={fmtH(d.equ.heuresDeclarees)} icon={Clock} tone="blue" note={`${d.equ.heuresValidees} h validées`} />
            <Kpi label="Masse salariale" value={fmtEur(d.equ.masseSalariale)} icon={Wallet} tone="coral" note="coût main-d'œuvre déclaré" />
          </div>
          <DonutMetricCard
            title="Heures par salarié"
            subtitle="Sur la période"
            total={`${d.equ.heuresDeclarees} h`}
            centerLabel="Heures"
            segments={d.equ.repartition.map((r, i) => ({ label: r.name, value: r.hours, color: r.color || RCOLORS[i % RCOLORS.length] }))}
            format={v => `${v} h`}
            emptyMessage="Aucune heure déclarée sur la période."
          />
          <DonutMetricCard
            title="Temps par type de chantier"
            subtitle="Sur la période"
            total={`${d.equ.heuresDeclarees} h`}
            centerLabel="Heures"
            segments={d.equ.tempsParType.map((c, i) => ({ label: c.label, value: c.value, color: RCOLORS[i % RCOLORS.length] }))}
            format={v => `${v} h`}
            emptyMessage="Aucune heure déclarée."
          />
        </div>
        <p className="text-[11px] text-gray-400 mt-2">Absences et pointages manquants : suivi non disponible (pas encore de gestion des absences).</p>
      </Section>

      {/* §4.5 Prévision */}
      <Section title="Vue prévision" hint="Ce qui arrive">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi label="Acceptés non facturés" value={String(d.prev.nbSignesNonFactures)} icon={FileText} tone="amber" note={fmtEur(d.prev.montantSignesNonFactures)} />
          <Kpi label="Chantiers à venir" value={String(d.prev.chantiersAVenir)} icon={CalendarClock} tone="blue" />
          <Kpi label="Encaissements prévus" value={fmtEur(d.prev.encaissementsPrevus)} icon={Banknote} tone="green" note="reste dû + signés à facturer" />
          <Kpi label="Capacité équipe / sem." value={`${d.prev.capacite} j`} icon={Users2} tone="terre" note="jours-homme dispo" />
        </div>
        <div className="grid lg:grid-cols-2 gap-4 mt-4">
          <Panel title="Charge des 4 prochaines semaines">
            {d.prev.capacite === 0 ? <Empty>Ajoutez des salariés actifs pour estimer la charge.</Empty> : (
              <div className="space-y-2.5">
                {d.prev.charge.map((w, i) => {
                  const ratio = Math.min(w.jours / Math.max(d.prev.capacite, 1), 1.2)
                  const col = w.etat === 'surcharge' ? '#DC3B2E' : w.etat === 'creuse' ? '#C77D0E' : '#3F7A2E'
                  const tag = w.etat === 'surcharge' ? 'Surcharge' : w.etat === 'creuse' ? 'Creux' : 'OK'
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-sm text-gray-700 w-20 flex-shrink-0">{w.label}</span>
                      <div className="flex-1 h-2.5 rounded-full bg-gray-100 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${ratio * 100}%`, backgroundColor: col }} />
                      </div>
                      <span className="text-xs font-medium tabular-nums w-24 text-right" style={{ color: col }}>{w.jours}/{d.prev.capacite} j · {tag}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </Panel>
          <Panel title="Prochains chantiers">
            {d.prev.listChantiersAVenir.length === 0 ? <Empty>Aucun chantier planifié à venir.</Empty> : (
              <div className="space-y-1">
                {d.prev.listChantiersAVenir.map(c => (
                  <Link key={c.id} href={`/chantiers/${c.id}`}>
                    <div className="flex items-center gap-3 py-2 hover:bg-gray-50 rounded-xl px-2 -mx-2 transition-colors">
                      <span className="grid place-items-center w-8 h-8 rounded-lg bg-[#FCE7DE] text-[#C14E33] flex-shrink-0"><HardHat className="w-4 h-4" /></span>
                      <span className="text-sm text-gray-700 flex-1 min-w-0 truncate">{c.title}</span>
                      <span className="text-xs text-gray-400 flex-shrink-0">
                        {c.start_date ? new Date(c.start_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : projectStatusLabels[c.status as ProjectStatus]}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Panel>
        </div>
        <p className="text-[11px] text-gray-400 mt-2">Charge basée sur les affectations du planning · {d.docCount} document{d.docCount > 1 ? 's' : ''} archivé{d.docCount > 1 ? 's' : ''}.</p>
      </Section>
    </div>
  )
}
