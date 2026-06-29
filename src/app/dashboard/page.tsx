import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import {
  Mail, FileText, Receipt, Users, ScanLine, Upload,
  Clock, Send, CheckCircle2, TrendingUp, Bell, CalendarDays,
  HardHat, PlayCircle, CalendarClock, AlertTriangle, ReceiptText, type LucideIcon
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils'
import { projectStatusLabels, projectStatusColors } from '@/lib/chantiers'
import type { ProjectStatus } from '@/types'

const MONTHS = ['Janv', 'Févr', 'Mars', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc']

function ago(d: string) {
  const diff = Date.now() - new Date(d).getTime()
  const h = Math.floor(diff / 3_600_000)
  if (h < 1) return "à l'instant"
  if (h < 24) return `il y a ${h}h`
  const days = Math.floor(h / 24)
  return days === 1 ? 'hier' : `il y a ${days}j`
}

async function getData(userId: string) {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]

  const [quotes, invoices, clients, projects] = await Promise.all([
    supabase.from('quotes').select('status, total_ttc, quote_number, created_at, project_id').eq('user_id', userId),
    supabase.from('invoices').select('status, due_date, issue_date, created_at, subtotal_ht, total_ttc, invoice_number').eq('user_id', userId),
    supabase.from('clients').select('id, first_name, last_name, company_name, created_at').eq('user_id', userId),
    supabase.from('projects').select('id, title, status, start_date, end_date, created_at').eq('user_id', userId).neq('status', 'archive'),
  ])

  const q = quotes.data || []
  const inv = invoices.data || []
  const cl = clients.data || []
  const pr = projects.data || []

  const isPaid = (s: string) => s === 'payee' || s === 'payée' || s === 'paye'

  // Évolution du CA — 6 derniers mois (factures payées, HT réel)
  const now = new Date()
  const buckets: { key: string; label: string; value: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    buckets.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: MONTHS[d.getMonth()], value: 0 })
  }
  for (const f of inv) {
    if (!isPaid(f.status)) continue
    const dStr = f.issue_date || f.created_at
    if (!dStr) continue
    const d = new Date(dStr)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    const b = buckets.find(x => x.key === key)
    if (b) b.value += Number(f.subtotal_ht) || 0
  }
  const caHt = buckets.reduce((s, b) => s + b.value, 0)

  // Activité récente (devis + factures + clients + chantiers)
  const activity = [
    ...q.map(x => ({ type: 'devis', label: `Devis ${x.quote_number}`, amount: Number(x.total_ttc) || 0, date: x.created_at, status: x.status })),
    ...inv.map(x => ({ type: 'facture', label: `Facture ${x.invoice_number}`, amount: Number(x.total_ttc) || 0, date: x.created_at, status: x.status })),
    ...cl.map(x => ({ type: 'client', label: `Client ${x.company_name || `${x.first_name || ''} ${x.last_name || ''}`.trim()}`, amount: 0, date: x.created_at, status: '' })),
    ...pr.map(x => ({ type: 'chantier', label: `Chantier ${x.title}`, amount: 0, date: x.created_at, status: x.status })),
  ].filter(a => a.date).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 6)

  // Pilotage chantiers
  const closedStatuses = ['termine', 'facture', 'paye', 'archive']
  const projectsWithQuote = new Set(q.map(x => x.project_id).filter(Boolean))
  const chantiersEnCours = pr.filter(x => x.status === 'en_cours')
  const chantiersAPlanifier = pr.filter(x => x.status === 'a_planifier' || x.status === 'planifie')
  const chantiersEnRetard = pr.filter(x => !closedStatuses.includes(x.status) && x.end_date && x.end_date < today)
  const chantiersSansDevis = pr.filter(x => !closedStatuses.includes(x.status) && !projectsWithQuote.has(x.id))

  const chantierAlerts: string[] = []
  if (chantiersEnRetard.length) chantierAlerts.push(`${chantiersEnRetard.length} chantier${chantiersEnRetard.length > 1 ? 's ont' : ' a'} dépassé la date de fin prévue`)
  if (chantiersAPlanifier.length) chantierAlerts.push(`${chantiersAPlanifier.length} chantier${chantiersAPlanifier.length > 1 ? 's' : ''} à planifier`)
  if (chantiersSansDevis.length) chantierAlerts.push(`${chantiersSansDevis.length} chantier${chantiersSansDevis.length > 1 ? 's' : ''} sans devis rattaché`)

  return {
    devisEnAttente: q.filter(x => x.status === 'envoye').length,
    facturesAEnvoyer: inv.filter(x => x.status === 'brouillon').length,
    facturesPayees: inv.filter(x => isPaid(x.status)).length,
    facturesEnRetard: inv.filter(x => x.status === 'envoyee' && x.due_date && x.due_date < today).length,
    caHt,
    totalClients: cl.length,
    serie: buckets,
    activity,
    chantiersEnCoursCount: chantiersEnCours.length,
    chantiersAPlanifierCount: chantiersAPlanifier.length,
    chantiersEnRetardCount: chantiersEnRetard.length,
    chantiersActifs: pr.filter(x => !closedStatuses.includes(x.status))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5),
    chantierAlerts,
  }
}

