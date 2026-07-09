import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import {
  Wallet, Send, Coins, FileText, Clock, ReceiptText, Camera, Landmark, HardHat,
  Users2, Truck, AlertTriangle, CheckCircle2,
  Bell, CalendarDays, ArrowRight, Receipt, Users, GitCompare, FileCheck2, BadgeEuro,
  type LucideIcon,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils'
import { projectStatusLabels, projectStatusColors } from '@/lib/chantiers'
import type { ProjectStatus } from '@/types'
import EncaissementsChart from './EncaissementsChart'
import DonutMetricCard from '@/components/charts/DonutMetricCard'
import GaugeRing from '@/components/charts/GaugeRing'

const DONUT_COLORS = ['#D05C43', '#C77D0E', '#8A4B24', '#3F7A2E', '#94918A']

// Tons sémantiques chauds — cartes KPI dégradées + glow coloré
const TONES = {
  green: { fg: '#3F7A2E', chipA: '#6AA636', chipB: '#3F7A2E', tintA: '#E9F2DB', tintB: '#F6FAEF', glow: 'rgba(76,111,24,.22)', bd: '#DDE9C9' },
  coral: { fg: '#C14E33', chipA: '#F09A80', chipB: '#D0562F', tintA: '#FCE5DC', tintB: '#FEF5F0', glow: 'rgba(224,103,76,.26)', bd: '#F4D7CA' },
  amber: { fg: '#8A5A08', chipA: '#E2A536', chipB: '#C77D0E', tintA: '#FBEFD4', tintB: '#FEF9EE', glow: 'rgba(199,125,14,.22)', bd: '#F0E1C0' },
  terre: { fg: '#8A4B24', chipA: '#BC824F', chipB: '#8A4B24', tintA: '#F4E7D8', tintB: '#FBF5ED', glow: 'rgba(138,75,36,.20)', bd: '#EAD9C7' },
  red: { fg: '#C0392B', chipA: '#E06A5A', chipB: '#C0392B', tintA: '#FBE0DA', tintB: '#FEF2EF', glow: 'rgba(192,57,43,.22)', bd: '#F1D2CB' },
} as const
type Tone = keyof typeof TONES

// Courbe lissée (Catmull-Rom → Bézier) pour un mini-sparkline arrondi
function sparkPath(vals: number[], w = 120, h = 40, pad = 5) {
  if (vals.length < 2) return null
  const max = Math.max(...vals), min = Math.min(...vals)
  const rng = max - min || 1
  const step = w / (vals.length - 1)
  const pts = vals.map((v, i) => [+(i * step).toFixed(1), +(h - pad - ((v - min) / rng) * (h - 2 * pad)).toFixed(1)] as const)
  let line = `M${pts[0][0]},${pts[0][1]}`
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 2] || pts[i - 1], p1 = pts[i - 1], p = pts[i], p3 = pts[i + 1] || p
    const t = 0.2
    const c1x = (p1[0] + (p[0] - p0[0]) * t).toFixed(1), c1y = (p1[1] + (p[1] - p0[1]) * t).toFixed(1)
    const c2x = (p[0] - (p3[0] - p1[0]) * t).toFixed(1), c2y = (p[1] - (p3[1] - p1[1]) * t).toFixed(1)
    line += ` C${c1x},${c1y} ${c2x},${c2y} ${p[0]},${p[1]}`
  }
  return { line, area: `${line} L${w},${h} L0,${h} Z` }
}

