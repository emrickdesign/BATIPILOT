import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import {
  HardHat, FileText, Receipt, BellRing, ReceiptText, Landmark, Mail,
  CheckCircle2, ArrowRight, Sparkles, type LucideIcon,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { clientDisplayName } from '@/lib/clients'
import AutomationRules from './AutomationRules'

const DAY = 86_400_000
const daysSince = (d?: string | null) => (d ? Math.floor((Date.now() - new Date(d).getTime()) / DAY) : 0)
const CLOSED = ['termine', 'facture', 'paye', 'archive']

type Suggestion = { id: string; icon: LucideIcon; tile: string; title: string; detail: string; actionLabel: string; href: string }
type ClientLite = { type: string; first_name: string | null; last_name: string | null; company_name: string | null } | null

async function getSuggestions(userId: string): Promise<Suggestion[]> {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]

  const [quotesRes, invoicesRes, projectsRes, expensesRes, emailsRes] = await Promise.all([
    supabase.from('quotes').select('id, quote_number, status, project_id, client_id, issue_date, reminded_at, clients(type, first_name, last_name, company_name)').eq('user_id', userId),
    supabase.from('invoices').select('id, invoice_number, status, due_date, project_id').eq('user_id', userId),
    supabase.from('projects').select('id, title, status, client_id').eq('user_id', userId),
    supabase.from('expenses').select('id, project_id, status').eq('user_id', userId).neq('status', 'archive'),
    supabase.from('emails').select('id, category, status').eq('user_id', userId),
  ])

  const quotes = quotesRes.data || []
  const invoices = invoicesRes.data || []
  const projects = projectsRes.data || []
  const expenses = expensesRes.data || []
  const emails = emailsRes.data || []
  const projectsWithQuote = new Set(quotes.map(q => q.project_id).filter(Boolean))
  const projectsWithInvoice = new Set(invoices.map(i => i.project_id).filter(Boolean))

  const out: Suggestion[] = []

  // Devis accepté sans chantier → créer le chantier
  for (const q of quotes.filter(q => (q.status === 'accepte' || q.status === 'transforme') && !q.project_id)) {
    const name = clientDisplayName(q.clients as unknown as ClientLite)
    out.push({ id: `chantier-${q.id}`, icon: HardHat, tile: 'bg-blue-100 text-blue-600',
      title: `Devis accepté — créer le chantier`, detail: `${q.quote_number} · ${name}`,
      actionLabel: 'Créer le chantier', href: `/chantiers/nouveau${q.client_id ? `?client=${q.client_id}` : ''}` })
  }
  // Devis envoyé depuis >7j non relancé récemment → relancer
  const aRelancer = quotes.filter(q => q.status === 'envoye' && daysSince(q.issue_date) >= 7 && (!q.reminded_at || daysSince(q.reminded_at) >= 7))
  if (aRelancer.length) out.push({ id: 'relances', icon: BellRing, tile: 'bg-accent text-primary',
    title: `${aRelancer.length} devis à relancer`, detail: 'Envoyés depuis plus de 7 jours, sans réponse',
    actionLabel: 'Voir les relances', href: '/relances' })

  // Chantier actif sans devis → créer un devis
  for (const p of projects.filter(p => !CLOSED.includes(p.status) && !projectsWithQuote.has(p.id))) {
    out.push({ id: `devis-${p.id}`, icon: FileText, tile: 'bg-violet-100 text-violet-600',
      title: 'Chantier sans devis', detail: p.title,
      actionLabel: 'Créer un devis', href: `/devis/nouveau?project=${p.id}${p.client_id ? `&client=${p.client_id}` : ''}` })
  }
  // Chantier terminé/à facturer sans facture → créer la facture
  for (const p of projects.filter(p => (p.status === 'termine' || p.status === 'a_facturer') && !projectsWithInvoice.has(p.id))) {
    out.push({ id: `facture-${p.id}`, icon: Receipt, tile: 'bg-emerald-100 text-emerald-600',
      title: 'Chantier terminé — à facturer', detail: p.title,
      actionLabel: 'Créer la facture', href: `/factures/nouveau?project=${p.id}` })
  }
  // Dépenses sans chantier → rattacher
  const expSansChantier = expenses.filter(e => !e.project_id)
  if (expSansChantier.length) out.push({ id: 'exp-orphelines', icon: ReceiptText, tile: 'bg-rose-100 text-rose-600',
    title: `${expSansChantier.length} dépense(s) sans chantier`, detail: 'À rattacher pour un suivi de marge fiable',
    actionLabel: 'Rattacher', href: '/depenses' })

  // Factures échues → vérifier le paiement
  const echues = invoices.filter(i => i.status === 'envoyee' && i.due_date && i.due_date < today)
  if (echues.length) out.push({ id: 'paiements', icon: Landmark, tile: 'bg-amber-100 text-amber-600',
    title: `${echues.length} facture(s) échue(s)`, detail: 'Vérifie les encaissements via le rapprochement bancaire',
    actionLabel: 'Rapprocher', href: '/banque' })

  // Emails demande de devis non traités
  const demandes = emails.filter(e => e.category === 'demande_devis' && e.status !== 'traite' && e.status !== 'archive')
  if (demandes.length) out.push({ id: 'emails', icon: Mail, tile: 'bg-blue-100 text-blue-600',
    title: `${demandes.length} demande(s) de devis par email`, detail: 'À transformer en client / devis',
    actionLabel: 'Traiter les emails', href: '/emails' })

  return out
}

export default async function AutomatisationsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const suggestions = await getSuggestions(user.id)

  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <h1 className="text-2xl md:text-[28px] font-heading font-bold text-marine flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-primary" /> Automatisations
        </h1>
        <p className="text-gray-500 mt-1 text-sm">BatiPilot détecte la prochaine action à faire à chaque étape. Tu valides d&apos;un clic — rien ne part sans toi.</p>
      </div>

      <AutomationRules />

      <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Actions détectées à traiter</h2>
      {suggestions.length === 0 ? (
        <Card className="border border-gray-200/80 bg-white">
          <CardContent className="p-10 text-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
            <p className="text-sm text-gray-500">Tout est à jour — aucune action en attente. 🎉</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 animate-fade-up">
          {suggestions.map(s => (
            <Card key={s.id} className="card-interactive border border-gray-200/80 bg-white">
              <CardContent className="p-4 flex items-center gap-3">
                <span className={`grid place-items-center w-10 h-10 rounded-xl flex-shrink-0 ${s.tile}`}><s.icon className="w-5 h-5" /></span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-marine">{s.title}</div>
                  <div className="text-xs text-gray-500 truncate">{s.detail}</div>
                </div>
                <Link href={s.href}>
                  <span className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-[#e85f00] transition-colors whitespace-nowrap">
                    {s.actionLabel} <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