function CaChart({ data }: { data: { label: string; value: number }[] }) {
  const W = 640, H = 150, P = 8
  const max = Math.max(...data.map(d => d.value), 1)
  const pts = data.map((d, i) => {
    const x = P + (i * (W - 2 * P)) / (data.length - 1)
    const y = H - P - (d.value / max) * (H - 2 * P - 10)
    return [x, y] as const
  })
  // Courbe lissée (Catmull-Rom → Bézier cubique)
  const line = pts.length < 2
    ? `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`
    : pts.reduce((d, p, i) => {
        if (i === 0) return `M${p[0].toFixed(1)},${p[1].toFixed(1)}`
        const p0 = pts[i - 2] || pts[i - 1]
        const p1 = pts[i - 1]
        const p2 = p
        const p3 = pts[i + 1] || p
        const t = 0.18
        const c1x = p1[0] + (p2[0] - p0[0]) * t, c1y = p1[1] + (p2[1] - p0[1]) * t
        const c2x = p2[0] - (p3[0] - p1[0]) * t, c2y = p2[1] - (p3[1] - p1[1]) * t
        return `${d} C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`
      }, '')
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${H} L${pts[0][0].toFixed(1)},${H} Z`
  return (
    <svg viewBox={`0 0 ${W} ${H + 18}`} className="w-full">
      <defs>
        <linearGradient id="caFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.20" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#caFill)" />
      <path d={line} fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="3.5" fill="#fff" stroke="var(--primary)" strokeWidth="2" />)}
      {data.map((d, i) => (
        <text key={i} x={pts[i][0]} y={H + 14} textAnchor="middle" fontSize="11" fill="#94A3B8">{d.label}</text>
      ))}
    </svg>
  )
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single()
  const d = await getData(user.id)
  const prenom = profile?.full_name?.split(' ')[0] || 'vous'
  const dateLabel = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  const initials = (profile?.full_name || user.email || 'BP').split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()

  const kpis = [
    { label: 'Devis en attente', value: String(d.devisEnAttente), icon: Clock, tile: 'bg-accent text-primary', href: '/devis?statut=envoye', hero: false },
    { label: 'Factures à envoyer', value: String(d.facturesAEnvoyer), icon: Send, tile: 'bg-blue-100 text-blue-600', href: '/factures?statut=brouillon', hero: false },
    { label: "Chiffre d'affaires (HT)", value: formatCurrency(d.caHt), icon: TrendingUp, tile: 'bg-emerald-100 text-emerald-600', href: '/factures', hero: true },
    { label: 'Factures payées', value: String(d.facturesPayees), icon: CheckCircle2, tile: 'bg-violet-100 text-violet-600', href: '/factures?statut=payee', hero: false },
  ]

  const actions = [
    { href: '/emails', label: 'Nouvel email', icon: Mail, tile: 'bg-blue-500' },
    { href: '/devis/nouveau', label: 'Créer un devis', icon: FileText, tile: 'bg-primary' },
    { href: '/chantiers/nouveau', label: 'Nouveau chantier', icon: HardHat, tile: 'bg-blue-600' },
    { href: '/factures/nouveau', label: 'Créer une facture', icon: Receipt, tile: 'bg-violet-500' },
    { href: '/tickets', label: 'Scanner un ticket', icon: ReceiptText, tile: 'bg-rose-500' },
    { href: '/clients/nouveau', label: 'Ajouter un client', icon: Users, tile: 'bg-emerald-500' },
    { href: '/plans', label: 'Analyser un plan', icon: ScanLine, tile: 'bg-slate-700' },
    { href: '/prix/importer', label: 'Importer un doc', icon: Upload, tile: 'bg-amber-500' },
  ]

  const chantierKpis = [
    { label: 'Chantiers en cours', value: d.chantiersEnCoursCount, icon: PlayCircle, tile: 'bg-accent text-primary' },
    { label: 'À planifier', value: d.chantiersAPlanifierCount, icon: CalendarClock, tile: 'bg-amber-100 text-amber-600' },
    { label: 'En retard', value: d.chantiersEnRetardCount, icon: AlertTriangle, tile: 'bg-rose-100 text-rose-600' },
  ]

  const actIcon: Record<string, LucideIcon> = { devis: FileText, facture: Receipt, client: Users, chantier: HardHat }
  const actTile: Record<string, string> = { devis: 'bg-accent text-primary', facture: 'bg-violet-100 text-violet-600', client: 'bg-emerald-100 text-emerald-600', chantier: 'bg-blue-100 text-blue-600' }

  return (
    <div className="space-y-6">
      {/* Barre du haut */}
      <div className="flex items-start justify-between gap-4 animate-fade-up">
        <div>
          <h1 className="text-2xl md:text-[28px] font-bold text-[#0F172A]">
            Bonjour <span className="text-primary">{prenom}</span> <span className="inline-block">👋</span>
          </h1>
          <p className="text-gray-500 mt-1 text-sm md:text-base">Voici un aperçu de votre activité aujourd&apos;hui.</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="hidden sm:flex items-center gap-1.5 px-3 h-9 rounded-xl bg-white border border-gray-200 text-sm text-gray-600 capitalize shadow-[var(--shadow-xs)]">
            <CalendarDays className="w-4 h-4 text-gray-400" /> {dateLabel}
          </span>
          <button className="grid place-items-center w-9 h-9 rounded-xl bg-white border border-gray-200 text-gray-500 hover:text-gray-800 shadow-[var(--shadow-xs)] transition-colors">
            <Bell className="w-4 h-4" />
          </button>
          <span className="grid place-items-center w-9 h-9 rounded-xl bg-gradient-to-br from-[#FF8A2B] to-[#FF6A00] text-white text-xs font-bold">{initials}</span>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((k, i) => {
          const Icon = k.icon
          return (
            <Link key={k.label} href={k.href} className="animate-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
              <Card className={`card-interactive h-full ${k.hero ? 'border-0 bg-primary text-primary-foreground shadow-[var(--shadow-brand)]' : 'border border-gray-200/80 bg-white'}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <span className={`text-sm font-medium ${k.hero ? 'text-white/85' : 'text-gray-500'}`}>{k.label}</span>
                    <span className={`grid place-items-center w-8 h-8 rounded-lg ${k.hero ? 'bg-white/20 text-white' : k.tile}`}><Icon className="w-4 h-4" /></span>
                  </div>
                  <div className={`text-[26px] font-bold mt-2 leading-none ${k.hero ? 'text-white' : 'text-[#0F172A]'}`}>{k.value}</div>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>

      {/* Actions rapides */}
      <div className="animate-fade-up" style={{ animationDelay: '120ms' }}>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Actions rapides</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {actions.map(({ href, label, icon: Icon, tile }) => (
            <Link key={href} href={href}>
              <Card className="card-interactive sheen group border border-gray-200/80 bg-white h-full">
                <CardContent className="p-4 flex flex-col items-center text-center gap-2.5">
                  <span className={`grid place-items-center w-11 h-11 rounded-xl text-white shadow-sm ${tile}`}>
                    <Icon className="w-5 h-5" strokeWidth={2.2} />
                  </span>
                  <span className="font-semibold text-[13px] text-[#0F172A] leading-tight">{label}</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* Pilotage chantiers */}
      <div className="animate-fade-up" style={{ animationDelay: '150ms' }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Pilotage chantiers</h2>
          <Link href="/chantiers" className="text-xs font-medium text-blue-600 hover:underline">Voir tout</Link>
        </div>
        <div className="grid lg:grid-cols-3 gap-4">
          {/* Mini KPIs + alertes */}
          <div className="lg:col-span-1 space-y-3">
            <div className="grid grid-cols-3 gap-3">
              {chantierKpis.map(k => {
                const Icon = k.icon
                return (
                  <Link key={k.label} href="/chantiers">
                    <Card className="card-interactive border border-gray-200/80 bg-white h-full">
                      <CardContent className="p-3">
                        <span className={`grid place-items-center w-8 h-8 rounded-lg ${k.tile}`}><Icon className="w-4 h-4" /></span>
                        <div className="text-2xl font-bold text-[#0F172A] mt-2 leading-none">{k.value}</div>
                        <div className="text-[11px] text-gray-500 mt-1 leading-tight">{k.label}</div>
                      </CardContent>
                    </Card>
                  </Link>
                )
              })}
            </div>
            {d.chantierAlerts.length > 0 && (
              <Card className="border border-amber-200 bg-amber-50/60">
                <CardContent className="p-3 space-y-1.5">
                  {d.chantierAlerts.map((a, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-amber-800">
                      <Bell className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                      <span>{a}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Chantiers actifs */}
          <Card className="lg:col-span-2 border border-gray-200/80 bg-white">
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold text-gray-500 mb-3">Chantiers actifs</h3>
              {d.chantiersActifs.length === 0 ? (
                <p className="text-sm text-gray-400 py-6 text-center">
                  Aucun chantier actif — <Link href="/chantiers/nouveau" className="text-blue-600 hover:underline">créez-en un</Link>.
                </p>
              ) : (
                <div className="space-y-1">
                  {d.chantiersActifs.map(c => (
                    <Link key={c.id} href={`/chantiers/${c.id}`}>
                      <div className="flex items-center gap-3 py-2 hover:bg-gray-50 rounded px-2 -mx-2">
                        <span className="grid place-items-center w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex-shrink-0">
                          <HardHat className="w-4 h-4" />
                        </span>
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

      {/* CA + Activité */}
      <div className="grid lg:grid-cols-2 gap-4 animate-fade-up" style={{ animationDelay: '180ms' }}>
        <Card className="border border-gray-200/80 bg-white">
          <CardContent className="p-5">
            <div className="flex items-baseline justify-between mb-1">
              <h2 className="text-sm font-semibold text-gray-500">Évolution du CA (HT)</h2>
              <span className="text-xs text-gray-400">6 derniers mois</span>
            </div>
            <div className="text-2xl font-bold text-[#0F172A] mb-3">{formatCurrency(d.caHt)}</div>
            {d.caHt > 0
              ? <CaChart data={d.serie} />
              : <p className="text-sm text-gray-400 py-8 text-center">Aucune facture payée pour l&apos;instant — votre CA s&apos;affichera ici.</p>}
          </CardContent>
        </Card>

        <Card className="border border-gray-200/80 bg-white">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-500">Activité récente</h2>
            </div>
            {d.activity.length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">Votre activité apparaîtra ici.</p>
            ) : (
              <div className="space-y-1">
                {d.activity.map((a, i) => {
                  const Icon = actIcon[a.type] || FileText
                  return (
                    <div key={i} className="flex items-center gap-3 py-2">
                      <span className={`grid place-items-center w-8 h-8 rounded-lg flex-shrink-0 ${actTile[a.type] || 'bg-gray-100 text-gray-500'}`}>
                        <Icon className="w-4 h-4" />
                      </span>
                      <span className="text-sm text-gray-700 flex-1 min-w-0 truncate">{a.label}</span>
                      {a.amount > 0 && <span className="text-sm font-semibold text-[#0F172A] tabular-nums">{formatCurrency(a.amount)}</span>}
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
