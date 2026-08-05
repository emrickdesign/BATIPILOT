'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { timeProgress, isAValider } from '@/lib/chantiers'
import type { ProjectStatus } from '@/types'
import { AlertTriangle, CalendarPlus, Check } from 'lucide-react'
import { toast } from 'sonner'

/** Avancement du chantier — CALCULÉ automatiquement sur les dates prévues (début → fin).
 *  À échéance, l'artisan valide (terminé) ou replanifie la date de fin. */
export default function AvancementControl({
  projectId, startDate, endDate, status,
}: { projectId: string; startDate: string | null; endDate: string | null; status: ProjectStatus }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [replan, setReplan] = useState(false)
  const [newEnd, setNewEnd] = useState(endDate ?? '')

  const progress = timeProgress(startDate, endDate)
  const aValider = isAValider(status, endDate)

  async function valider() {
    setBusy(true)
    const supabase = createClient()
    const { error } = await supabase.from('projects').update({ status: 'termine', progress: 100 }).eq('id', projectId)
    setBusy(false)
    if (error) { toast.error('Erreur'); return }
    toast.success('Chantier validé — terminé ✓')
    router.refresh()
  }

  async function replanifier() {
    if (!newEnd) { toast.error('Choisis une nouvelle date de fin.'); return }
    setBusy(true)
    const supabase = createClient()
    const { error } = await supabase.from('projects').update({ end_date: newEnd }).eq('id', projectId)
    setBusy(false)
    if (error) { toast.error('Erreur'); return }
    toast.success('Date de fin replanifiée')
    setReplan(false)
    router.refresh()
  }

  // Dates manquantes → impossible de calculer l'avancement
  if (progress === null) {
    return (
      <div className="pt-2 border-t border-gray-100">
        <p className="text-sm text-[#C77D0E] flex items-center gap-1.5">
          <AlertTriangle className="w-4 h-4" /> Dates de début/fin manquantes —{' '}
          <Link href={`/chantiers/${projectId}/modifier`} className="underline font-medium">les renseigner</Link> pour suivre l&apos;avancement.
        </p>
      </div>
    )
  }

  const barColor = progress >= 80 ? '#4C6F18' : progress >= 40 ? '#E0674C' : '#C77D0E'

  return (
    <div className="pt-2 border-t border-gray-100 space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-500">Avancement <span className="text-gray-400 text-xs">(sur les dates prévues)</span></span>
        <span className="font-semibold text-gray-900">{progress} %</span>
      </div>
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, backgroundColor: barColor }} />
      </div>

      {aValider && (
        <div className="mt-2 rounded-xl border border-[#4C6F18]/30 bg-[#4C6F18]/[0.06] p-3">
          <p className="text-[13px] font-semibold text-[#3A5613]">Échéance atteinte — chantier terminé&nbsp;?</p>
          {replan ? (
            <div className="flex items-center gap-2 flex-wrap mt-2">
              <input type="date" value={newEnd} min={endDate ?? undefined} onChange={e => setNewEnd(e.target.value)}
                className="h-8 rounded-lg border border-gray-300 px-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#4C6F18]/30" />
              <button onClick={replanifier} disabled={busy} className="h-8 px-3 rounded-lg bg-[#4C6F18] text-white text-[13px] font-medium disabled:opacity-50">Enregistrer</button>
              <button onClick={() => setReplan(false)} disabled={busy} className="h-8 px-3 rounded-lg text-gray-500 text-[13px] font-medium hover:text-gray-700">Annuler</button>
            </div>
          ) : (
            <div className="flex items-center gap-2 mt-2">
              <button onClick={valider} disabled={busy} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[#4C6F18] text-white text-[13px] font-medium hover:bg-[#3F5C16] disabled:opacity-50">
                <Check className="w-3.5 h-3.5" /> Valider (terminé)
              </button>
              <button onClick={() => setReplan(true)} disabled={busy} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-gray-300 text-gray-600 text-[13px] font-medium hover:border-gray-400 disabled:opacity-50">
                <CalendarPlus className="w-3.5 h-3.5" /> Replanifier
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
