'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

const STEPS = [0, 25, 50, 75, 100]

/** Avancement du chantier (projects.progress) — barre + réglage rapide. */
export default function AvancementControl({ projectId, initial }: { projectId: string; initial: number | null }) {
  const router = useRouter()
  const [value, setValue] = useState<number>(initial ?? 0)
  const [saving, setSaving] = useState(false)

  async function set(v: number) {
    setValue(v)
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('projects').update({ progress: v }).eq('id', projectId)
    setSaving(false)
    if (error) { toast.error('Erreur enregistrement'); return }
    toast.success(`Avancement : ${v} %`)
    router.refresh()
  }

  return (
    <div className="pt-2 border-t border-gray-100 space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-500">Avancement</span>
        <span className="font-semibold text-gray-900">{value} %{saving && <span className="text-gray-400"> …</span>}</span>
      </div>
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
        <div className="h-full rounded-full bg-[#3F7A2E] transition-all" style={{ width: `${value}%` }} />
      </div>
      <div className="flex gap-1">
        {STEPS.map(s => (
          <button key={s} onClick={() => set(s)} disabled={saving}
            className={`flex-1 text-xs py-1 rounded-md border transition-colors ${value === s ? 'border-[#3F7A2E] bg-[#3F7A2E]/10 text-[#3F7A2E] font-semibold' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
            {s === 100 ? 'Terminé' : `${s} %`}
          </button>
        ))}
      </div>
    </div>
  )
}
