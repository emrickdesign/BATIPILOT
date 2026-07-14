'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Phone, Mail, Building2, User, FileText, Calendar, Send, Receipt, RotateCcw } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { isProspect } from '@/lib/clients'
import DndKanban from '@/components/kanban/DndKanban'
import { PROSPECT_COLUMNS, type ProspectCardData } from './kanban-config'
import type { ClientStatus } from '@/types'

const dotOf = (col: string) => PROSPECT_COLUMNS.find(c => c.key === col)?.dot || '#94918A'

// CTA principal adapté à la colonne où se trouve la carte.
function ctaFor(p: ProspectCardData): { label: string; href: string; Icon: typeof FileText; external: boolean } {
  const devis = { label: 'Créer un devis', href: `/devis/nouveau?client=${p.id}`, Icon: FileText, external: false }
  switch (p.col) {
    case 'devis_envoye': {
      const href = p.waHref || (p.email ? `mailto:${p.email}` : p.phone ? `tel:${p.phone}` : `/clients/${p.id}`)
      return { label: 'Relancer le client', href, Icon: Send, external: !!p.waHref }
    }
    case 'devis_accepte':
      return { label: 'Créer la facture', href: `/factures/nouveau?client=${p.id}`, Icon: Receipt, external: false }
    case 'devis_refuse':
      return { label: 'Nouveau devis', href: `/devis/nouveau?client=${p.id}`, Icon: RotateCcw, external: false }
    default:
      return devis
  }
}

export default function ProspectsKanban({ initialItems }: { initialItems: ProspectCardData[] }) {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const [items, setItems] = useState<ProspectCardData[]>(initialItems)

  // Resynchronise avec le serveur après router.refresh() (pattern React, sans effet).
  const [syncedFrom, setSyncedFrom] = useState(initialItems)
  if (syncedFrom !== initialItems) {
    setSyncedFrom(initialItems)
    setItems(initialItems)
  }

  // Temps réel : le board se met à jour tout seul quand un client ou un devis change
  // ailleurs dans l'app (création de devis, envoi, acceptation…).
  useEffect(() => {
    let active = true
    let channel: ReturnType<typeof supabase.channel> | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    const bump = () => { clearTimeout(timer); timer = setTimeout(() => router.refresh(), 250) }

    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id
      if (!uid || !active) return
      channel = supabase
        .channel('prospects-board')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'clients', filter: `user_id=eq.${uid}` }, bump)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'quotes', filter: `user_id=eq.${uid}` }, bump)
        .subscribe()
    })

    return () => { active = false; clearTimeout(timer); if (channel) supabase.removeChannel(channel) }
  }, [supabase, router])

  async function move(id: string, toCol: string) {
    const next = toCol as ClientStatus
    const prev = items
    setItems(items.map(i => (i.id === id ? { ...i, col: next, status: next } : i)))
    const { error } = await createClient().from('clients').update({ status: next }).eq('id', id)
    if (error) {
      setItems(prev)
      toast.error('Erreur lors du déplacement')
    } else {
      toast.success(isProspect(next) ? 'Prospect déplacé' : 'Converti en client 🎉')
      router.refresh()
    }
  }

  return (
    <DndKanban
      columns={PROSPECT_COLUMNS}
      items={items}
      onMove={move}
      footer={<p className="text-[11px] text-gray-400 mt-3">Glissez une carte d&apos;une colonne à l&apos;autre pour changer son statut. Accepté = conversion en client.</p>}
      renderCard={(p) => {
        const dot = dotOf(p.col)
        return (
          <Card className="border-0 shadow-[var(--shadow-sm)] overflow-hidden cursor-grab active:cursor-grabbing" style={{ backgroundColor: `${dot}0A` }}>
            <div className="h-[3px]" style={{ backgroundColor: dot }} />
            <CardContent className="p-4 pt-3.5">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <Link href={`/clients/${p.id}`} className="font-semibold text-[15px] text-gray-900 hover:text-primary truncate block leading-tight">
                    {p.name}
                  </Link>
                  <div className="mt-1.5 space-y-1 text-xs text-gray-500">
                    {p.phone && <a href={`tel:${p.phone}`} onClick={e => e.stopPropagation()} className="flex items-center gap-1.5 truncate hover:text-primary hover:underline"><Phone className="w-3 h-3 flex-shrink-0 text-gray-400" />{p.phone}</a>}
                    {p.email && <a href={`mailto:${p.email}`} onClick={e => e.stopPropagation()} className="flex items-center gap-1.5 truncate hover:text-primary hover:underline"><Mail className="w-3 h-3 flex-shrink-0 text-gray-400" />{p.email}</a>}
                  </div>
                </div>
                <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center flex-shrink-0" style={{ boxShadow: `0 0 0 2px ${dot}55` }}>
                  {p.isPro ? <Building2 className="w-[18px] h-[18px]" style={{ color: dot }} /> : <User className="w-[18px] h-[18px]" style={{ color: dot }} />}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 min-h-[22px]">
                {p.pot > 0 && (
                  <span className="inline-flex items-center min-w-0 max-w-full text-xs font-semibold text-[#3F7A2E] bg-[#E9F2DB] rounded-md px-2 py-1">
                    <span className="truncate">{formatCurrency(p.pot)}</span>
                  </span>
                )}
                <span className="flex items-center gap-1 text-[11px] text-gray-400 flex-shrink-0 ml-auto whitespace-nowrap">
                  <Calendar className="w-3 h-3 flex-shrink-0" />{new Date(p.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                </span>
              </div>

              {(() => {
                const cta = ctaFor(p)
                return (
                  <a
                    href={cta.href}
                    onClick={e => e.stopPropagation()}
                    {...(cta.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                    className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-center gap-2 text-[13px] font-semibold hover:opacity-80 transition-opacity"
                    style={{ color: dot }}
                  >
                    <span className="grid place-items-center w-7 h-7 rounded-full" style={{ backgroundColor: `${dot}1A` }}>
                      <cta.Icon className="w-4 h-4" />
                    </span>
                    {cta.label}
                  </a>
                )
              })()}
            </CardContent>
          </Card>
        )
      }}
    />
  )
}
