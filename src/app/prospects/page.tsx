import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, UserPlus } from 'lucide-react'
import type { Client, ClientStatus } from '@/types'
import { clientDisplayName } from '@/lib/clients'
import { STAT_TONES } from '@/components/charts/StatCard'
import ProspectsKanban from './ProspectsKanban'
import { PROSPECT_COLUMNS, type ProspectCardData } from './kanban-config'

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

  const [{ data: prospects }, { data: quotes }, { data: visites }] = await Promise.all([
    supabase.from('clients').select('*').eq('user_id', user.id).in('status', BOARD_STATUSES).order('created_at', { ascending: false }),
    supabase.from('quotes').select('id, client_id, quote_number, total_ttc, status, issue_date, valid_until').eq('user_id', user.id),
    // Visites de repérage validées, pas encore rattachées à un chantier → indicateur sur la carte prospect
    supabase.from('site_visits').select('id, client_id').eq('user_id', user.id).eq('status', 'valide').is('project_id', null).order('created_at', { ascending: false }),
  ])

  const list = (prospects as Client[]) || []

  const visitByClient = new Map<string, string>()
  for (const v of visites || []) { if (v.client_id && !visitByClient.has(v.client_id)) visitByClient.set(v.client_id, v.id) }

  // Montant + nombre de devis par client (total de TOUS ses devis), et le devis « envoyé »
  // le plus récent → cible de la relance depuis la carte.
  const quoteAgg = new Map<string, { total: number; count: number }>()
  const primaryQuote = new Map<string, { id: string; number: string; issueDate: string | null; validUntil: string | null; status: string }>()
  const score = (s?: string) => (s === 'envoye' ? 2 : 1) // devis envoyé prioritaire pour la relance
  for (const q of quotes || []) {
    if (!q.client_id) continue
    const a = quoteAgg.get(q.client_id) || { total: 0, count: 0 }
    a.total += num(q.total_ttc); a.count += 1
    quoteAgg.set(q.client_id, a)
    // Devis « relançable » = le plus récent NON refusé (en privilégiant le statut envoyé),
    // pour que le bouton Relancer ouvre toujours le popup même si le statut n'est pas pile "envoye".
    if (q.status !== 'refuse') {
      const cur = primaryQuote.get(q.client_id)
      const qs = score(q.status), cs = cur ? score(cur.status) : 0
      if (!cur || qs > cs || (qs === cs && (q.issue_date || '') > (cur.issueDate || ''))) {
        primaryQuote.set(q.client_id, { id: q.id, number: q.quote_number, issueDate: q.issue_date, validUntil: q.valid_until, status: q.status })
      }
    }
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
      quoteTotal: quoteAgg.get(p.id)?.total || 0,
      quoteCount: quoteAgg.get(p.id)?.count || 0,
      relanceQuote: primaryQuote.get(p.id) || null,
      visitId: visitByClient.get(p.id) || null,
      createdAt: p.created_at,
    }]
  })

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 animate-fade-up">
        <div>
          <h1 className="text-2xl md:text-[26px] font-bold font-heading text-marine">Suivi des prospects</h1>
          <p className="text-gray-500 mt-1 text-sm">Suivi automatique de vos pistes, du premier contact au devis accepté. Les actions (devis, relance, facture) se font depuis la section Devis.</p>
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
          {/* §5.1 Résumé pipeline — tuiles KPI pleine couleur (une par statut) */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 animate-fade-up">
            {PROSPECT_COLUMNS.map(c => {
              const t = STAT_TONES[c.tone]
              return (
                <div
                  key={c.key}
                  className="relative overflow-hidden rounded-xl p-4 text-white transition-all duration-200 hover:-translate-y-0.5"
                  style={{ background: `linear-gradient(140deg, ${t.base} 0%, ${t.deep} 100%)`, boxShadow: `0 16px 34px -16px ${t.glow}` }}
                >
                  <div aria-hidden className="absolute -top-10 -right-8 w-28 h-28 rounded-full pointer-events-none"
                    style={{ background: 'radial-gradient(circle, rgba(255,255,255,.20), transparent 70%)' }} />
                  <div className="relative">
                    <div className="text-[28px] font-bold leading-none tabular-nums">{countCol(c)}</div>
                    <div className="text-[13px] text-white/90 mt-1.5 font-medium">{c.label}</div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* §5.2 Vue Kanban — glisser-déposer, grille responsive (s'adapte au repli de la sidebar) */}
          <div className="animate-fade-up">
            <ProspectsKanban initialItems={kanbanItems} />
          </div>
        </>
      )}
    </div>
  )
}
