import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import {
  TrendingUp, FileText, CheckCircle2, XCircle, Clock, HardHat,
  Wallet, Users2, ReceiptText, Send, Percent, Target, type LucideIcon,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'
import { projectStatusLabels } from '@/lib/chantiers'
import type { ProjectStatus } from '@/types'

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

const CLOSED: ProjectStatus[] = ['termine', 'facture', 'paye', 'archive']
const num = (v: unknown) => Number(v) || 0

async function getData(userId: string, periode: Periode) {
  const supabase = await createClient()
  const since = sinceDate(periode)
  const today = new Date().toISOString().split('T')[0]

  const [quotes, invoices, projects, expenses, times, employees, documents] = await Promise.all([
    supabase.from('quotes').select('status, total_ttc, subtotal_ht, issue_date, created_at, project_id').eq('user_id', userId),
    supabase.from('invoices').select('status, total_ttc, subtotal_ht, issue_date, created_at').eq('user_id', userId),
    supabase.from('projects').select('id, title, status, end_date').eq('user_id', userId),
    supabase.from('expenses').select('amount_ht, amount_ttc, expense_date, created_at, status, project_id').eq('user_id', userId),
    supabase.from('time_entries').select('employee_id, project_id, hours, date, status').eq('user_id', userId),
    supabase.from('employees').select('id, full_name, hourly_cost, color').eq('user_id', userId),
    supabase.from('documents').select('id').eq('user_id', userId),
  ])

  const inPeriod = (d?: string | null) => !since || (!!d && d >= since)

  const q = (quotes.data || []).filter(x => inPeriod(x.issue_date || x.created_at))
  const inv = (invoices.data || []).filter(x => inPeriod(x.issue_date || x.created_at))
  const pr = projects.data || []
  const exp = (expenses.data || []).filter(x => inPeriod(x.expense_date || x.created_at))
  const tm = (times.data || []).filter(x => inPeriod(x.date))
  const emp = employees.data || []
  const docCount = (documents.data || []).length

  const empCost = new Map(emp.map(e => [e.id, num(e.hourly_cost)]))
  const projTitle = new Map(pr.map(p => [p.id, p.title]))

  // --- Commercial ---
  const isSigned = (s: string) => s === 'accepte' || s === 'transforme'
  const devisEnvoyes = q.filter(x => x.status !== 'brouillon').length
  const devisAcceptes = q.filter(x => isSigned(x.status)).length
  const devisRefuses = q.filter(x => x.status === 'refuse').length
  const devisEnAttente = q.filter(x => x.status === 'envoye').length
  const decided = devisAcceptes + devisRefuses
  const tauxAccept = decided > 0 ? Math.round((devisAcceptes / decided) * 100) : 0
  const montantDevise = q.filter(x => x.status !== 'brouillon').reduce((s, x) => s + num(x.total_ttc), 0)
  const montantSigne = q.filter(x => isSigned(x.status)).reduce((s, x) => s + num(x.total_ttc), 0)

  // --- Chantiers ---
  const chantiersEnCours = pr.filter(x => x.status === 'en_cours').length
  const chantiersTermines = pr.filter(x => CLOSED.includes(x.status as ProjectStatus)).length
  const chantiersEnRetard = pr.filter(x => !CLOSED.includes(x.status as ProjectStatus) && x.end_date && x.end_date < today).length

  // Heures + coût main-d'œuvre par chantier
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
  // Revenu signé par chantier (devis signés rattachés)
  const revByProject = new Map<string, number>()
  for (const x of q) {
    if (x.project_id && isSigned(x.status)) revByProject.set(x.project_id, (revByProject.get(x.project_id) || 0) + num(x.subtotal_ht))
  }

  // Marge par chantier (revenu signé − dépenses − main-d'œuvre)
  const projectIds = new Set<string>([...revByProject.keys(), ...expByProject.keys(), ...laborByProject.keys()])
  const marges = [...projectIds].map(id => {
    const rev = revByProject.get(id) || 0
    const cost = (expByProject.get(id) || 0) + (laborByProject.get(id) || 0)
    return { id, title: projTitle.get(id) || 'Chantier', rev, cost, marge: rev - cost, hours: hoursByProject.get(id) || 0 }
  }).sort((a, b) => b.rev - a.rev)
  const margeGlobale = marges.reduce((s, m) => s + m.marge, 0)
  const revGlobal = marges.reduce((s, m) => s + m.rev, 0)

  // --- Salariés ---
  const heuresDeclarees = tm.reduce((s, x) => s + num(x.hours), 0)
  const heuresValidees = tm.filter(x => x.status === 'valide').reduce((s, x) => s + num(x.hours), 0)
  const masseSalariale = tm.reduce((s, x) => s + num(x.hours) * (empCost.get(x.employee_id) || 0), 0)
  const hoursByEmp = new Map<string, number>()
  for (const t of tm) hoursByEmp.set(t.employee_id, (hoursByEmp.get(t.employee_id) || 0) + num(t.hours))
  const repartition = emp.map(e => ({ name: e.full_name, color: e.color, hours: hoursByEmp.get(e.id) || 0 }))
    .filter(e => e.hours > 0).sort((a, b) => b.hours - a.hours)

  // --- Administratif ---
  const isPaid = (s: string) => s === 'payee' || s === 'paye'
  const ticketsAValider = exp.filter(x => x.status === 'a_verifier').length
  const facturesATransmettre = inv.filter(x => x.status === 'brouillon').length
  const paiementsRecus = inv.filter(x => isPaid(x.status)).reduce((s, x) => s + num(x.total_ttc), 0)
  const facturesEnRetard = inv.filter(x => x.status === 'envoyee' && x.status !== 'payee').length

  return {
    devisEnvoyes, devisAcceptes, devisRefuses, devisEnAttente, tauxAccept, montantDevise, montantSigne,
    chantiersEnCours, chantiersTermines, chantiersEnRetard, marges: marges.slice(0, 6), margeGlobale, revGlobal,
    heuresDeclarees, heuresValidees, masseSalariale, repartition,
    ticketsAValider, facturesATransmettre, paiementsRecus, facturesEnRetard, docCount,
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="animate-fade-up">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">{title}</h2>
      {children}
    </div>
  )
}

export default async function ReportingPage({ searchParams }: { searchParams: Promise<{ periode?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const sp = await searchParams
  const periode: Periode = (['mois', 'trimestre', 'annee', 'tout'] as Periode[]).includes(sp.periode as Periode)
    ? (sp.periode as Periode) : 'mois'
  const d = await getData(user.id, periode)
  const maxHours = Math.max(...d.repartition.map(r => r.hours), 1)

  return (
    <div className="space-y-7">
      {/* Header + sélecteur de période */}
      <div className="flex flex-wrap items-end justify-between gap-3 animate-fade-up">
        <div>
          <h1 className="text-2xl md:text-[28px] font-heading font-bold text-marine">Reporting dirigeant</h1>
          <p className="text-gray-500 mt-1 text-sm">Vue d&apos;ensemble de l&apos;activité — commercial, chantiers, équipe, administratif.</p>
        </div>
        <div className="flex items-center gap-1 p-1 rounded-xl bg-gray-100">
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

      {/* Commercial */}
      <Section title="Commercial">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi label="Devis envoyés" value={String(d.devisEnvoyes)} icon={Send} tile="bg-blue-100 text-blue-600" />
          <Kpi label="Devis acceptés" value={String(d.devisAcceptes)} icon={CheckCircle2} tile="bg-emerald-100 text-emerald-600" />
          <Kpi label="Taux d'acceptation" value={`${d.tauxAccept} %`} icon={Percent} tile="bg-orange-100 text-orange-600" sub={`${d.devisRefuses} refusé${d.devisRefuses > 1 ? 's' : ''}`} />
          <Kpi label="En attente" value={String(d.devisEnAttente)} icon={Clock} tile="bg-amber-100 text-amber-600" />
          <Kpi label="Montant devisé" value={formatCurrency(d.montantDevise)} icon={FileText} tile="bg-violet-100 text-violet-600" sub="TTC, hors brouillons" />
          <Kpi label="Montant signé" value={formatCurrency(d.montantSigne)} icon={Target} tile="bg-emerald-100 text-emerald-600" sub="devis acceptés TTC" />
        </div>
      </Section>

      {/* Chantiers + marge */}
      <Section title="Chantiers & marge">
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <Kpi label="En cours" value={String(d.chantiersEnCours)} icon={HardHat} tile="bg-orange-100 text-orange-600" />
              <Kpi label="Terminés" value={String(d.chantiersTermines)} icon={CheckCircle2} tile="bg-emerald-100 text-emerald-600" />
              <Kpi label="En retard" value={String(d.chantiersEnRetard)} icon={XCircle} tile="bg-rose-100 text-rose-600" />
            </div>
            <Card className="border border-gray-200/80 bg-white">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500 font-medium">Marge estimée</span>
                  <span className="grid place-items-center w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600"><TrendingUp className="w-4 h-4" /></span>
                </div>
                <div className={`text-[24px] font-bold mt-2 leading-none ${d.margeGlobale >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatCurrency(d.margeGlobale)}</div>
                <div className="text-xs text-gray-400 mt-1">sur {formatCurrency(d.revGlobal)} signés · dépenses + main-d&apos;œuvre déduites</div>
              </CardContent>
            </Card>
          </div>

          <Card className="lg:col-span-2 border border-gray-200/80 bg-white">
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold text-gray-500 mb-3">Marge par chantier (estimée)</h3>
              {d.marges.length === 0 ? (
                <p className="text-sm text-gray-400 py-6 text-center">Aucune donnée — rattachez devis, dépenses et heures à vos chantiers.</p>
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
                      {d.marges.map(m => (
                        <tr key={m.id} className="border-b border-gray-50 last:border-0">
                          <td className="py-2">
                            <Link href={`/chantiers/${m.id}`} className="text-marine hover:text-[#FF6A00] font-medium truncate block max-w-[180px]">{m.title}</Link>
                          </td>
                          <td className="py-2 text-right tabular-nums text-gray-600">{formatCurrency(m.rev)}</td>
                          <td className="py-2 text-right tabular-nums text-gray-600">{formatCurrency(m.cost)}</td>
                          <td className={`py-2 text-right tabular-nums font-semibold ${m.marge >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatCurrency(m.marge)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </Section>

      {/* Salariés */}
      <Section title="Équipe & heures">
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="grid grid-cols-1 gap-3">
            <Kpi label="Heures déclarées" value={`${d.heuresDeclarees} h`} icon={Clock} tile="bg-blue-100 text-blue-600" sub={`${d.heuresValidees} h validées`} />
            <Kpi label="Masse salariale" value={formatCurrency(d.masseSalariale)} icon={Wallet} tile="bg-orange-100 text-orange-600" sub="coût main-d'œuvre déclaré" />
          </div>
          <Card className="lg:col-span-2 border border-gray-200/80 bg-white">
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold text-gray-500 mb-3">Répartition des heures par salarié</h3>
              {d.repartition.length === 0 ? (
                <p className="text-sm text-gray-400 py-6 text-center">Aucune heure déclarée sur la période.</p>
              ) : (
                <div className="space-y-2.5">
                  {d.repartition.map((r, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-sm text-gray-700 w-32 truncate flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} />
                        {r.name}
                      </span>
                      <div className="flex-1 h-2.5 rounded-full bg-gray-100 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(r.hours / maxHours) * 100}%`, backgroundColor: r.color }} />
                      </div>
                      <span className="text-sm font-semibold text-marine tabular-nums w-14 text-right">{r.hours} h</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </Section>

      {/* Administratif */}
      <Section title="Administratif">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Kpi label="Paiements reçus" value={formatCurrency(d.paiementsRecus)} icon={CheckCircle2} tile="bg-emerald-100 text-emerald-600" />
          <Kpi label="Factures à transmettre" value={String(d.facturesATransmettre)} icon={Send} tile="bg-blue-100 text-blue-600" />
          <Kpi label="Factures en attente" value={String(d.facturesEnRetard)} icon={Clock} tile="bg-amber-100 text-amber-600" />
          <Kpi label="Tickets à valider" value={String(d.ticketsAValider)} icon={ReceiptText} tile="bg-rose-100 text-rose-600" />
          <Kpi label="Documents" value={String(d.docCount)} icon={Users2} tile="bg-violet-100 text-violet-600" />
        </div>
      </Section>
    </div>
  )
}
