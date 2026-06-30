import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Plus, Receipt, Send, Coins, AlertTriangle, Banknote, HardHat } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { clientDisplayName } from '@/lib/clients'

const num = (v: unknown) => Number(v) || 0
const today = new Date().toISOString().split('T')[0]

type Disp = 'brouillon' | 'envoyee' | 'payee_partiellement' | 'payee' | 'en_retard' | 'annulee'

const statusLabels: Record<Disp, string> = {
  brouillon: 'À préparer', envoyee: 'Envoyée', payee_partiellement: 'Paiement partiel',
  payee: 'Payée', en_retard: 'En retard', annulee: 'Annulée',
}
const statusColors: Record<Disp, string> = {
  brouillon: 'bg-gray-100 text-gray-700', envoyee: 'bg-blue-100 text-blue-700',
  payee_partiellement: 'bg-yellow-100 text-yellow-700', payee: 'bg-green-100 text-green-700',
  en_retard: 'bg-red-100 text-red-700', annulee: 'bg-gray-100 text-gray-400',
}

const FILTERS: { key: string; label: string }[] = [
  { key: 'tous', label: 'Toutes' },
  { key: 'brouillon', label: 'À préparer' },
  { key: 'envoyee', label: 'Envoyées' },
  { key: 'en_retard', label: 'En retard' },
  { key: 'payee', label: 'Payées' },
  { key: 'annulee', label: 'Annulées' },
]

function displayStatus(inv: { status: string; due_date?: string | null }): Disp {
  if ((inv.status === 'envoyee' || inv.status === 'payee_partiellement') && inv.due_date && inv.due_date < today) return 'en_retard'
  return inv.status as Disp
}
function matchesFilter(disp: Disp, filter: string): boolean {
  if (filter === 'tous') return true
  if (filter === 'payee') return disp === 'payee' || disp === 'payee_partiellement'
  return disp === filter
}

export default async function FacturesPage({ searchParams }: { searchParams: Promise<{ statut?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const sp = await searchParams
  const filter = FILTERS.some(f => f.key === sp.statut) ? sp.statut! : 'tous'

  const [{ data: invoices }, { data: projects }] = await Promise.all([
    supabase.from('invoices').select('*, clients(first_name, last_name, company_name, type)').eq('user_id', user.id).order('created_at', { ascending: false }),
    supabase.from('projects').select('id, title').eq('user_id', user.id),
  ])

  const all = invoices || []
  const projTitle = new Map((projects || []).map(p => [p.id, p.title]))

  // Cartes (§8.2)
  const notCancelled = all.filter(i => i.status !== 'annulee')
  const factEnvoyees = notCancelled.filter(i => i.status !== 'brouillon').reduce((s, i) => s + num(i.total_ttc), 0)
  const encaisse = notCancelled.reduce((s, i) => s + (num(i.total_ttc) - num(i.amount_due)), 0)
  const open = all.filter(i => ['envoyee', 'payee_partiellement', 'en_retard'].includes(i.status))
  const reste = open.reduce((s, i) => s + (num(i.amount_due) || num(i.total_ttc)), 0)
  const enRetard = all.filter(i => displayStatus(i) === 'en_retard')
  const retardMontant = enRetard.reduce((s, i) => s + (num(i.amount_due) || num(i.total_ttc)), 0)

  const cards = [
    { label: 'Factures envoyées', value: formatCurrency(factEnvoyees), icon: Send, tile: 'bg-blue-100 text-blue-600' },
    { label: 'Encaissé', value: formatCurrency(encaisse), icon: Banknote, tile: 'bg-emerald-100 text-emerald-600' },
    { label: 'Reste à encaisser', value: formatCurrency(reste), icon: Coins, tile: 'bg-amber-100 text-amber-600' },
    { label: 'En retard', value: formatCurrency(retardMontant), icon: AlertTriangle, tile: 'bg-rose-100 text-rose-600', sub: `${enRetard.length} facture${enRetard.length > 1 ? 's' : ''}` },
  ]

  const countFor = (key: string) => all.filter(i => matchesFilter(displayStatus(i), key)).length
  const list = all.filter(i => matchesFilter(displayStatus(i), filter))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Mes factures</h1>
        <Link href="/factures/nouveau">
          <Button className="h-10 gap-2"><Plus className="w-4 h-4" /> Créer une facture</Button>
        </Link>
      </div>

      {/* Cartes (§8.2) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map(c => (
          <Card key={c.label} className="border border-gray-200/80 bg-white">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 font-medium">{c.label}</span>
                <span className={`grid place-items-center w-8 h-8 rounded-lg ${c.tile}`}><c.icon className="w-4 h-4" /></span>
              </div>
              <div className="text-[22px] font-bold text-marine mt-2 leading-none">{c.value}</div>
              {c.sub && <div className="text-xs text-gray-400 mt-1">{c.sub}</div>}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filtres (§8.1) */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {FILTERS.map(f => {
          const n = countFor(f.key)
          const active = filter === f.key
          return (
            <Link
              key={f.key}
              href={f.key === 'tous' ? '/factures' : `/factures?statut=${f.key}`}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                active ? 'bg-primary text-primary-foreground shadow-[var(--shadow-brand)]' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f.label}{n > 0 && <span className={`ml-1.5 ${active ? 'text-white/80' : 'text-gray-400'}`}>{n}</span>}
            </Link>
          )
        })}
      </div>

      {!list.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Receipt className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="font-medium text-gray-700">{filter === 'tous' ? 'Aucune facture pour l\'instant' : 'Aucune facture dans ce filtre'}</p>
            {filter === 'tous' && <p className="text-sm text-gray-500 mt-1 mb-4">Transformez un devis accepté en facture, ou créez-en une directement</p>}
            {filter === 'tous' && <Link href="/factures/nouveau"><Button>Créer une facture</Button></Link>}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {list.map(inv => {
            const disp = displayStatus(inv)
            const clientName = inv.clients ? clientDisplayName(inv.clients) : 'Sans client'
            const chantier = inv.project_id ? projTitle.get(inv.project_id) : null
            const overdue = disp === 'en_retard'
            return (
              <Link key={inv.id} href={`/factures/${inv.id}`}>
                <Card className="card-interactive border border-gray-200/80">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs text-gray-400">{inv.invoice_number}</span>
                          <Badge className={`${statusColors[disp]} border-0 text-xs`}>{statusLabels[disp]}</Badge>
                        </div>
                        <p className="font-semibold text-gray-900 mt-1 truncate">{clientName}</p>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400 flex-wrap">
                          <span>{formatDate(inv.issue_date)}</span>
                          {inv.due_date && <span className={overdue ? 'text-rose-600 font-medium' : ''}>Échéance {formatDate(inv.due_date)}</span>}
                          {chantier && <span className="flex items-center gap-1"><HardHat className="w-3 h-3" />{chantier}</span>}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-bold text-gray-900 tabular-nums">{formatCurrency(inv.total_ttc)}</p>
                        <p className="text-xs text-gray-400">{num(inv.amount_due) > 0 ? `Reste ${formatCurrency(inv.amount_due)}` : 'Soldée'}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
