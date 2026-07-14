'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { ProjectStatus } from '@/types'
import { projectStatusLabels, projectStatusOrder, projectStatusColors, projectToClientPhase } from '@/lib/chantiers'
import { phasesBefore } from '@/lib/clients'

export default function StatusSelect({
  projectId, current, clientId,
}: { projectId: string; current: ProjectStatus; clientId?: string | null }) {
  const router = useRouter()
  const [status, setStatus] = useState<ProjectStatus>(current)
  const [saving, setSaving] = useState(false)

  async function change(next: ProjectStatus) {
    const previous = status
    setStatus(next)
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('projects').update({ status: next }).eq('id', projectId)
    // Fait avancer la carte du client sur le board Clients (jamais en arrière).
    const phase = projectToClientPhase[next]
    if (!error && clientId && phase) {
      await supabase.from('clients').update({ status: phase }).eq('id', clientId).in('status', phasesBefore(phase))
    }
    setSaving(false)
    if (error) {
      setStatus(previous)
      toast.error('Erreur lors du changement de statut')
    } else {
      toast.success('Statut mis à jour')
      router.refresh()
    }
  }

  return (
    <select
      value={status}
      disabled={saving}
      onChange={e => change(e.target.value as ProjectStatus)}
      className={`h-8 rounded-full border-0 px-3 text-xs font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary ${projectStatusColors[status]}`}
    >
      {projectStatusOrder.map(s => (
        <option key={s} value={s} className="bg-white text-gray-900">
          {projectStatusLabels[s]}
        </option>
      ))}
    </select>
  )
}
