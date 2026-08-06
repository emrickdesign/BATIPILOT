'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Phone, Mail, Camera } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { isProspect } from '@/lib/clients'
import DndKanban from '@/components/kanban/DndKanban'
import { PROSPECT_COLUMNS, type ProspectCardData } from './kanban-config'
import { daysUntilExpiry } from '@/lib/relances'
import type { ClientStatus } from '@/types'

const dotOf = (col: string) => PROSPECT_COLUMNS.find(c => c.key === col)?.dot || '#94918A'

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
      hideHeaders
      footer={<p className="text-[11px] text-gray-400 mt-3">Glissez une carte d&apos;une colonne à l&apos;autre pour changer son statut. Accepté = conversion en client.</p>}
      renderCard={(p) => {
        const dot = dotOf(p.col)
        const daysLeft = p.col === 'devis_envoye' && p.relanceQuote ? daysUntilExpiry(p.relanceQuote.validUntil) : null
        return (
          <Card className="shadow-[var(--shadow-sm)] cursor-grab active:cursor-grabbing border" style={{ backgroundColor: `${dot}0D`, borderColor: `${dot}33` }}>
            <CardContent className="p-3.5">
              <Link href={`/clients/${p.id}`} onClick={e => e.stopPropagation()} className="block font-semibold text-[15px] text-gray-900 hover:text-primary truncate leading-snug">
                {p.name}
              </Link>
              <div className="mt-1 space-y-0.5 text-xs text-gray-500">
                {p.phone && <a href={`tel:${p.phone}`} onClick={e => e.stopPropagation()} className="flex items-center gap-1.5 truncate hover:text-primary"><Phone className="w-3 h-3 flex-shrink-0 text-gray-400" />{p.phone}</a>}
                {p.email && <a href={`mailto:${p.email}`} onClick={e => e.stopPropagation()} className="flex items-center gap-1.5 truncate hover:text-primary"><Mail className="w-3 h-3 flex-shrink-0 text-gray-400" />{p.email}</a>}
              </div>
              {p.quoteTotal > 0 && (
                <p className="font-bold text-[17px] text-gray-900 tabular-nums mt-1.5 leading-none flex items-center gap-1.5">
                  {formatCurrency(p.quoteTotal)}
                  {p.quoteCount > 1
                    ? <span className="text-[10px] font-bold text-primary bg-accent rounded-full px-1.5 py-0.5">{p.quoteCount} devis</span>
                    : <span className="text-[11px] font-normal text-gray-400">devis</span>}
                </p>
              )}
              <p className="text-[11px] text-gray-400 mt-1">{new Date(p.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
              {p.visitId && (
                <Link href={`/visites/${p.visitId}`} onClick={e => e.stopPropagation()}
                  className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-[#3F7A2E] bg-[#F1F6E9] rounded-full px-2 py-0.5 hover:opacity-85">
                  <Camera className="w-3 h-3" /> Visite de repérage
                </Link>
              )}
              {daysLeft != null && (
                <p className={`mt-2 text-[11px] font-semibold ${daysLeft <= 3 ? 'text-[#C0392B]' : 'text-gray-500'}`}>
                  {daysLeft < 0 ? 'Devis expiré' : daysLeft === 0 ? 'Devis : dernier jour de validité' : `Devis valable encore ${daysLeft} j`}
                </p>
              )}
            </CardContent>
          </Card>
        )
      }}
    />
  )
}
