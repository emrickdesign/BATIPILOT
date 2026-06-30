import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import {
  Wallet, Send, Coins, FileText, Clock, ReceiptText, Camera, Landmark, HardHat,
  Users2, Truck, AlertTriangle, PlayCircle, CalendarClock, CheckCircle2, TrendingUp,
  Bell, CalendarDays, ArrowRight, Receipt, Users, GitCompare, FileCheck2, BadgeEuro, TrendingDown,
  type LucideIcon,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils'
import { projectStatusLabels, projectStatusColors } from '@/lib/chantiers'
import type { ProjectStatus } from '@/types'
import EncaissementsChart from './EncaissementsChart'

const MONTHS = ['Janv', 'Févr', 'Mars', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc']
const CLOSED = ['termine', 'facture', 'paye', 'archive']
const num = (v: unknown) => Number(v) || 0
const DAY = 86_400_000
const daysSince = (d?: string | null) => (d ? Math.floor((Date.now() - new Date(d).getTime()) / DAY) : 0)

function ago(d: string) {
  const h = Math.floor((Date.now() - new Date(d).getTime()) / 3_600_000)
  if (h < 1) return "à l'instant"
  if (h < 24) return `il y a ${h}h`
  const days = Math.floor(h / 24)
  return days === 1 ? 'hier' : `il y a ${days}j`
}

function classify(emp: number, veh: number): 'coherent' | 'ecart' {
  if (veh === 0 && emp > 0) return 'ecart'
  if (emp === 0 && veh > 0) return 'ecart'
  return Math.abs(emp - veh) <= 1 ? 'coherent' : 'ecart'
}

async function getData(userId: string) {
  const supabase = await createClient()
  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0)
  const isoDay = startOfDay.toISOString()
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1)
  const tomorrowStr = tomorrow.toISOString().split('T')[0]
  const inThisMonth = (d?: string | null) => {
    if (!d) return false
    const x = new Date(d)
    return x.getFullYear() === now.getFullYear() && x.getMonth() === now.getMonth()
  }
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const inLastMonth = (d?: string | null) => {
    if (!d) return false
    const x = new Date(d)
    return x.getFullYear() === lastMonth.getFullYear() && x.getMonth() === lastMonth.getMonth()
  }

  const [quotesRes, invRes, projRes, expRes, empRes, timesRes, presRes, asgTodayRes, asgTomRes, bankRes, vehRes, vlogRes, clientsRes] = await Promise.all([
    supabase.from('quotes').select('id, quote_number, status, total_ttc, issue_date, reminded_at, created_at').eq('user_id', userId),
    supabase.from('invoices').select('id, invoice_number, status, total_ttc, amount_due, issue_date, due_date, created_at').eq('user_id', userId),
    supabase.from('projects').select('id, title, status, end_date, created_at').eq('user_id', userId).neq('status', 'archive'),
    supabase.from('expenses').select('amount_ttc, status, source, expense_date, created_at').eq('user_id', userId),
    supabase.from('employees').select('id, full_name, color, active').eq('user_id', userId).eq('active', true),
    supabase.from('time_entries').select('employee_id, project_id, hours, date').eq('user_id', userId),
    supabase.from('presence_events').select('employee_id').eq('user_id', userId).gte('occurred_at', isoDay),
    supabase.from('assignments').select('employee_id, project_id').eq('user_id', userId).eq('date', today),
    supabase.from('assignments').select('project_id').eq('user_id', userId).eq('date', tomorrowStr),
    supabase.from('bank_transactions').select('id, amount, status').eq('user_id', userId),
    supabase.from('vehicles').select('id').eq('user_id', userId).eq('active', true),
    supabase.from('vehicle_logs').select('project_id, date, hours_present').eq('user_id', userId),
    supabase.from('clients').select('id, first_name, last_name, company_name, created_at').eq('user_id', userId),
  ])

  const quotes = quotesRes.data || []
  const inv = invRes.data || []
  const pr = projRes.data || []
  const exp = expRes.data || []
  const times = timesRes.data || []
  const bank = bankRes.data || []

  const isPaid = (s: string) => s === 'payee' || s === 'payée' || s === 'paye'
  const isOpenInv = (s: string) => s === 'envoyee' || s === 'en_retard' || s === 'payee_partiellement'

  // ── 1. Chiffres vitaux ──────────────────────────────────────────────
  const encaisseMois = inv.filter(i => isPaid(i.status) && inThisMonth(i.issue_date)).reduce((s, i) => s + num(i.total_ttc), 0)
  const encaisseMoisPrec = inv.filter(i => isPaid(i.status) && inLastMonth(i.issue_date)).reduce((s, i) => s + num(i.total_ttc), 0)
  const factureMois = inv.filter(i => i.status !== 'brouillon' && inThisMonth(i.issue_date)).reduce((s, i) => s + num(i.total_ttc), 0)
  const resteAEncaisser = inv.filter(i => isOpenInv(i.status)).reduce((s, i) => s + (num(i.amount_due) || num(i.total_ttc)), 0)
  const devisEnAttente = quotes.filter(q => q.status === 'envoye').reduce((s, q) => s + num(q.total_ttc), 0)

  // ── 2. À traiter aujourd'hui ────────────────────────────────────────
  const aRelancer = quotes.filter(q => q.status === 'envoye' && daysSince(q.issue_date) >= 7 && (!q.reminded_at || daysSince(q.reminded_at) >= 7)).length
  const aRapprocher = bank.filter(t => t.status === 'a_rapprocher' && num(t.amount) > 0).length
  const ticketsAValider = exp.filter(e => e.status === 'a_verifier').length
  const aTransmettre = exp.filter(e => e.status === 'valide').length
  const facturesEchues = inv.filter(i => i.status === 'envoyee' && i.due_date && i.due_date < today).length

  const assignedTodayEmp = new Set((asgTodayRes.data || []).map(a => a.employee_id))
  const declaredTodayEmp = new Set(times.filter(t => t.date === today).map(t => t.employee_id))
  const pointedTodayEmp = new Set((presRes.data || []).map(p => p.employee_id))
  const salariesSansHeures = [...assignedTodayEmp].filter(e => !declaredTodayEmp.has(e)).length

  const activeProjects = pr.filter(p => !CLOSED.includes(p.status))
  const equipeDemain = new Set((asgTomRes.data || []).map(a => a.project_id))
  const sansEquipeDemain = activeProjects.filter(p => !equipeDemain.has(p.id)).length

  type Todo = { icon: LucideIcon; tile: string; text: string; href: string }
  const todos: Todo[] = []
  if (aRelancer > 0) todos.push({ icon: Bell, tile: 'bg-accent text-primary', text: `${aRelancer} devis à relancer`, href: '/relances' })
  if (facturesEchues > 0) todos.push({ icon: Landmark, tile: 'bg-amber-100 text-amber-600', text: `${facturesEchues} facture${facturesEchues > 1 ? 's' : ''} échue${facturesEchues > 1 ? 's' : ''} à encaisser`, href: '/banque' })
  if (aRapprocher > 0) todos.push({ icon: BadgeEuro, tile: 'bg-blue-100 text-blue-600', text: `${aRapprocher} paiement${aRapprocher > 1 ? 's' : ''} à rapprocher`, href: '/banque' })
  if (ticketsAValider > 0) todos.push({ icon: ReceiptText, tile: 'bg-rose-100 text-rose-600', text: `${ticketsAValider} ticket${ticketsAValider > 1 ? 's' : ''} à valider`, href: '/tickets' })
  if (aTransmettre > 0) todos.push({ icon: FileCheck2, tile: 'bg-violet-100 text-violet-600', text: `${aTransmettre} justificatif${aTransmettre > 1 ? 's' : ''} à transmettre comptable`, href: '/comptable' })
  if (salariesSansHeures > 0) todos.push({ icon: Clock, tile: 'bg-amber-100 text-amber-600', text: `${salariesSansHeures} salarié${salariesSansHeures > 1 ? 's n\'ont' : ' n\'a'} pas déclaré ses heures`, href: '/heures' })
  if (sansEquipeDemain > 0) todos.push({ icon: HardHat, tile: 'bg-rose-100 text-rose-600', text: `${sansEquipeDemain} chantier${sansEquipeDemain > 1 ? 's' : ''} sans équipe prévue demain`, href: '/planning' })

  // ── 3. Suivi des chantiers ──────────────────────────────────────────
  const chantiers = {
    enCours: pr.filter(p => p.status === 'en_cours').length,
    aDemarrer: pr.filter(p => p.status === 'a_planifier' || p.status === 'planifie').length,
    enRetard: pr.filter(p => !CLOSED.includes(p.status) && p.end_date && p.end_date < today).length,
    aFacturer: pr.filter(p => p.status === 'termine' || p.status === 'a_facturer').length,
    sansEquipe: sansEquipeDemain,
  }
  const chantiersActifs = activeProjects
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)

  // ── 4. Évolution des encaissements (séries) ─────────────────────────
  const paid = inv.filter(i => isPaid(i.status) && i.issue_date)
  const sumBetween = (start: Date, end: Date) =>
    paid.filter(i => { const d = new Date(i.issue_date!); return d >= start && d < end }).reduce((s, i) => s + num(i.total_ttc), 0)
  const s7 = Array.from({ length: 7 }, (_, k) => {
    const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(now.getDate() - (6 - k))
    const e = new Date(d); e.setDate(d.getDate() + 1)
    return { label: d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', ''), value: sumBetween(d, e) }
  })
  const sMois = Array.from({ length: 6 }, (_, k) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - k), 1)
    const e = new Date(now.getFullYear(), now.getMonth() - (5 - k) + 1, 1)
    return { label: MONTHS[d.getMonth()], value: sumBetween(d, e) }
  })
  const curQ = Math.floor(now.getMonth() / 3)
  const sTri = Array.from({ length: 4 }, (_, k) => {
    const qi = curQ - (3 - k)
    const y = now.getFullYear() + Math.floor(qi / 4)
    const q = ((qi % 4) + 4) % 4
    return { label: `T${q + 1}`, value: sumBetween(new Date(y, q * 3, 1), new Date(y, q * 3 + 3, 1)) }
  })
  const sAnnee = Array.from({ length: 5 }, (_, k) => {
    const y = now.getFullYear() - (4 - k)
    return { label: String(y), value: sumBetween(new Date(y, 0, 1), new Date(y + 1, 0, 1)) }
  })

  // ── 5. Équipes & terrain (aujourd'hui) ──────────────────────────────
  const heuresJour = times.filter(t => t.date === today).reduce((s, t) => s + num(t.hours), 0)
  const pointagesManquants = [...assignedTodayEmp].filter(e => !pointedTodayEmp.has(e)).length
  // incohérences heures / véhicules (toutes périodes confondues)
  const rows = new Map<string, { emp: number; veh: number }>()
  const key = (pid: string | null, d: string) => `${pid || 'none'}__${d}`
  for (const t of times) { if (!t.date) continue; const r = rows.get(key(t.project_id, t.date)) || { emp: 0, veh: 0 }; r.emp += num(t.hours); rows.set(key(t.project_id, t.date), r) }
  for (const l of (vlogRes.data || [])) { if (!l.date) continue; const r = rows.get(key(l.project_id, l.date)) || { emp: 0, veh: 0 }; r.veh += num(l.hours_present); rows.set(key(l.project_id, l.date), r) }
  const incoherences = [...rows.values()].filter(r => classify(r.emp, r.veh) === 'ecart').length

  const terrain = {
    salariesPrevus: assignedTodayEmp.size,
    ontPointe: pointedTodayEmp.size,
    heuresJour,
    pointagesManquants,
    incoherences,
    vehiculesActifs: (vehRes.data || []).length,
  }

  // ── 6. Administratif & comptable (ce mois) ──────────────────────────
  const admin = {
    ticketsScannesMois: exp.filter(e => e.source === 'ticket' && inThisMonth(e.created_at)).length,
    ticketsAVerifier: ticketsAValider,
    depensesMois: exp.filter(e => inThisMonth(e.expense_date || e.created_at)).reduce((s, e) => s + num(e.amount_ttc), 0),
    transmisComptable: exp.filter(e => e.status === 'envoye_comptable' && inThisMonth(e.created_at)).length,
    paiementsARapprocher: aRapprocher,
    aTransmettre,
  }

  // ── 7. Activité récente ─────────────────────────────────────────────
  const cl = clientsRes.data || []
  const activity = [
    ...quotes.map(x => ({ type: 'devis', label: `Devis ${x.quote_number}`, amount: num(x.total_ttc), date: x.created_at })),
    ...inv.map(x => ({ type: 'facture', label: `Facture ${x.invoice_number}`, amount: num(x.total_ttc), date: x.created_at })),
    ...cl.map(x => ({ type: 'client', label: `Client ${x.company_name || `${x.first_name || ''} ${x.last_name || ''}`.trim()}`, amount: 0, date: x.created_at })),
    ...pr.map(x => ({ type: 'chantier', label: `Chantier ${x.title}`, amount: 0, date: x.created_at })),
  ].filter(a => a.date).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 6)

  return {
    fin: { encaisseMois, encaisseMoisPrec, factureMois, resteAEncaisser, devisEnAttente },
    todos,
    chantiers, chantiersActifs,
    series: { '7j': s7, mois: sMois, trimestre: sTri, annee: sAnnee },
    terrain, admin, activity,
  }
}

