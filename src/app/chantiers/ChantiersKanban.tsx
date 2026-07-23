'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Search, Users2, ArrowRight } from 'lucide-react'
import DndKanban from '@/components/kanban/DndKanban'
import { CHANTIER_COLUMNS, type ChantierCardData } from './kanban-config'

const dotOf = (col: string) => CHANTIER_COLUMNS.find(c => c.key === col)?.dot || '#94918A'

export default function ChantiersKanban({ initialItems }: { initialItems: ChantierCardData[] }) {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const [items, setItems] = useState<ChantierCardData[]>(initialItems)
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
      channel = supabase.channel('chantiers-board')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'projects', filter: `user_id=eq.${uid}` }, bump)
        .subscribe()
    })
    return () => { active = false; clearTimeout(timer); if (channel) supabase.removeChannel(channel) }
  }, [supabase, router])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return items
    return items.filter(i => i.title.toLowerCase().includes(s) || (i.clientName || '').toLowerCase().includes(s))
  }, [items, q])

  async function move(id: string, toCol: string) {
    const prev = items
    setItems(items.map(i => (i.id === id ? { ...i, col: toCol } : i)))
    const { error } = await createClient().from('projects').update({ status: toCol }).eq('id', id)
    if (error) { setItems(prev); toast.error('Erreur lors du déplacement') }
    else { toast.success('Chantier déplacé'); router.refresh() }
  }

  return (
    <div className="space-y-3">
      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher un chantier, un client…" className="pl-9 h-10" />
      </div>

      <DndKanban
        columns={CHANTIER_COLUMNS}
        items={filtered}
        onMove={move}
        footer={<p className="text-[11px] text-gray-400 mt-3">Glissez un chantier d&apos;une colonne à l&apos;autre pour changer son statut.</p>}
        renderCard={(c) => {
          const dot = dotOf(c.col)
          return (
            <Card className="border border-gray-200/70 shadow-[var(--shadow-sm)] cursor-grab active:cursor-grabbing bg-white">
              <CardContent className="p-3.5">
                {c.enRetard && <span className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#FBE0DA] text-[#C0392B] mb-1">En retard</span>}
                <Link href={`/chantiers/${c.id}`} onClick={e => e.stopPropagation()} className="block font-semibold text-[15px] text-gray-900 hover:text-primary leading-snug truncate">
                  {c.title}
                </Link>
                {c.clientName && <p className="text-xs text-gray-500 truncate mt-0.5">{c.clientName}</p>}
                {c.amountFmt && (
                  <p className="font-bold text-[17px] text-gray-900 tabular-nums mt-1.5 leading-none">
                    {c.amountFmt} <span className="text-[11px] font-normal text-gray-400">devisé</span>
                  </p>
                )}
                {c.margeFmt && <p className={`text-[11px] font-medium mt-0.5 ${c.margePos ? 'text-[#3F7A2E]' : 'text-[#C0392B]'}`}>Marge {c.margeFmt}</p>}
                <p className="text-[11px] text-gray-400 mt-1 flex items-center gap-2">
                  <span className="flex items-center gap-1"><Users2 className="w-3 h-3" />{c.equipeCount}</span>
                  {c.progress > 0 && <span>· {c.progress}%</span>}
                </p>
                {c.progress > 0 && (
                  <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden mt-1.5">
                    <div className="h-full rounded-full" style={{ width: `${c.progress}%`, backgroundColor: dot }} />
                  </div>
                )}
                <Link href={`/chantiers/${c.id}`} onClick={e => e.stopPropagation()}
                  className="mt-3 flex items-center justify-center gap-1.5 min-h-[34px] px-3 py-1.5 rounded-lg text-[12.5px] font-semibold text-center leading-tight transition-opacity hover:opacity-85"
                  style={{ backgroundColor: `${dot}18`, color: dot }}>
                  <span>{c.cta}</span><ArrowRight className="w-3.5 h-3.5 flex-shrink-0" />
                </Link>
              </CardContent>
            </Card>
          )
        }}
      />
    </div>
  )
}
