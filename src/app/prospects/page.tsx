import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { FluidTexture } from '@/components/ui/fluid-texture'
import { Plus, UserPlus, Phone, Mail, Building2, User, MessageCircle, FileText, Calendar } from 'lucide-react'
import type { Client, ClientStatus } from '@/types'
import { clientDisplayName } from '@/lib/clients'
import ClientStatusSelect from './ClientStatusSelect'
import { formatCurrency } from '@/lib/utils'

const PIPELINE_BLUE = '#D0562F'

const num = (v: unknown) => Number(v) || 0

// Statuts chargés sur le board (infos_a_recuperer est regroupé dans "Nouveau")
const BOARD_STATUSES: ClientStatus[] = ['nouveau', 'infos_a_recuperer', 'devis_a_faire', 'devis_envoye', 'devis_accepte', 'devis_refuse']

// Colonnes du Kanban (doc §5.2) — la carte/colonne "Infos à récupérer" est supprimée,
// "Accepté" est un état de transition (Prospect → Client → Chantier à planifier).
const COLUMNS: { key: ClientStatus; label: string; extra?: ClientStatus[]; dot: string }[] = [
  { key: 'nouveau', label: 'Nouveau', extra: ['infos_a_recuperer'], dot: '#94918A' },
  { key: 'devis_a_faire', label: 'Devis à faire', dot: '#C77D0E' },
  { key: 'devis_envoye', label: 'Devis envoyé', dot: '#E0674C' },
  { key: 'devis_accepte', label: 'Accepté', dot: '#3F7A2E' },
  { key: 'devis_refuse', label: 'Refusé', dot: '#C0392B' },
]

function waLink(phone?: string | null) {
  if (!phone) return null
  let p = phone.replace(/\D/g, '')
  if (p.startsWith('0')) p = '33' + p.slice(1)
  return p.length >= 8 ? `https://wa.me/${p}` : null
}

function ActionBtn({ href, label, children, external }: { href: string; label: string; children: React.ReactNode; external?: boolean }) {
  return (
    <a
      href={href}
      title={label}
      aria-label={label}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className="grid place-items-center w-8 h-8 rounded-lg bg-gray-50 text-gray-500 hover:bg-accent hover:text-primary transition-colors"
    >
      {children}
    </a>
  )
}

function ProspectCard({ p, pot, dot }: { p: Client; pot: number; dot: string }) {
  const wa = waLink(p.phone)
  return (
    <Card className="card-interactive border-0 shadow-[var(--shadow-sm)] overflow-hidden" style={{ backgroundColor: `${dot}0A` }}>
      <div className="h-[3px]" style={{ backgroundColor: dot }} />
      <CardContent className="p-4 pt-3.5">
        <div className="flex items-start gap-3">
          <div className="relative flex-shrink-0">
            <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center" style={{ boxShadow: `0 0 0 2px ${dot}55` }}>
              {p.type === 'professionnel' ? <Building2 className="w-[18px] h-[18px]" style={{ color: dot }} /> : <User className="w-[18px] h-[18px]" style={{ color: dot }} />}
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <Link href={`/clients/${p.id}`} className="font-semibold text-[15px] text-gray-900 hover:text-primary truncate block leading-tight">
              {clientDisplayName(p)}
            </Link>
            <div className="mt-1.5 space-y-1 text-xs text-gray-500">
              {p.phone && <div className="flex items-center gap-1.5 truncate"><Phone className="w-3 h-3 flex-shrink-0 text-gray-400" />{p.phone}</div>}
              {p.email && <div className="flex items-center gap-1.5 truncate"><Mail className="w-3 h-3 flex-shrink-0 text-gray-400" />{p.email}</div>}
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2 min-h-[22px]">
          {pot > 0 ? (
            <span className="inline-flex items-center text-xs font-semibold text-[#3F7A2E] bg-[#E9F2DB] rounded-md px-2 py-1">
              {formatCurrency(pot)}<span className="font-normal text-[#3F7A2E]/70 ml-1">potentiel</span>
            </span>
          ) : <span />}
          <span className="flex items-center gap-1 text-[11px] text-gray-400 flex-shrink-0">
            <Calendar className="w-3 h-3" />{new Date(p.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
          </span>
        </div>

        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-1.5">
          {p.phone && <ActionBtn href={`tel:${p.phone}`} label="Appeler"><Phone className="w-3.5 h-3.5" /></ActionBtn>}
          {wa && <ActionBtn href={wa} label="WhatsApp" external><MessageCircle className="w-3.5 h-3.5" /></ActionBtn>}
          {p.email && <ActionBtn href={`mailto:${p.email}`} label="Envoyer un email"><Mail className="w-3.5 h-3.5" /></ActionBtn>}
          <ActionBtn href={`/devis/nouveau?client=${p.id}`} label="Créer un devis"><FileText className="w-3.5 h-3.5" /></ActionBtn>
        </div>

        <div className="mt-3">
          <ClientStatusSelect clientId={p.id} current={p.status} />
        </div>
      </CardContent>
    </Card>
  )
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

  const inColumn = (p: Client, c: typeof COLUMNS[number]) => p.status === c.key || (c.extra?.includes(p.status) ?? false)
  const countCol = (c: typeof COLUMNS[number]) => list.filter(p => inColumn(p, c)).length

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
                {COLUMNS.map(c => (
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

          {/* §5.2 Vue Kanban */}
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 animate-fade-up">
            {COLUMNS.map(c => {
              const items = list.filter(p => inColumn(p, c))
              return (
                <div key={c.key} className="flex-shrink-0 w-[260px] flex flex-col">
                  <div className="flex items-center justify-between px-1 mb-2">
                    <span className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.dot }} />
                      {c.label}
                    </span>
                    <span className="text-xs font-medium text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">{items.length}</span>
                  </div>
                  <div className="space-y-2.5 rounded-2xl bg-gray-50/60 p-2 min-h-[80px] flex-1">
                    {items.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-6">—</p>
                    ) : (
                      items.map(p => <ProspectCard key={p.id} p={p} pot={potById.get(p.id) || 0} dot={c.dot} />)
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <p className="text-[11px] text-gray-400">
            Astuce : changez le statut sur une carte pour la déplacer de colonne. Source du prospect, type de demande et prochaine action : champs à ajouter ultérieurement.
          </p>
        </>
      )}
    </div>
  )
}