function MiniStat({ label, value, icon: Icon, tile, accent }: { label: string; value: string | number; icon: LucideIcon; tile: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl bg-white border border-gray-200/80 p-3.5 shadow-[var(--shadow-xs)]">
      <span className={`grid place-items-center w-8 h-8 rounded-lg ${tile}`}><Icon className="w-4 h-4" /></span>
      <div className={`text-2xl font-bold mt-2 leading-none ${accent ? 'text-primary' : 'text-marine'}`}>{value}</div>
      <div className="text-[11px] text-gray-500 mt-1 leading-tight">{label}</div>
    </div>
  )
}

const actIcon: Record<string, LucideIcon> = { devis: FileText, facture: Receipt, client: Users, chantier: HardHat }
const actTile: Record<string, string> = { devis: 'bg-accent text-primary', facture: 'bg-violet-100 text-violet-600', client: 'bg-emerald-100 text-emerald-600', chantier: 'bg-blue-100 text-blue-600' }

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single()
  const d = await getData(user.id)
  const prenom = profile?.full_name?.split(' ')[0] || 'vous'
  const initials = (profile?.full_name || user.email || 'BP').split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()
  const dateLabel = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

  // Variation de l'encaissé vs mois dernier (carte la plus importante — doc §3.1)
  const encVarPct = d.fin.encaisseMoisPrec > 0
    ? Math.round(((d.fin.encaisseMois - d.fin.encaisseMoisPrec) / d.fin.encaisseMoisPrec) * 100)
    : null
  const encSub: { text: string; positive: boolean } | null =
    encVarPct !== null
      ? { text: `${encVarPct >= 0 ? '+' : ''}${encVarPct} % vs mois dernier`, positive: encVarPct >= 0 }
      : d.fin.encaisseMois > 0
        ? { text: 'vs 0 € le mois dernier', positive: true }
        : null

  const finCards: { label: string; value: string; icon: LucideIcon; tile: string; href: string; hero: boolean; sub?: { text: string; positive: boolean } | null }[] = [
    { label: 'Encaissé ce mois', value: formatCurrency(d.fin.encaisseMois), icon: Wallet, tile: 'bg-white/20 text-white', href: '/banque', hero: true, sub: encSub },
    { label: 'Facturé ce mois', value: formatCurrency(d.fin.factureMois), icon: Send, tile: 'bg-blue-100 text-blue-600', href: '/factures', hero: false },
    { label: 'Reste à encaisser', value: formatCurrency(d.fin.resteAEncaisser), icon: Coins, tile: 'bg-amber-100 text-amber-600', href: '/relances', hero: false },
    { label: 'Devis en attente', value: formatCurrency(d.fin.devisEnAttente), icon: FileText, tile: 'bg-violet-100 text-violet-600', href: '/devis?statut=envoye', hero: false },
  ]

  return (
    <div className="space-y-7">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 animate-fade-up">
        <div>
          <h1 className="text-2xl md:text-[28px] font-bold font-heading text-marine">
            Bonjour <span className="text-primary">{prenom}</span> <span className="inline-block">👋</span>
          </h1>
          <p className="text-gray-500 mt-1 text-sm md:text-base">Voici l&apos;essentiel de votre activité aujourd&apos;hui.</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="hidden sm:flex items-center gap-1.5 px-3 h-9 rounded-full bg-white border border-gray-200 text-sm text-gray-600 capitalize shadow-[var(--shadow-xs)]">
            <CalendarDays className="w-4 h-4 text-gray-400" /> {dateLabel}
          </span>
          <span className="grid place-items-center w-9 h-9 rounded-full bg-gradient-to-br from-[#FF8A2B] to-[#FF6A00] text-white text-xs font-bold">{initials}</span>
        </div>
      </div>

      {/* 1. Chiffres vitaux */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {finCards.map((k, i) => {
          const Icon = k.icon
          return (
            <Link key={k.label} href={k.href} className="animate-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
              <Card className={`card-interactive h-full ${k.hero ? 'border-0 bg-primary text-primary-foreground shadow-[var(--shadow-brand)]' : 'border border-gray-200/80 bg-white'}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <span className={`text-sm font-medium ${k.hero ? 'text-white/85' : 'text-gray-500'}`}>{k.label}</span>
                    <span className={`grid place-items-center w-8 h-8 rounded-lg ${k.tile}`}><Icon className="w-4 h-4" /></span>
                  </div>
                  <div className={`text-[24px] md:text-[26px] font-bold mt-2 leading-none ${k.hero ? 'text-white' : 'text-marine'}`}>{k.value}</div>
                  {k.sub && (
                    <div className={`flex items-center gap-1 mt-2 text-xs font-medium ${k.hero ? 'text-white/85' : k.sub.positive ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {k.sub.positive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                      {k.sub.text}
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>

      {/* 2. À traiter aujourd'hui */}
      <div className="animate-fade-up" style={{ animationDelay: '120ms' }}>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">À traiter aujourd&apos;hui</h2>
        <Card className="border border-gray-200/80 bg-white">
          <CardContent className="p-4">
            {d.todos.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Rien d&apos;urgent — tout est à jour. Belle journée !
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-1">
                {d.todos.map((t, i) => (
                  <Link key={i} href={t.href} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 transition-colors group">
                    <span className={`grid place-items-center w-9 h-9 rounded-lg flex-shrink-0 ${t.tile}`}><t.icon className="w-4 h-4" /></span>
                    <span className="text-sm text-gray-700 flex-1">{t.text}</span>
                    <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-primary transition-colors flex-shrink-0" />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 3. Suivi des chantiers */}
      <div className="animate-fade-up" style={{ animationDelay: '150ms' }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Suivi des chantiers</h2>
          <Link href="/chantiers" className="text-xs font-medium text-primary hover:underline">Voir les chantiers</Link>
        </div>
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-1 grid grid-cols-2 gap-3 content-start">
            <MiniStat label="En cours" value={d.chantiers.enCours} icon={PlayCircle} tile="bg-accent text-primary" accent />
            <MiniStat label="À démarrer" value={d.chantiers.aDemarrer} icon={CalendarClock} tile="bg-blue-100 text-blue-600" />
            <MiniStat label="À facturer" value={d.chantiers.aFacturer} icon={Receipt} tile="bg-violet-100 text-violet-600" />
            <MiniStat label="En retard" value={d.chantiers.enRetard} icon={AlertTriangle} tile="bg-rose-100 text-rose-600" />
            <div className="col-span-2"><MiniStat label="Sans équipe prévue demain" value={d.chantiers.sansEquipe} icon={HardHat} tile="bg-amber-100 text-amber-600" /></div>
          </div>
          <Card className="lg:col-span-2 border border-gray-200/80 bg-white">
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold text-gray-500 mb-3">Chantiers actifs</h3>
              {d.chantiersActifs.length === 0 ? (
                <p className="text-sm text-gray-400 py-6 text-center">Aucun chantier actif — <Link href="/chantiers/nouveau" className="text-primary hover:underline">créez-en un</Link>.</p>
              ) : (
                <div className="space-y-1">
                  {d.chantiersActifs.map(c => (
                    <Link key={c.id} href={`/chantiers/${c.id}`}>
                      <div className="flex items-center gap-3 py-2 hover:bg-gray-50 rounded-xl px-2 -mx-2 transition-colors">
                        <span className="grid place-items-center w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex-shrink-0"><HardHat className="w-4 h-4" /></span>
                        <span className="text-sm text-gray-700 flex-1 min-w-0 truncate">{c.title}</span>
                        <Badge className={`${projectStatusColors[c.status as ProjectStatus] || 'bg-gray-100 text-gray-700'} border-0 text-xs flex-shrink-0`}>
                          {projectStatusLabels[c.status as ProjectStatus] || c.status}
                        </Badge>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 4. Évolution des encaissements */}
      <div className="animate-fade-up" style={{ animationDelay: '180ms' }}>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Évolution des encaissements</h2>
        <Card className="border border-gray-200/80 bg-white">
          <CardContent className="p-5">
            <EncaissementsChart series={d.series} />
          </CardContent>
        </Card>
      </div>

      {/* 5. Équipes & terrain */}
      <div className="animate-fade-up" style={{ animationDelay: '210ms' }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Équipes &amp; terrain — aujourd&apos;hui</h2>
          <Link href="/pointage" className="text-xs font-medium text-primary hover:underline">Voir le terrain</Link>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MiniStat label="Salariés prévus" value={d.terrain.salariesPrevus} icon={Users2} tile="bg-blue-100 text-blue-600" />
          <MiniStat label="Ont pointé" value={d.terrain.ontPointe} icon={Camera} tile="bg-emerald-100 text-emerald-600" />
          <MiniStat label="Heures déclarées" value={`${d.terrain.heuresJour} h`} icon={Clock} tile="bg-accent text-primary" accent />
          <MiniStat label="Véhicules actifs" value={d.terrain.vehiculesActifs} icon={Truck} tile="bg-violet-100 text-violet-600" />
          {d.terrain.pointagesManquants > 0 && <MiniStat label="Pointages photo manquants" value={d.terrain.pointagesManquants} icon={Camera} tile="bg-amber-100 text-amber-600" />}
          {d.terrain.incoherences > 0 && <MiniStat label="Heures / véhicules à vérifier" value={d.terrain.incoherences} icon={GitCompare} tile="bg-rose-100 text-rose-600" />}
        </div>
      </div>

      {/* 6. Administratif & comptable */}
      <div className="animate-fade-up" style={{ animationDelay: '240ms' }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Administratif &amp; comptable — ce mois</h2>
          <Link href="/comptable" className="text-xs font-medium text-primary hover:underline">Voir la compta</Link>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MiniStat label="Dépenses du mois" value={formatCurrency(d.admin.depensesMois)} icon={Wallet} tile="bg-accent text-primary" accent />
          <MiniStat label="Tickets scannés" value={d.admin.ticketsScannesMois} icon={ReceiptText} tile="bg-blue-100 text-blue-600" />
          <MiniStat label="Tickets à valider" value={d.admin.ticketsAVerifier} icon={CheckCircle2} tile="bg-amber-100 text-amber-600" />
          <MiniStat label="Justif. à transmettre" value={d.admin.aTransmettre} icon={FileCheck2} tile="bg-violet-100 text-violet-600" />
          <MiniStat label="Transmis comptable" value={d.admin.transmisComptable} icon={Send} tile="bg-emerald-100 text-emerald-600" />
          <MiniStat label="Paiements à rapprocher" value={d.admin.paiementsARapprocher} icon={BadgeEuro} tile="bg-blue-100 text-blue-600" />
        </div>
      </div>

      {/* 7. Activité récente */}
      <div className="animate-fade-up" style={{ animationDelay: '270ms' }}>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Activité récente</h2>
        <Card className="border border-gray-200/80 bg-white">
          <CardContent className="p-5">
            {d.activity.length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">Votre activité apparaîtra ici.</p>
            ) : (
              <div className="space-y-1">
                {d.activity.map((a, i) => {
                  const Icon = actIcon[a.type] || FileText
                  return (
                    <div key={i} className="flex items-center gap-3 py-2">
                      <span className={`grid place-items-center w-8 h-8 rounded-lg flex-shrink-0 ${actTile[a.type] || 'bg-gray-100 text-gray-500'}`}><Icon className="w-4 h-4" /></span>
                      <span className="text-sm text-gray-700 flex-1 min-w-0 truncate">{a.label}</span>
                      {a.amount > 0 && <span className="text-sm font-semibold text-marine tabular-nums">{formatCurrency(a.amount)}</span>}
                      <span className="text-xs text-gray-400 w-14 text-right flex-shrink-0">{ago(a.date)}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
