import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, FileText, Clock, CheckCircle2, Percent } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { clientDisplayName } from '@/lib/clients'
import StatCard from '@/components/charts/StatCard'
import DevisList, { type DevisRow } from './DevisList'

const num = (v: unknown) => Number(v) || 0
const DAY = 86_400_000
const daysSince = (d?: string | null) => (d ? Math.floor((Date.now() - new Date(d).getTime()) / DAY) : 0)

type Disp = 'brouillon' | 'pret' | 'envoye' | 'relance' | 'accepte' | 'refuse' | 'expire' | 'transforme'

const statusLabels: Record<Disp, string> = {
  brouillon: 'Brouillon', pret: 'Prêt', envoye: 'Envoyé', relance: 'Relancé',
  accepte: 'Accepté', refuse: 'Refusé', expire: 'Expiré', transforme: 'Facturé',
}
const statusColors: Record<Disp, string> = {
  brouillon: 'bg-gray-100 text-gray-500', pret: 'bg-[#FCE7DE] text-[#C14E33]',
  envoye: 'bg-[#FBEED6] text-[#8A5A08]', relance: 'bg-[#FBEED6] text-[#8A5A08]',
  accepte: 'bg-[#E9F2DB] text-[#3F7A2E]', refuse: 'bg-[#FBE0DA] text-[#C0392B]',
  expire: 'bg-[#FBE0DA] text-[#C0392B]', transforme: 'bg-[#F3E5D6] text-[#8A4B24]',
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

  // KPI
  const isSigned = (s: string) => s === 'accepte' || s === 'transforme'
  const montantDevise = all.filter(q => q.status !== 'brouillon').reduce((s, q) => s + num(q.total_ttc), 0)
  const montantEnAttente = all.filter(q => q.status === 'envoye').reduce((s, q) => s + num(q.total_ttc), 0)
  const montantSigne = all.filter(q => isSigned(q.status)).reduce((s, q) => s + num(q.total_ttc), 0)
  const nbSignes = all.filter(q => isSigned(q.status)).length
  const nbRefus = all.filter(q => q.status === 'refuse').length
  const taux = (nbSignes + nbRefus) > 0 ? Math.round((nbSignes / (nbSignes + nbRefus)) * 100) : 0

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Mes devis</h1>
        <Link href="/devis/nouveau">
          <Button className="h-10 gap-2"><Plus className="w-4 h-4" /> Créer un devis</Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Montant devisé" value={formatCurrency(montantDevise)} icon={FileText} tone="coral" note="hors brouillons" />
        <StatCard label="En attente" value={formatCurrency(montantEnAttente)} icon={Clock} tone="amber" note="devis envoyés" />
        <StatCard label="Signés" value={formatCurrency(montantSigne)} icon={CheckCircle2} tone="green" note={`${nbSignes} devis`} />
        <StatCard label="Taux d'acceptation" value={`${taux} %`} icon={Percent} tone="blue" gauge={taux} />
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
        <DevisList rows={list.map((quote): DevisRow => {
          const disp = displayStatus(quote)
          return {
            id: quote.id,
            number: quote.quote_number,
            clientName: quote.clients ? clientDisplayName(quote.clients) : 'Sans client',
            title: quote.title || null,
            chantier: quote.project_id ? projTitle.get(quote.project_id) || null : null,
            dateFmt: formatDate(quote.issue_date),
            amountFmt: formatCurrency(quote.total_ttc),
            statusLabel: statusLabels[disp],
            statusColor: statusColors[disp],
            action: nextAction(quote),
            aEnvoyer: disp === 'brouillon' || disp === 'pret',
            aRelancer: disp === 'envoye' && daysSince(quote.issue_date) >= 7,
            expire: disp === 'expire',
            aFacturer: disp === 'accepte',
          }
        })} />
      )}
    </div>
  )
}
