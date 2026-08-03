'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MoreHorizontal, Clock3, CalendarClock, CalendarDays, BellOff, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

const OPTIONS: { label: string; days: number; icon: typeof Clock3 }[] = [
  { label: 'Demain', days: 1, icon: Clock3 },
  { label: 'Dans 3 jours', days: 3, icon: CalendarClock },
  { label: 'Semaine prochaine', days: 7, icon: CalendarDays },
  { label: 'Ignorer (90 j)', days: 90, icon: BellOff },
]

// Met une catégorie de todo en veille. Le rendu du dashboard étant côté serveur,
// on rafraîchit après enregistrement pour refléter la mise en veille.
export default function TodoSnooze({ todoKey }: { todoKey: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  async function snooze(days: number) {
    setBusy(true)
    try {
      const res = await fetch('/api/dashboard/snooze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: todoKey, days }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => null)
        toast.error(j?.error || 'Impossible de reporter')
        return
      }
      setOpen(false)
      toast.success('Reporté')
      router.refresh()
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        disabled={busy}
        title="Reporter ou ignorer"
        aria-label="Reporter ou ignorer"
        className="grid place-items-center w-8 h-8 rounded-lg text-gray-300 hover:text-gray-600 hover:bg-black/[0.04] transition-colors"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <MoreHorizontal className="w-4 h-4" />}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 top-9 z-20 w-52 rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden py-1">
            <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Reporter cette alerte</p>
            {OPTIONS.map(o => (
              <button
                key={o.days}
                type="button"
                onClick={() => snooze(o.days)}
                disabled={busy}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left disabled:opacity-50"
              >
                <o.icon className="w-4 h-4 text-gray-400" />
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
