'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { projectStatusColors, projectStatusLabels } from '@/lib/chantiers'
import type { ProjectStatus } from '@/types'
import { HardHat, AlertTriangle, CheckCircle2, CalendarClock, Check, CalendarPlus } from 'lucide-react'
import { toast } from 'sonner'

export type ChantierActif = {
  id: string
  title: string
  status: ProjectStatus
  hasDates: boolean
  progress: number
  aValider: boolean
  endDate: string | null
  retardJours: number
  sansEquipe: boolean
}

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : ''

// Carte verte « À valider » : chantier arrivé à échéance, l'artisan confirme ou replanifie.
function ValiderCard({ c }: { c: ChantierActif }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [replan, setReplan] = useState(false)
  const [newEnd, setNewEnd] = useState(c.endDate ?? '')

  async function valider() {
    setBusy(true)
    const supabase = createClient()
    const { error } = await supabase.from('projects').update({ status: 'termine', progress: 100 }).eq('id', c.id)
    setBusy(false)
    if (error) { toast.error('Erreur'); return }
    toast.success('Chantier validé — terminé ✓')
    router.refresh()
  }

  async function replanifier() {
    if (!newEnd) { toast.error('Choisis une nouvelle date de fin.'); return }
    setBusy(true)
    const supabase = createClient()
    const { error } = await supabase.from('projects').update({ end_date: newEnd }).eq('id', c.id)
    setBusy(false)
    if (error) { toast.error('Erreur'); return }
    toast.success('Date de fin replanifiée')
    setReplan(false)
    router.refresh()
  }

  return (
    <div className="rounded-xl border border-[#4C6F18]/30 bg-[#4C6F18]/[0.06] p-3">
      <div className="flex items-center gap-3">
        <span className="grid place-items-center w-8 h-8 rounded-lg bg-[#4C6F18] text-white flex-shrink-0"><CheckCircle2 className="w-4 h-4" /></span>
        <Link href={`/chantiers/${c.id}`} className="text-sm font-semibold text-[#3A5613] flex-1 min-w-0 truncate hover:underline">{c.title}</Link>
        <Badge className="bg-[#4C6F18] text-white border-0 text-xs flex-shrink-0">À valider</Badge>
      </div>
      <p className="text-[12px] text-[#3A5613]/80 mt-1.5 pl-11 flex items-center gap-1.5">
        <CalendarClock className="w-3.5 h-3.5" />
        Fin prévue le {fmtDate(c.endDate)}{c.retardJours > 0 ? ` · ${c.retardJours} j de retard` : ''} — chantier terminé&nbsp;?
      </p>
      <div className="pl-11 mt-2.5">
        {replan ? (
          <div className="flex items-center gap-2 flex-wrap">
            <input type="date" value={newEnd} min={c.endDate ?? undefined} onChange={e => setNewEnd(e.target.value)}
              className="h-8 rounded-lg border border-gray-300 px-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#4C6F18]/30" />
            <button onClick={replanifier} disabled={busy}
              className="h-8 px-3 rounded-lg bg-[#4C6F18] text-white text-[13px] font-medium disabled:opacity-50">Enregistrer</button>
            <button onClick={() => setReplan(false)} disabled={busy}
              className="h-8 px-3 rounded-lg text-gray-500 text-[13px] font-medium hover:text-gray-700">Annuler</button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button onClick={valider} disabled={busy}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[#4C6F18] text-white text-[13px] font-medium hover:bg-[#3F5C16] disabled:opacity-50">
              <Check className="w-3.5 h-3.5" /> Valider (terminé)
            </button>
            <button onClick={() => setReplan(true)} disabled={busy}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-gray-300 text-gray-600 text-[13px] font-medium hover:border-gray-400 disabled:opacity-50">
              <CalendarPlus className="w-3.5 h-3.5" /> Replanifier
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// Ligne d'avancement classique (avancement calculé sur les dates prévues).
function Row({ c }: { c: ChantierActif }) {
  const barColor = c.progress >= 80 ? '#4C6F18' : c.progress >= 40 ? '#E0674C' : '#C77D0E'
  return (
    <Link href={`/chantiers/${c.id}`} className="block hover:bg-black/[0.03] rounded-lg px-2 -mx-2 py-2 transition-colors">
      <div className="flex items-center gap-3">
        <span className="grid place-items-center w-8 h-8 rounded-lg bg-[#FCE7DE] text-[#C14E33] flex-shrink-0"><HardHat className="w-4 h-4" /></span>
        <span className="text-sm font-medium text-gray-700 flex-1 min-w-0 truncate">{c.title}</span>
        <Badge className={`${projectStatusColors[c.status] || 'bg-gray-100 text-gray-700'} border-0 text-xs flex-shrink-0`}>
          {projectStatusLabels[c.status] || c.status}
        </Badge>
      </div>
      {c.hasDates ? (
        <div className="flex items-center gap-2.5 mt-2 pl-11">
          <div className="flex-1 h-1.5 rounded-full bg-black/[0.07] overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${c.progress}%`, backgroundColor: barColor }} />
          </div>
          <span className="text-[11px] font-semibold text-marine tabular-nums w-8 text-right flex-shrink-0">{c.progress}%</span>
          <span className={`hidden md:inline-flex items-center gap-1 text-[11px] font-medium flex-shrink-0 w-[92px] ${c.sansEquipe ? 'text-[#C77D0E]' : 'text-[#4C6F18]'}`}>
            {c.sansEquipe ? <><AlertTriangle className="w-3 h-3" /> Sans équipe</> : <><CheckCircle2 className="w-3 h-3" /> Équipe OK</>}
          </span>
        </div>
      ) : (
        <p className="mt-2 pl-11 text-[12px] text-[#C77D0E] flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" /> Dates à définir pour suivre l&apos;avancement
        </p>
      )}
    </Link>
  )
}

export default function ChantiersActifsList({ items }: { items: ChantierActif[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-gray-400 py-6 text-center">Aucun chantier actif — <Link href="/chantiers/nouveau" className="text-primary hover:underline">créez-en un</Link>.</p>
  }
  return (
    <div className="space-y-1.5">
      {items.map(c => (c.aValider ? <ValiderCard key={c.id} c={c} /> : <Row key={c.id} c={c} />))}
    </div>
  )
}