function StatPro({ label, value, icon: Icon, tone, delta, gauge, note, spark }: {
  label: string; value: string; icon: LucideIcon; tone: Tone
  delta?: { text: string; dir: 'up' | 'down' | 'flat' }
  gauge?: number; note?: string; spark?: number[]
}) {
  const t = TONES[tone]
  const sp = spark ? sparkPath(spark, 120, 40, 5) : null
  const uid = `sp-${label.replace(/\W/g, '')}`
  const deltaCls = delta?.dir === 'up' ? 'bg-[#E9F2DB] text-[#3F7A2E]'
    : delta?.dir === 'down' ? 'bg-[#FBE0DA] text-[#C0392B]' : 'bg-white/70 text-gray-500'
  return (
    <div
      className="group relative h-full min-h-[152px] overflow-hidden rounded-xl border p-4 transition-all duration-200 hover:-translate-y-1"
      style={{
        borderColor: t.bd,
        background: `linear-gradient(150deg, ${t.tintA} 0%, ${t.tintB} 58%, #ffffff 100%)`,
        boxShadow: `0 14px 32px -16px ${t.glow}`,
      }}
    >
      {/* halo coloré */}
      <div aria-hidden className="absolute -top-10 -right-8 w-36 h-36 rounded-full pointer-events-none opacity-90"
        style={{ background: `radial-gradient(circle, ${t.glow}, transparent 70%)` }} />
      <div className="relative">
        <div className="flex items-start justify-between mb-3">
          <span className="grid place-items-center w-9 h-9 rounded-lg text-white shadow-[0_4px_10px_-3px_rgba(40,25,10,.35)] flex-shrink-0"
            style={{ background: `linear-gradient(135deg, ${t.chipA}, ${t.chipB})` }}>
            <Icon className="w-[18px] h-[18px]" strokeWidth={2} />
          </span>
          {gauge !== undefined ? (
            <GaugeRing value={gauge} size={42} strokeWidth={5} trackColor="rgba(40,25,10,.10)" fillColor={t.chipB}>
              <span className="text-[10px] font-bold" style={{ color: t.fg }}>{gauge}%</span>
            </GaugeRing>
          ) : delta ? (
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full backdrop-blur-sm ${deltaCls}`}>{delta.text}</span>
          ) : null}
        </div>
        <div className="text-[26px] font-bold text-marine leading-none tracking-tight tabular-nums">{value}</div>
        <div className="text-[12.5px] text-gray-600 mt-1.5 font-medium">{label}</div>
        {/* sparkline : zone dédiée sous le libellé, qui touche les bords de la carte */}
        {sp ? (
          <div className="-mx-4 -mb-4 mt-3">
            <svg className="w-full h-14 block" viewBox="0 0 120 40" preserveAspectRatio="none" aria-hidden>
              <defs>
                <linearGradient id={uid} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor={t.chipB} stopOpacity="0.28" />
                  <stop offset="1" stopColor={t.chipB} stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={sp.area} fill={`url(#${uid})`} />
              <path d={sp.line} fill="none" stroke={t.chipB} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        ) : note ? (
          <div className="text-[11px] text-gray-500 mt-2 leading-tight">{note}</div>
        ) : null}
      </div>
    </div>
  )
}

function TodoItem({ href, icon: Icon, tile, text }: { href: string; icon: LucideIcon; tile: string; text: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-black/[0.03] transition-colors group">
      <span className={`grid place-items-center w-9 h-9 rounded-lg flex-shrink-0 ${tile}`}><Icon className="w-4 h-4" /></span>
      <span className="text-sm text-gray-700 flex-1">{text}</span>
      <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-primary transition-colors flex-shrink-0" />
    </Link>
  )
}

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
    supabase.from('projects').select('id, title, status, end_date, progress, created_at').eq('user_id', userId).neq('status', 'archive'),
    supabase.from('expenses').select('amount_ttc, status, source, category, expense_date, created_at').eq('user_id', userId),
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

  // ── 1. Chiffres vitaux ──────────────────────────────────────────────
  const encaisseMois = inv.filter(i => isPaid(i.status) && inThisMonth(i.issue_date)).reduce((s, i) => s + num(i.total_ttc), 0)
  const encaisseMoisPrec = inv.filter(i => isPaid(i.status) && inLastMonth(i.issue_date)).reduce((s, i) => s + num(i.total_ttc), 0)
  const factureMois = inv.filter(i => i.status !== 'brouillon' && inThisMonth(i.issue_date)).reduce((s, i) => s + num(i.total_ttc), 0)
  // Cohérence des 3 cartes du mois : reste = facturé (envoyé) ce mois − encaissé ce mois
  const resteAEncaisser = Math.max(factureMois - encaisseMois, 0)
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
  // Chantiers disposant d'une équipe affectée aujourd'hui ou demain (pour la mini-liste)
  const teamProjects = new Set<string>([
    ...(asgTodayRes.data || []).map(a => a.project_id),
    ...equipeDemain,
  ])

  type Todo = { icon: LucideIcon; tile: string; text: string; href: string }
  const todos: Todo[] = []
  if (aRelancer > 0) todos.push({ icon: Bell, tile: 'bg-accent text-primary', text: `${aRelancer} devis à relancer`, href: '/relances' })
  if (facturesEchues > 0) todos.push({ icon: Landmark, tile: 'bg-amber-100 text-amber-600', text: `${facturesEchues} facture${facturesEchues > 1 ? 's' : ''} échue${facturesEchues > 1 ? 's' : ''} à encaisser`, href: '/banque' })
  if (aRapprocher > 0) todos.push({ icon: BadgeEuro, tile: 'bg-[#FCE7DE] text-[#C14E33]', text: `${aRapprocher} paiement${aRapprocher > 1 ? 's' : ''} à rapprocher`, href: '/banque' })
  if (ticketsAValider > 0) todos.push({ icon: ReceiptText, tile: 'bg-[#FBE0DA] text-[#C0392B]', text: `${ticketsAValider} ticket${ticketsAValider > 1 ? 's' : ''} à valider`, href: '/tickets' })
  if (aTransmettre > 0) todos.push({ icon: FileCheck2, tile: 'bg-[#F3E5D6] text-[#8A4B24]', text: `${aTransmettre} justificatif${aTransmettre > 1 ? 's' : ''} à transmettre comptable`, href: '/comptable' })
  if (salariesSansHeures > 0) todos.push({ icon: Clock, tile: 'bg-amber-100 text-amber-600', text: `${salariesSansHeures} salarié${salariesSansHeures > 1 ? 's n\'ont' : ' n\'a'} pas déclaré ses heures`, href: '/heures' })
  if (sansEquipeDemain > 0) todos.push({ icon: HardHat, tile: 'bg-[#FBE0DA] text-[#C0392B]', text: `${sansEquipeDemain} chantier${sansEquipeDemain > 1 ? 's' : ''} sans équipe prévue demain`, href: '/planning' })

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
    .map(c => ({
      id: c.id,
      title: c.title,
      status: c.status,
      progress: Math.max(0, Math.min(100, num((c as { progress?: number }).progress))),
      retardJours: c.end_date && c.end_date < today ? daysSince(c.end_date) : 0,
      sansEquipe: !teamProjects.has(c.id),
    }))

  // ── 4. Évolution des encaissements (séries) ─────────────────────────
  const paid = inv.filter(i => isPaid(i.status) && i.issue_date)
  const sumBetween = (start: Date, end: Date) =>
    paid.filter(i => { const d = new Date(i.issue_date!); return d >= start && d < end }).reduce((s, i) => s + num(i.total_ttc), 0)
  const s7 = Array.from({ length: 7 }, (_, k) => {
    const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(now.getDate() - (6 - k))
    const e = new Date(d); e.setDate(d.getDate() + 1)
    return { label: d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', ''), value: sumBetween(d, e) }
  })
  const sMois = Array.from({ length: 12 }, (_, k) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (11 - k), 1)
    const e = new Date(now.getFullYear(), now.getMonth() - (11 - k) + 1, 1)
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

  // Devis envoyés vs acceptés (6 derniers mois) — 2e graphique du dashboard (doc §3.6)
  const devisSeries = Array.from({ length: 6 }, (_, k) => {
    const dM = new Date(now.getFullYear(), now.getMonth() - (5 - k), 1)
    const inM = (d?: string | null) => {
      if (!d) return false
      const x = new Date(d)
      return x.getFullYear() === dM.getFullYear() && x.getMonth() === dM.getMonth()
    }
    const mq = quotes.filter(q => inM(q.issue_date || q.created_at))
    return {
      label: MONTHS[dM.getMonth()],
      envoyes: mq.filter(q => q.status !== 'brouillon' && q.status !== 'pret').length,
      acceptes: mq.filter(q => q.status === 'accepte' || q.status === 'transforme').length,
    }
  })

  // Séries mensuelles pour les sparklines des cartes KPI (6 mois)
  const monthSeries = (pred: (i: (typeof inv)[number]) => boolean) =>
    Array.from({ length: 6 }, (_, k) => {
      const dM = new Date(now.getFullYear(), now.getMonth() - (5 - k), 1)
      const inM = (d?: string | null) => {
        if (!d) return false
        const x = new Date(d)
        return x.getFullYear() === dM.getFullYear() && x.getMonth() === dM.getMonth()
      }
      return inv.filter(i => pred(i) && inM(i.issue_date)).reduce((s, i) => s + num(i.total_ttc), 0)
    })
  const encaisseSeries = monthSeries(i => isPaid(i.status))
  const factureSeries = monthSeries(i => i.status !== 'brouillon')

  // Cashflow mensuel (6 mois) : entrées (encaissé) vs dépenses, pour les barres
  const depensesSeries = Array.from({ length: 6 }, (_, k) => {
    const dM = new Date(now.getFullYear(), now.getMonth() - (5 - k), 1)
    const inM = (d?: string | null) => {
      if (!d) return false
      const x = new Date(d)
      return x.getFullYear() === dM.getFullYear() && x.getMonth() === dM.getMonth()
    }
    return exp.filter(e => inM(e.expense_date || e.created_at)).reduce((s, e) => s + num(e.amount_ttc), 0)
  })
  const cashflow = Array.from({ length: 6 }, (_, k) => {
    const dM = new Date(now.getFullYear(), now.getMonth() - (5 - k), 1)
    return { label: MONTHS[dM.getMonth()], entrees: encaisseSeries[k], depenses: depensesSeries[k] }
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
  const depensesCeMois = exp.filter(e => inThisMonth(e.expense_date || e.created_at))
  const catTotals = new Map<string, number>()
  for (const e of depensesCeMois) {
    const cat = e.category || 'Non classé'
    catTotals.set(cat, (catTotals.get(cat) || 0) + num(e.amount_ttc))
  }
  const catSorted = [...catTotals.entries()].sort((a, b) => b[1] - a[1])
  const catAutres = catSorted.slice(4).reduce((s, [, v]) => s + v, 0)
  const parCategorie = [
    ...catSorted.slice(0, 4).map(([label, value]) => ({ label, value })),
    ...(catAutres > 0 ? [{ label: 'Autres', value: catAutres }] : []),
  ]

  const admin = {
    ticketsScannesMois: exp.filter(e => e.source === 'ticket' && inThisMonth(e.created_at)).length,
    ticketsAVerifier: ticketsAValider,
    depensesMois: depensesCeMois.reduce((s, e) => s + num(e.amount_ttc), 0),
    transmisComptable: exp.filter(e => e.status === 'envoye_comptable' && inThisMonth(e.created_at)).length,
    paiementsARapprocher: aRapprocher,
    aTransmettre,
    parCategorie,
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
    kpiSparks: { encaisse: encaisseSeries, facture: factureSeries },
    todos,
    chantiers, chantiersActifs,
    series: { '7j': s7, mois: sMois, trimestre: sTri, annee: sAnnee },
    devisSeries, cashflow,
    terrain, admin, activity,
  }
}

function MiniStat({ label, value, icon: Icon, tile, accent }: { label: string; value: string | number; icon: LucideIcon; tile: string; accent?: boolean }) {
  return (
    <div className="rounded-lg bg-white border border-gray-200/80 p-3.5 shadow-[var(--shadow-xs)]">
      <span className={`grid place-items-center w-8 h-8 rounded-lg ${tile}`}><Icon className="w-4 h-4" /></span>
      <div className={`text-2xl font-bold mt-2 leading-none ${accent ? 'text-primary' : 'text-marine'}`}>{value}</div>
      <div className="text-[11px] text-gray-500 mt-1 leading-tight">{label}</div>
    </div>
  )
}

function CashflowBars({ data }: { data: { label: string; entrees: number; depenses: number }[] }) {
  const max = Math.max(...data.flatMap(d => [d.entrees, d.depenses]), 1)
  const totalEnt = data.reduce((s, d) => s + d.entrees, 0)
  const totalDep = data.reduce((s, d) => s + d.depenses, 0)
  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <p className="text-sm text-gray-500 font-medium">Entrées vs dépenses (6 mois)</p>
          <p className="text-[22px] font-bold leading-none mt-1 tabular-nums">
            <span className="text-[#22A45A]">{formatCurrency(totalEnt)}</span>
            <span className="text-gray-300 font-normal mx-2">/</span>
            <span className="text-[#DC3B2E]">{formatCurrency(totalDep)}</span>
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#22A45A]" /> Entrées</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#DC3B2E]" /> Dépenses</span>
        </div>
      </div>
      <div className="flex items-end justify-between gap-3 h-44">
        {data.map((d, i) => (
          <div key={i} className="flex-1 h-full flex items-end justify-center gap-1">
            {/* entrées (vert) */}
            <div
              className="flex-1 max-w-[14px] rounded-t bg-gradient-to-t from-[#22A45A] to-[#5CCB86]"
              style={{ height: `${Math.max((d.entrees / max) * 100, d.entrees > 0 ? 2 : 0)}%` }}
              title={`Entrées ${formatCurrency(d.entrees)}`}
            />
            {/* dépenses (rouge) */}
            <div
              className="flex-1 max-w-[14px] rounded-t bg-gradient-to-t from-[#DC3B2E] to-[#EF7563]"
              style={{ height: `${Math.max((d.depenses / max) * 100, d.depenses > 0 ? 2 : 0)}%` }}
              title={`Dépenses ${formatCurrency(d.depenses)}`}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between gap-3 mt-2">
        {data.map((d, i) => <span key={i} className="flex-1 text-center text-[11px] text-gray-400">{d.label}</span>)}
      </div>
    </div>
  )
}

const actIcon: Record<string, LucideIcon> = { devis: FileText, facture: Receipt, client: Users, chantier: HardHat }
const actTile: Record<string, string> = { devis: 'bg-accent text-primary', facture: 'bg-[#F3E5D6] text-[#8A4B24]', client: 'bg-emerald-100 text-emerald-600', chantier: 'bg-[#FCE7DE] text-[#C14E33]' }

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single()
  const d = await getData(user.id)
  const prenom = profile?.full_name?.split(' ')[0] || 'vous'
  const initials = (profile?.full_name || user.email || 'BP').split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()
  const dateLabel = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

  const encaissePct = d.fin.factureMois > 0 ? Math.round((d.fin.encaisseMois / d.fin.factureMois) * 100) : 0

  // Taux d'acceptation des devis (6 mois) — affiché en badge sur la carte "Devis en attente"
  const totalEnvDevis = d.devisSeries.reduce((s, x) => s + x.envoyes, 0)
  const totalAccDevis = d.devisSeries.reduce((s, x) => s + x.acceptes, 0)
  const tauxAccept = totalEnvDevis > 0 ? Math.round((totalAccDevis / totalEnvDevis) * 100) : 0

  // Cartes KPI pro : vert = encaissé (positif), corail = facturé (marque),
  // ambre = reste à encaisser (en attente, jauge), terre = devis (pipeline).
  const finCards: {
    label: string; value: string; icon: LucideIcon; tone: Tone; href: string
    delta?: { text: string; dir: 'up' | 'down' | 'flat' }; gauge?: number; note?: string; spark?: number[]
  }[] = [
    {
      label: 'Factures encaissées ce mois', value: formatCurrency(d.fin.encaisseMois), icon: Wallet, tone: 'green', href: '/banque',
      spark: d.kpiSparks.encaisse, gauge: encaissePct,
    },
    { label: 'Factures envoyées ce mois', value: formatCurrency(d.fin.factureMois), icon: Send, tone: 'coral', href: '/factures', spark: d.kpiSparks.facture },
    { label: 'Reste à encaisser', value: formatCurrency(d.fin.resteAEncaisser), icon: Coins, tone: 'amber', href: '/relances', note: 'Sur les factures envoyées ce mois' },
    { label: 'Devis en attente', value: formatCurrency(d.fin.devisEnAttente), icon: FileText, tone: 'terre', href: '/devis?statut=envoye', note: 'Pipeline commercial en cours', gauge: tauxAccept },
  ]

  return (
    <div className="relative space-y-7">
      {/* Fond décoratif : grille blueprint très pâle + halo corail (sort des carrés blancs) */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-4 md:-inset-8 -z-10"
        style={{
          backgroundImage: [
            'radial-gradient(55% 45% at 100% -5%, rgba(224,103,76,0.07), transparent 60%)',
            'radial-gradient(50% 40% at 0% 100%, rgba(76,111,24,0.05), transparent 55%)',
            'linear-gradient(rgba(24,23,15,0.028) 1px, transparent 1px)',
            'linear-gradient(90deg, rgba(24,23,15,0.028) 1px, transparent 1px)',
          ].join(', '),
          backgroundSize: '100% 100%, 100% 100%, 24px 24px, 24px 24px',
          maskImage: 'linear-gradient(180deg, #000 0%, #000 70%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(180deg, #000 0%, #000 70%, transparent 100%)',
        }}
      />
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
          <span className="grid place-items-center w-9 h-9 rounded-full bg-gradient-to-br from-[#F09A80] to-[#D05C43] text-white text-xs font-bold">{initials}</span>
        </div>
      </div>

      {/* 1. Chiffres vitaux */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {finCards.map((k, i) => (
          <Link key={k.label} href={k.href} className="animate-fade-up block" style={{ animationDelay: `${i * 60}ms` }}>
            <StatPro label={k.label} value={k.value} icon={k.icon} tone={k.tone} delta={k.delta} gauge={k.gauge} note={k.note} spark={k.spark} />
          </Link>
        ))}
      </div>

      {/* 2. À traiter (moitié gauche) + Évolution des encaissements (moitié droite) */}
      <div className="grid lg:grid-cols-2 gap-4 items-stretch animate-fade-up" style={{ animationDelay: '120ms' }}>
        <div className="flex flex-col">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">À traiter aujourd&apos;hui</h2>
          <Card className="flex-1 border border-gray-200/80 bg-gradient-to-br from-white to-[#FBF2EC]">
            <CardContent className="p-3">
              {d.todos.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Rien d&apos;urgent — tout est à jour. Belle journée !
                </div>
              ) : (
                <div className="space-y-0.5">
                  {d.todos.slice(0, 4).map((t, i) => (
                    <TodoItem key={i} href={t.href} icon={t.icon} tile={t.tile} text={t.text} />
                  ))}
                  {d.todos.length > 4 && (
                    <details className="group/more">
                      <summary className="flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-primary cursor-pointer list-none hover:underline">
                        <span className="group-open/more:hidden">Afficher plus ({d.todos.length - 4})</span>
                        <span className="hidden group-open/more:inline">Réduire</span>
                        <ArrowRight className="w-3.5 h-3.5 rotate-90 group-open/more:-rotate-90 transition-transform" />
                      </summary>
                      <div className="space-y-0.5 mt-0.5">
                        {d.todos.slice(4).map((t, i) => (
                          <TodoItem key={i} href={t.href} icon={t.icon} tile={t.tile} text={t.text} />
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        <div className="flex flex-col">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Évolution des encaissements</h2>
          <Card className="flex-1 border border-gray-200/80 bg-gradient-to-br from-white to-[#FBF2EC]">
            <CardContent className="p-5">
              <EncaissementsChart series={d.series} />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 3. Suivi des chantiers */}
      <div className="animate-fade-up" style={{ animationDelay: '150ms' }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Suivi des chantiers</h2>
          <Link href="/chantiers" className="text-xs font-medium text-primary hover:underline">Voir les chantiers</Link>
        </div>
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-1">
            <DonutMetricCard
              title="Statut des chantiers"
              subtitle="Répartition en temps réel"
              total={String(d.chantiers.enCours + d.chantiers.aDemarrer + d.chantiers.enRetard + d.chantiers.aFacturer)}
              centerLabel="Chantiers"
              segments={[
                { label: 'En cours', value: d.chantiers.enCours, color: '#22A45A' },
                { label: 'À démarrer', value: d.chantiers.aDemarrer, color: '#2F7DE0' },
                { label: 'À facturer', value: d.chantiers.aFacturer, color: '#E6B02E' },
                { label: 'En retard', value: d.chantiers.enRetard, color: '#DC3B2E' },
              ]}
              emptyMessage="Aucun chantier en cours pour le moment."
            />
          </div>
          <Card className="lg:col-span-2 border border-gray-200/80 bg-gradient-to-br from-white to-[#FBF2EC]">
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold text-gray-500 mb-4">Chantiers actifs · avancement</h3>
              {d.chantiersActifs.length === 0 ? (
                <p className="text-sm text-gray-400 py-6 text-center">Aucun chantier actif — <Link href="/chantiers/nouveau" className="text-primary hover:underline">créez-en un</Link>.</p>
              ) : (
                <div className="space-y-1.5">
                  {d.chantiersActifs.map(c => {
                    const barColor = c.progress >= 80 ? '#4C6F18' : c.progress >= 40 ? '#E0674C' : '#C77D0E'
                    return (
                      <Link key={c.id} href={`/chantiers/${c.id}`} className="block hover:bg-black/[0.03] rounded-lg px-2 -mx-2 py-2 transition-colors">
                        <div className="flex items-center gap-3">
                          <span className="grid place-items-center w-8 h-8 rounded-lg bg-[#FCE7DE] text-[#C14E33] flex-shrink-0"><HardHat className="w-4 h-4" /></span>
                          <span className="text-sm font-medium text-gray-700 flex-1 min-w-0 truncate">{c.title}</span>
                          {c.retardJours > 0 && (
                            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-medium text-[#C0392B] flex-shrink-0">
                              <AlertTriangle className="w-3 h-3" /> {c.retardJours}j
                            </span>
                          )}
                          <Badge className={`${projectStatusColors[c.status as ProjectStatus] || 'bg-gray-100 text-gray-700'} border-0 text-xs flex-shrink-0`}>
                            {projectStatusLabels[c.status as ProjectStatus] || c.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2.5 mt-2 pl-11">
                          <div className="flex-1 h-1.5 rounded-full bg-black/[0.07] overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${c.progress}%`, backgroundColor: barColor }} />
                          </div>
                          <span className="text-[11px] font-semibold text-marine tabular-nums w-8 text-right flex-shrink-0">{c.progress}%</span>
                          <span className={`hidden md:inline-flex items-center gap-1 text-[11px] font-medium flex-shrink-0 w-[92px] ${c.sansEquipe ? 'text-[#C77D0E]' : 'text-[#4C6F18]'}`}>
                            {c.sansEquipe ? <><AlertTriangle className="w-3 h-3" /> Sans équipe</> : <><CheckCircle2 className="w-3 h-3" /> Équipe OK</>}
                          </span>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 5. Équipes & terrain */}
      <div className="animate-fade-up" style={{ animationDelay: '210ms' }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Équipes &amp; terrain — aujourd&apos;hui</h2>
          <Link href="/pointage" className="text-xs font-medium text-primary hover:underline">Voir le terrain</Link>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MiniStat label="Salariés prévus" value={d.terrain.salariesPrevus} icon={Users2} tile="bg-[#FCE7DE] text-[#C14E33]" />
          <MiniStat label="Ont pointé" value={d.terrain.ontPointe} icon={Camera} tile="bg-emerald-100 text-emerald-600" />
          <MiniStat label="Heures déclarées" value={`${d.terrain.heuresJour} h`} icon={Clock} tile="bg-accent text-primary" accent />
          <MiniStat label="Véhicules actifs" value={d.terrain.vehiculesActifs} icon={Truck} tile="bg-[#F3E5D6] text-[#8A4B24]" />
          {d.terrain.pointagesManquants > 0 && <MiniStat label="Pointages photo manquants" value={d.terrain.pointagesManquants} icon={Camera} tile="bg-amber-100 text-amber-600" />}
          {d.terrain.incoherences > 0 && <MiniStat label="Heures / véhicules à vérifier" value={d.terrain.incoherences} icon={GitCompare} tile="bg-[#FBE0DA] text-[#C0392B]" />}
        </div>
      </div>

      {/* 6. Administratif & comptable */}
      <div className="animate-fade-up" style={{ animationDelay: '240ms' }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Administratif &amp; comptable — ce mois</h2>
          <Link href="/comptable" className="text-xs font-medium text-primary hover:underline">Voir la compta</Link>
        </div>
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <div className="grid grid-cols-2 gap-3.5">
              <Link href="/depenses" className="block">
                <StatPro label="Dépenses du mois" value={formatCurrency(d.admin.depensesMois)} icon={Wallet} tone="red" spark={d.cashflow.map(c => c.depenses)} />
              </Link>
              <Link href="/banque" className="block">
                <StatPro label="Entrées du mois" value={formatCurrency(d.fin.encaisseMois)} icon={BadgeEuro} tone="green" spark={d.cashflow.map(c => c.entrees)} />
              </Link>
            </div>
            <Card className="border border-gray-200/80 bg-gradient-to-br from-white to-[#FBF2EC]">
              <CardContent className="p-5">
                <CashflowBars data={d.cashflow} />
              </CardContent>
            </Card>
          </div>
          <div className="lg:col-span-1">
            <DonutMetricCard
              title="Répartition des dépenses"
              subtitle="Ce mois-ci, par catégorie"
              total={formatCurrency(d.admin.depensesMois)}
              segments={d.admin.parCategorie.map((c, i) => ({ label: c.label, value: c.value, color: DONUT_COLORS[i % DONUT_COLORS.length] }))}
              format={v => (v >= 1000 ? `${(v / 1000).toFixed(1).replace('.', ',')} k€` : `${Math.round(v)} €`)}
              emptyMessage="Aucune dépense enregistrée ce mois-ci."
            />
          </div>
        </div>
      </div>

      {/* 7. Activité récente */}
      <div className="animate-fade-up" style={{ animationDelay: '270ms' }}>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Activité récente</h2>
        <Card className="border border-gray-200/80 bg-gradient-to-br from-white to-[#FBF2EC]">
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
