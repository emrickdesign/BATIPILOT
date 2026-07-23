'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { MapPin, HardHat, Phone, CalendarClock, Receipt, Send, CheckCircle2 } from 'lucide-react'
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
          <Card className="border border-gray-200/70 shadow-[var(--shadow-sm)] cursor-grab active:cursor-grabbing bg-white">
            <CardContent className="p-3.5">
              <Link href={`/clients/${c.id}`} onClick={e => e.stopPropagation()} className="block font-semibold text-[15px] text-gray-900 hover:text-primary truncate leading-snug">
                {c.name}
              </Link>
              <div className="mt-1 space-y-0.5 text-xs text-gray-500">
                {c.ville && <div className="flex items-center gap-1.5 truncate"><MapPin className="w-3 h-3 flex-shrink-0 text-gray-400" />{c.ville}</div>}
                {c.phone && <a href={`tel:${c.phone}`} onClick={e => e.stopPropagation()} className="flex items-center gap-1.5 truncate hover:text-primary"><Phone className="w-3 h-3 flex-shrink-0 text-gray-400" />{c.phone}</a>}
              </div>
              <p className="font-bold text-[17px] text-gray-900 tabular-nums mt-1.5 leading-none">
                {c.facture} <span className="text-[11px] font-normal text-gray-400">facturé</span>
              </p>
              {c.reste && <p className="text-[11px] font-medium text-[#C0392B] mt-0.5">Reste {c.reste}</p>}
              <p className="text-[11px] text-gray-400 mt-1 flex items-center gap-1"><HardHat className="w-3 h-3" />{c.chantiers} chantier{c.chantiers > 1 ? 's' : ''} · {c.contact}</p>
              <a
                href={cta.href}
                onClick={e => e.stopPropagation()}
                {...(cta.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                className="mt-3 flex items-center justify-center gap-1.5 min-h-[34px] px-3 py-1.5 rounded-lg text-[12.5px] font-semibold text-center leading-tight transition-opacity hover:opacity-85"
                style={{ backgroundColor: `${dot}18`, color: dot }}
              >
                <cta.Icon className="w-3.5 h-3.5 flex-shrink-0" /><span>{cta.label}</span>
              </a>
            </CardContent>
          </Card>
        )
      }}
    />
  )
}
