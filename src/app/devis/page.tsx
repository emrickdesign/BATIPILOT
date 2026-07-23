import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, FileText, Clock, CheckCircle2, Percent } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { clientDisplayName } from '@/lib/clients'
import StatCard from '@/components/charts/StatCard'
import DevisKanban from './DevisKanban'
import { devisCol, type DevisCardData } from './kanban-config'

const num = (v: unknown) => Number(v) || 0
const DAY = 86_400_000
const daysSince = (d?: string | null) => (d ? Math.floor((Date.now() - new Date(d).getTime()) / DAY) : 0)

type Disp = 'brouillon' | 'pret' | 'envoye' | 'relance' | 'accepte' | 'refuse' | 'expire' | 'transforme'

const today = new Date().toISOString().split('T')[0]

function displayStatus(q: { status: string; valid_until?: string | null; reminded_at?: string | null }): Disp {
  if (q.status === 'envoye') {
    if (q.valid_until && q.valid_until < today) return 'expire'
    if (q.reminded_at) return 'relance'
  }
  return q.status as Disp
}

// Badge d'état dérivé affiché sur la carte Kanban (relancé / expiré / facturé).
function badgeFor(disp: Disp): { label: string; cls: string } | null {
  switch (disp) {
    case 'relance': return { label: 'Relancé', cls: 'bg-[#FBEED6] text-[#8A5A08]' }
    case 'expire': return { label: 'Expiré', cls: 'bg-[#FBE0DA] text-[#C0392B]' }
    case 'transforme': return { label: 'Facturé', cls: 'bg-[#E3ECFB] text-[#1F5FAE]' }
    default: return null
  }
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

export default async function DevisPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: quotes }, { data: projects }] = await Promise.all([
    supabase.from('quotes').select('*, clients(first_name, last_name, company_name, type)').eq('user_id', user.id).order('created_at', { ascending: false }),
    supabase.from('projects').select('id, title').eq('user_id', user.id),
  ])

  const all = quotes || []

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

      {!all.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="font-medium text-gray-700">Aucun devis pour l&apos;instant</p>
            <p className="text-sm text-gray-500 mt-1 mb-4">Créez votre premier devis</p>
            <Link href="/devis/nouveau"><Button>Créer un devis</Button></Link>
          </CardContent>
        </Card>
      ) : (
        <DevisKanban initialItems={all.map((quote): DevisCardData => {
          const disp = displayStatus(quote)
          return {
            id: quote.id,
            col: devisCol(quote.status),
            number: quote.quote_number,
            clientName: quote.clients ? clientDisplayName(quote.clients) : 'Sans client',
            title: quote.title || null,
            amountFmt: formatCurrency(quote.total_ttc),
            dateFmt: formatDate(quote.issue_date),
            badge: badgeFor(disp),
            cta: nextAction(quote),
          }
        })} />
      )}
    </div>
  )
}
