'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { ClientStatus } from '@/types'
import { clientStatusLabels, clientStatusColors, prospectPipelineStatuses, isProspect } from '@/lib/clients'

export default function ClientStatusSelect({
  clientId, current,
}: { clientId: string; current: ClientStatus }) {
  const router = useRouter()
  const [status, setStatus] = useState<ClientStatus>(current)
  const [saving, setSaving] = useState(false)

  async function change(next: ClientStatus) {
    const previous = status
    setStatus(next)
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('clients').update({ status: next }).eq('id', clientId)
    setSaving(false)
    if (error) {
      setStatus(previous)
      toast.error('Erreur lors du changement de statut')
    } else {
      toast.success(isProspect(next) ? 'Statut mis à jour' : 'Converti en client 🎉')
      router.refresh()
    }
  }

  return (
    <select
      value={status}
      disabled={saving}
      onClick={e => e.stopPropagation()}
      onChange={e => change(e.target.value as ClientStatus)}
      className={`h-7 rounded-full border-0 pl-2.5 pr-1 text-xs font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary ${clientStatusColors[status]}`}
    >
      {prospectPipelineStatuses.map(s => (
        <option key={s} value={s} className="bg-white text-gray-900">
          {clientStatusLabels[s]}
        </option>
      ))}
    </select>
  )
}
