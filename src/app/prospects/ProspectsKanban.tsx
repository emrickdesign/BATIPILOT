'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Phone, Mail, Building2, User, MessageCircle, FileText, Calendar } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { isProspect } from '@/lib/clients'
import DndKanban from '@/components/kanban/DndKanban'
import ClientStatusSelect from './ClientStatusSelect'
import { PROSPECT_COLUMNS, type ProspectCardData } from './kanban-config'
import type { ClientStatus } from '@/types'

const dotOf = (col: string) => PROSPECT_COLUMNS.find(c => c.key === col)?.dot || '#94918A'

function ActionBtn({ href, label, children, external }: { href: string; label: string; children: React.ReactNode; external?: boolean }) {
  return (
    <a
      href={href}
      title={label}
      aria-label={label}
      onClick={e => e.stopPropagation()}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className="grid place-items-center w-8 h-8 rounded-lg bg-gray-50 text-gray-500 hover:bg-accent hover:text-primary transition-colors"
    >
      {children}
    </a>
  )
}

export default function ProspectsKanban({ initialItems }: { initialItems: ProspectCardData[] }) {
  const router = useRouter()
  const [items, setItems] = useState<ProspectCardData[]>(initialItems)

  // Resynchronise avec le serveur après router.refresh() (pattern React, sans effet).
  const [syncedFrom, setSyncedFrom] = useState(initialItems)
  if (syncedFrom !== initialItems) {
    setSyncedFrom(initialItems)
    setItems(initialItems)
  }

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
      footer={<p className="text-[11px] text-gray-400 mt-3">Glissez une carte d&apos;une colonne à l&apos;autre, ou utilisez le menu de statut. Accepté = conversion en client.</p>}
      renderCard={(p) => {
        const dot = dotOf(p.col)
        return (
          <Card className="border-0 shadow-[var(--shadow-sm)] overflow-hidden cursor-grab active:cursor-grabbing" style={{ backgroundColor: `${dot}0A` }}>
            <div className="h-[3px]" style={{ backgroundColor: dot }} />
            <CardContent className="p-4 pt-3.5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center flex-shrink-0" style={{ boxShadow: `0 0 0 2px ${dot}55` }}>
                  {p.isPro ? <Building2 className="w-[18px] h-[18px]" style={{ color: dot }} /> : <User className="w-[18px] h-[18px]" style={{ color: dot }} />}
                </div>
                <div className="min-w-0 flex-1">
                  <Link href={`/clients/${p.id}`} className="font-semibold text-[15px] text-gray-900 hover:text-primary truncate block leading-tight">
                    {p.name}
                  </Link>
                  <div className="mt-1.5 space-y-1 text-xs text-gray-500">
                    {p.phone && <div className="flex items-center gap-1.5 truncate"><Phone className="w-3 h-3 flex-shrink-0 text-gray-400" />{p.phone}</div>}
                    {p.email && <div className="flex items-center gap-1.5 truncate"><Mail className="w-3 h-3 flex-shrink-0 text-gray-400" />{p.email}</div>}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-2 min-h-[22px]">
                {p.pot > 0 ? (
                  <span className="inline-flex items-center text-xs font-semibold text-[#3F7A2E] bg-[#E9F2DB] rounded-md px-2 py-1">
                    {formatCurrency(p.pot)}<span className="font-normal text-[#3F7A2E]/70 ml-1">potentiel</span>
                  </span>
                ) : <span />}
                <span className="flex items-center gap-1 text-[11px] text-gray-400 flex-shrink-0">
                  <Calendar className="w-3 h-3" />{new Date(p.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                </span>
              </div>

              <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-1.5">
                {p.phone && <ActionBtn href={`tel:${p.phone}`} label="Appeler"><Phone className="w-3.5 h-3.5" /></ActionBtn>}
                {p.waHref && <ActionBtn href={p.waHref} label="WhatsApp" external><MessageCircle className="w-3.5 h-3.5" /></ActionBtn>}
                {p.email && <ActionBtn href={`mailto:${p.email}`} label="Envoyer un email"><Mail className="w-3.5 h-3.5" /></ActionBtn>}
                <ActionBtn href={`/devis/nouveau?client=${p.id}`} label="Créer un devis"><FileText className="w-3.5 h-3.5" /></ActionBtn>
              </div>

              <div className="mt-3">
                <ClientStatusSelect clientId={p.id} current={p.status} />
              </div>
            </CardContent>
          </Card>
        )
      }}
    />
  )
}
