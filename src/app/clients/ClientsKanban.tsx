'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Building2, User, MapPin, HardHat } from 'lucide-react'
import DndKanban from '@/components/kanban/DndKanban'
import { CLIENT_COLUMNS, type ClientCard } from './kanban-config'
import type { ClientStatus } from '@/types'

const dotOf = (col: string) => CLIENT_COLUMNS.find(c => c.key === col)?.dot || '#94918A'

export default function ClientsKanban({ initialItems }: { initialItems: ClientCard[] }) {
  const router = useRouter()
  const [items, setItems] = useState<ClientCard[]>(initialItems)

  // Le serveur reste la source de vérité : après un router.refresh(), la prop change de
  // référence → on resynchronise pendant le rendu (pattern React, pas d'effet).
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
      toast.success('Client déplacé')
      router.refresh()
    }
  }

  return (
    <DndKanban
      columns={CLIENT_COLUMNS}
      items={items}
      onMove={move}
      footer={<p className="text-[11px] text-gray-400 mt-3">Glissez une carte d&apos;une colonne à l&apos;autre pour changer sa phase.</p>}
      renderCard={(c) => {
        const dot = dotOf(c.col)
        return (
          <Card className="border-0 shadow-[var(--shadow-sm)] overflow-hidden cursor-grab active:cursor-grabbing" style={{ backgroundColor: `${dot}0A` }}>
            <div className="h-[3px]" style={{ backgroundColor: dot }} />
            <CardContent className="p-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-white grid place-items-center flex-shrink-0" style={{ boxShadow: `0 0 0 2px ${dot}55` }}>
                  {c.isPro ? <Building2 className="w-4 h-4" style={{ color: dot }} /> : <User className="w-4 h-4" style={{ color: dot }} />}
                </div>
                <div className="min-w-0 flex-1">
                  <Link href={`/clients/${c.id}`} className="font-semibold text-sm text-gray-900 hover:text-primary truncate block leading-tight">
                    {c.name}
                  </Link>
                  {c.ville && <div className="text-[11px] text-gray-400 truncate flex items-center gap-1"><MapPin className="w-3 h-3 flex-shrink-0" />{c.ville}</div>}
                </div>
              </div>

              <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <span className="text-gray-500 whitespace-nowrap">Facturé <b className="text-marine tabular-nums">{c.facture}</b></span>
                {c.reste && <span className="text-[#8A5A08] font-medium tabular-nums whitespace-nowrap ml-auto">Reste {c.reste}</span>}
              </div>

              <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-gray-400 min-w-0">
                <span className="flex items-center gap-1 flex-shrink-0"><HardHat className="w-3 h-3" />{c.chantiers}</span>
                <span className="text-gray-300 flex-shrink-0">·</span>
                <span className="truncate">{c.contact}</span>
              </div>
            </CardContent>
          </Card>
        )
      }}
    />
  )
}
