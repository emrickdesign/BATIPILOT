'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Building2, User, MapPin, HardHat, Phone, CalendarClock, Receipt, Send, CheckCircle2 } from 'lucide-react'
import DndKanban from '@/components/kanban/DndKanban'
import { CLIENT_COLUMNS, type ClientCard } from './kanban-config'
import type { ClientStatus } from '@/types'

const dotOf = (col: string) => CLIENT_COLUMNS.find(c => c.key === col)?.dot || '#94918A'

// CTA principal adapté à la colonne (phase) où se trouve la carte.
function ctaFor(c: ClientCard): { label: string; href: string; Icon: typeof Receipt; external: boolean } {
  switch (c.col) {
    case 'chantier_a_planifier':
      return { label: 'Planifier le chantier', href: `/chantiers/nouveau?client=${c.id}`, Icon: CalendarClock, external: false }
    case 'chantier_en_cours':
      return { label: 'Créer une facture', href: `/factures/nouveau?client=${c.id}`, Icon: Receipt, external: false }
    case 'facture_a_envoyer':
      return { label: 'Créer une facture', href: `/factures/nouveau?client=${c.id}`, Icon: Receipt, external: false }
    case 'facture_envoyee': {
      const href = c.waHref || (c.email ? `mailto:${c.email}` : c.phone ? `tel:${c.phone}` : `/clients/${c.id}`)
      return { label: 'Relancer le paiement', href, Icon: Send, external: !!c.waHref }
    }
    default: // paye / termine
      return { label: 'Voir la fiche client', href: `/clients/${c.id}`, Icon: CheckCircle2, external: false }
  }
}

export default function ClientsKanban({ initialItems }: { initialItems: ClientCard[] }) {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const [items, setItems] = useState<ClientCard[]>(initialItems)

  // Le serveur reste la source de vérité : après un router.refresh(), la prop change de
  // référence → on resynchronise pendant le rendu (pattern React, pas d'effet).
  const [syncedFrom, setSyncedFrom] = useState(initialItems)
  if (syncedFrom !== initialItems) {
    setSyncedFrom(initialItems)
    setItems(initialItems)
  }

  // Temps réel : le board se met à jour tout seul quand un client, une facture ou un
  // chantier change ailleurs dans l'app (facture envoyée/payée, statut chantier…).
  useEffect(() => {
    let active = true
    let channel: ReturnType<typeof supabase.channel> | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    const bump = () => { clearTimeout(timer); timer = setTimeout(() => router.refresh(), 250) }

    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id
      if (!uid || !active) return
      channel = supabase
        .channel('clients-board')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'clients', filter: `user_id=eq.${uid}` }, bump)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices', filter: `user_id=eq.${uid}` }, bump)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'projects', filter: `user_id=eq.${uid}` }, bump)
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
        const cta = ctaFor(c)
        return (
          <Card className="border-0 shadow-[var(--shadow-sm)] overflow-hidden cursor-grab active:cursor-grabbing bg-white">
            <div className="h-[3px]" style={{ backgroundColor: dot }} />
            <CardContent className="p-4 pt-3.5">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <Link href={`/clients/${c.id}`} className="font-semibold text-[15px] text-gray-900 hover:text-primary truncate block leading-tight">
                    {c.name}
                  </Link>
                  <div className="mt-1.5 space-y-1 text-xs text-gray-500">
                    {c.ville && <div className="flex items-center gap-1.5 truncate"><MapPin className="w-3 h-3 flex-shrink-0 text-gray-400" />{c.ville}</div>}
                    {c.phone && <a href={`tel:${c.phone}`} onClick={e => e.stopPropagation()} className="flex items-center gap-1.5 truncate hover:text-primary hover:underline"><Phone className="w-3 h-3 flex-shrink-0 text-gray-400" />{c.phone}</a>}
                  </div>
                </div>
                <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center flex-shrink-0" style={{ boxShadow: `0 0 0 2px ${dot}55` }}>
                  {c.isPro ? <Building2 className="w-[18px] h-[18px]" style={{ color: dot }} /> : <User className="w-[18px] h-[18px]" style={{ color: dot }} />}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs min-h-[20px]">
                <span className="text-gray-500 whitespace-nowrap">Facturé <b className="text-marine tabular-nums">{c.facture}</b></span>
                {c.reste && <span className="text-[#8A5A08] font-medium tabular-nums whitespace-nowrap ml-auto">Reste {c.reste}</span>}
              </div>

              <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-gray-400 min-w-0">
                <span className="flex items-center gap-1 flex-shrink-0"><HardHat className="w-3 h-3" />{c.chantiers}</span>
                <span className="text-gray-300 flex-shrink-0">·</span>
                <span className="truncate">{c.contact}</span>
              </div>

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
            </CardContent>
          </Card>
        )
      }}
    />
  )
}
