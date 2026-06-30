import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Plus, FileText, HardHat, ArrowRight } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { clientDisplayName } from '@/lib/clients'

const DAY = 86_400_000
const daysSince = (d?: string | null) => (d ? Math.floor((Date.now() - new Date(d).getTime()) / DAY) : 0)

type Disp = 'brouillon' | 'pret' | 'envoye' | 'relance' | 'accepte' | 'refuse' | 'expire' | 'transforme'

const statusLabels: Record<Disp, string> = {
  brouillon: 'Brouillon', pret: 'Prêt', envoye: 'Envoyé', relance: 'Relancé',
  accepte: 'Accepté', refuse: 'Refusé', expire: 'Expiré', transforme: 'Facturé',
}
const statusColors: Record<Disp, string> = {
  brouillon: 'bg-gray-100 text-gray-700', pret: 'bg-blue-100 text-blue-700',
  envoye: 'bg-yellow-100 text-yellow-700', relance: 'bg-orange-100 text-orange-700',
  accepte: 'bg-green-100 text-green-700', refuse: 'bg-red-100 text-red-700',
  expire: 'bg-red-50 text-red-500', transforme: 'bg-purple-100 text-purple-700',
}

// Onglets de filtre (doc §7.1)
const FILTERS: { key: string; label: string }[] = [
  { key: 'tous', label: 'Tous' },
  { key: 'brouillon', label: 'Brouillon' },
  { key: 'pret', label: 'Prêt' },
  { key: 'envoye', label: 'Envoyé' },
  { key: 'relance', label: 'Relancé' },
  { key: 'accepte', label: 'Accepté' },
  { key: 'refuse', label: 'Refusé' },
  { key: 'expire', label: 'Expiré' },
]

const today = new Date().toISOString().split('T')[0]

function displayStatus(q: { status: string; valid_until?: string | null; reminded_at?: string | null }): Disp {
  if (q.status === 'envoye') {
    if (q.valid_until && q.valid_until < today) return 'expire'
    if (q.reminded_at) return 'relance'
  }
  return q.status as Disp
}

// L'onglet "Accepté" regroupe aussi les devis transformés en facture.
function matchesFilter(disp: Disp, filter: string): boolean {
  if (filter === 'tous') return true
  if (filter === 'accepte') return disp === 'accepte' || disp === 'transforme'
  return disp === filter
}

function nextAction(q: { status: string; valid_until?: string | null; reminded_at?: string | null; issue_date?: string | null }): string {
  switch (q.status) {
    case 'brouillon': return 'À finaliser et envoyer'
    case 'pret': return 'À envoyer au client'
    case 'envoye':
      if (q.valid_until && q.valid_until < today) return 'Expiré — relancer ou archiver'
      if (q.reminded_at) return 'Relancé — en attente de réponse'
      if (daysSince(q.issue_date) >= 7) return 'Sans réponse — à relancer'
      return 'En attente de réponse'
    case 'accepte': return 'Créer le chantier / la facture'
    case 'transforme': return 'Facturé'
    case 'refuse': return '—'
    case 'expire': return 'Relancer ou archiver'
    default: return ''
  }
}

export default async function DevisPage({ searchParams }: { searchParams: Promise<{ statut?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const sp = await searchParams
  const filter = FILTERS.some(f => f.key === sp.statut) ? sp.statut! : 'tous'

  const [{ data: quotes }, { data: projects }] = await Promise.all([
    supabase.from('quotes').select('*, clients(first_name, last_name, company_name, type)').eq('user_id', user.id).order('created_at', { ascending: false }),
    supabase.from('projects').select('id, title').eq('user_id', user.id),
  ])

  const all = quotes || []
  const projTitle = new Map((projects || []).map(p => [p.id, p.title]))
  const countFor = (key: string) => all.filter(q => matchesFilter(displayStatus(q), key)).length
  const list = all.filter(q => matchesFilter(displayStatus(q), filter))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Mes devis</h1>
        <Link href="/devis/nouveau">
          <Button className="h-10 gap-2"><Plus className="w-4 h-4" /> Créer un devis</Button>
        </Link>
      </div>

      {/* Filtres (§7.1) */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {FILTERS.map(f => {
          const n = countFor(f.key)
          const active = filter === f.key
          return (
            <Link
              key={f.key}
              href={f.key === 'tous' ? '/devis' : `/devis?statut=${f.key}`}
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
            <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="font-medium text-gray-700">{filter === 'tous' ? 'Aucun devis pour l\'instant' : 'Aucun devis dans ce filtre'}</p>
            {filter === 'tous' && <p className="text-sm text-gray-500 mt-1 mb-4">Créez votre premier devis</p>}
            {filter === 'tous' && <Link href="/devis/nouveau"><Button>Créer un devis</Button></Link>}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {list.map(quote => {
            const disp = displayStatus(quote)
            const clientName = quote.clients ? clientDisplayName(quote.clients) : 'Sans client'
            const chantier = quote.project_id ? projTitle.get(quote.project_id) : null
            return (
              <Link key={quote.id} href={`/devis/${quote.id}`}>
                <Card className="card-interactive border border-gray-200/80">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs text-gray-400">{quote.quote_number}</span>
                          <Badge className={`${statusColors[disp]} border-0 text-xs`}>{statusLabels[disp]}</Badge>
                        </div>
                        <p className="font-semibold text-gray-900 mt-1 truncate">
                          {clientName}
                          {quote.title && <span className="font-normal text-gray-500"> — {quote.title}</span>}
                        </p>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400 flex-wrap">
                          <span>{formatDate(quote.issue_date)}</span>
                          {chantier && <span className="flex items-center gap-1"><HardHat className="w-3 h-3" />{chantier}</span>}
                        </div>
                        <div className="flex items-center gap-1 mt-1.5 text-xs text-primary font-medium">
                          <ArrowRight className="w-3 h-3" />{nextAction(quote)}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-bold text-gray-900 tabular-nums">{formatCurrency(quote.total_ttc)}</p>
                        <p className="text-xs text-gray-400">TTC</p>
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
