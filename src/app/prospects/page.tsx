import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { FluidTexture } from '@/components/ui/fluid-texture'
import { Plus, UserPlus } from 'lucide-react'
import type { Client, ClientStatus } from '@/types'
import { clientDisplayName } from '@/lib/clients'
import ProspectsKanban from './ProspectsKanban'
import { PROSPECT_COLUMNS, type ProspectCardData } from './kanban-config'

const PIPELINE_BLUE = '#D0562F'

const num = (v: unknown) => Number(v) || 0

// Statuts chargés sur le board (infos_a_recuperer est regroupé dans "Nouveau")
const BOARD_STATUSES: ClientStatus[] = ['nouveau', 'infos_a_recuperer', 'devis_a_faire', 'devis_envoye', 'devis_accepte', 'devis_refuse']

function waLink(phone?: string | null) {
  if (!phone) return null
  let p = phone.replace(/\D/g, '')
  if (p.startsWith('0')) p = '33' + p.slice(1)
  return p.length >= 8 ? `https://wa.me/${p}` : null
}

export default async function ProspectsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: prospects }, { data: quotes }] = await Promise.all([
    supabase.from('clients').select('*').eq('user_id', user.id).in('status', BOARD_STATUSES).order('created_at', { ascending: false }),
    supabase.from('quotes').select('client_id, total_ttc, status').eq('user_id', user.id),
  ])

  const list = (prospects as Client[]) || []

  // Montant potentiel par prospect = somme de ses devis non refusés
  const potById = new Map<string, number>()
  for (const q of quotes || []) {
    if (!q.client_id || q.status === 'refuse') continue
    potById.set(q.client_id, (potById.get(q.client_id) || 0) + num(q.total_ttc))
  }

  const inColumn = (p: Client, c: typeof PROSPECT_COLUMNS[number]) => p.status === c.key || (c.extra?.includes(p.status) ?? false)
  const countCol = (c: typeof PROSPECT_COLUMNS[number]) => list.filter(p => inColumn(p, c)).length
  const colOf = (status: ClientStatus): ClientStatus | null =>
    PROSPECT_COLUMNS.find(c => c.key === status || (c.extra?.includes(status) ?? false))?.key ?? null

  // Données sérialisables du Kanban prospects
  const kanbanItems: ProspectCardData[] = list.flatMap(p => {
    const col = colOf(p.status)
    if (!col) return []
    return [{
      id: p.id,
      col,
      status: p.status,
      isPro: p.type === 'professionnel',
      name: clientDisplayName(p),
      phone: p.phone ?? null,
      email: p.email ?? null,
      waHref: waLink(p.phone),
      pot: potById.get(p.id) || 0,
      createdAt: p.created_at,
    }]
  })

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 animate-fade-up">
        <div>
          <h1 className="text-2xl md:text-[26px] font-bold font-heading text-marine">Prospects</h1>
          <p className="text-gray-500 mt-1 text-sm">Vos pistes commerciales, du premier contact au devis accepté.</p>
        </div>
        <Link href="/clients/nouveau">
          <Button className="h-10 gap-2 shadow-sm"><Plus className="w-4 h-4" /> Nouveau prospect</Button>
        </Link>
      </div>

      {list.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            <UserPlus className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="font-medium">Aucun prospect pour l&apos;instant</p>
            <p className="text-sm mt-1">Ajoutez une piste, ou elle se créera automatiquement depuis vos demandes.</p>
            <Link href="/clients/nouveau" className="mt-4 inline-block"><Button>Nouveau prospect</Button></Link>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* §5.1 Résumé pipeline */}
          <Card className="relative border-0 overflow-hidden text-white shadow-[var(--shadow-lg)] animate-fade-up" style={{ backgroundColor: PIPELINE_BLUE }}>
            <FluidTexture color={PIPELINE_BLUE} />
            <CardContent className="p-5 relative z-10">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-x-4 gap-y-5">
                {PROSPECT_COLUMNS.map(c => (
                  <div key={c.key}>
                    <div className="flex items-center gap-1.5 text-white/70 text-xs font-medium">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c.dot, boxShadow: '0 0 0 2px rgba(255,255,255,0.25)' }} />
                      {c.label}
                    </div>
                    <div className="text-[28px] font-bold leading-none mt-1.5">{countCol(c)}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* §5.2 Vue Kanban — glisser-déposer, grille responsive (s'adapte au repli de la sidebar) */}
          <div className="animate-fade-up">
            <ProspectsKanban initialItems={kanbanItems} />
          </div>
        </>
      )}
    </div>
  )
}
