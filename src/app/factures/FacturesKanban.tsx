'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Search, ArrowRight } from 'lucide-react'
import DndKanban from '@/components/kanban/DndKanban'
import { FACTURE_COLUMNS, type FactureCardData } from './kanban-config'

const dotOf = (col: string) => FACTURE_COLUMNS.find(c => c.key === col)?.dot || '#94918A'

export default function FacturesKanban({ initialItems }: { initialItems: FactureCardData[] }) {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const [items, setItems] = useState<FactureCardData[]>(initialItems)
  const [q, setQ] = useState('')

  const [syncedFrom, setSyncedFrom] = useState(initialItems)
  if (syncedFrom !== initialItems) { setSyncedFrom(initialItems); setItems(initialItems) }

  useEffect(() => {
    let active = true
    let channel: ReturnType<typeof supabase.channel> | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    const bump = () => { clearTimeout(timer); timer = setTimeout(() => router.refresh(), 250) }
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id
      if (!uid || !active) return
      channel = supabase.channel('factures-board')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices', filter: `user_id=eq.${uid}` }, bump)
        .subscribe()
    })
    return () => { active = false; clearTimeout(timer); if (channel) supabase.removeChannel(channel) }
  }, [supabase, router])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return items
    return items.filter(i => i.clientName.toLowerCase().includes(s) || i.number.toLowerCase().includes(s))
  }, [items, q])

  async function move(id: string, toCol: string) {
    const prev = items
    setItems(items.map(i => (i.id === id ? { ...i, col: toCol } : i)))
    const { error } = await createClient().from('invoices').update({ status: toCol }).eq('id', id)
    if (error) { setItems(prev); toast.error('Erreur lors du déplacement') }
    else { toast.success('Facture déplacée'); router.refresh() }
  }

  return (
    <div className="space-y-3">
      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher un client, un numéro…" className="pl-9 h-10" />
      </div>

      <DndKanban
        columns={FACTURE_COLUMNS}
        items={filtered}
        onMove={move}
        footer={<p className="text-[11px] text-gray-400 mt-3">Glissez une facture d&apos;une colonne à l&apos;autre pour changer son statut.</p>}
        renderCard={(f) => {
          const dot = dotOf(f.col)
          return (
            <Card className="border border-gray-200/70 shadow-[var(--shadow-sm)] cursor-grab active:cursor-grabbing bg-white">
              <CardContent className="p-3.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-gray-400">{f.number}</span>
                  {f.badge && <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${f.badge.cls}`}>{f.badge.label}</span>}
                </div>
                <Link href={`/factures/${f.id}`} onClick={e => e.stopPropagation()} className="block font-semibold text-[15px] text-gray-900 hover:text-primary leading-snug mt-1.5 truncate">
                  {f.clientName}
                </Link>
                <p className="font-bold text-[17px] text-gray-900 tabular-nums mt-1.5 leading-none">{f.amountFmt}</p>
                <p className="text-[11px] text-gray-400 mt-1">{f.dueFmt ? `Échéance ${f.dueFmt}` : f.dateFmt}</p>
                {f.outstanding && <p className="text-[11px] font-medium text-[#C0392B] mt-0.5">{f.resteFmt}</p>}
                <Link href={`/factures/${f.id}`} onClick={e => e.stopPropagation()}
                  className="mt-3 flex items-center justify-center gap-1.5 min-h-[34px] px-3 py-1.5 rounded-lg text-[12.5px] font-semibold text-center leading-tight transition-opacity hover:opacity-85"
                  style={{ backgroundColor: `${dot}18`, color: dot }}>
                  <span>{f.cta || 'Ouvrir'}</span><ArrowRight className="w-3.5 h-3.5 flex-shrink-0" />
                </Link>
              </CardContent>
            </Card>
          )
        }}
      />
    </div>
  )
}
