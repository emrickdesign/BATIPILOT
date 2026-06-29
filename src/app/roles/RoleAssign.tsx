'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { accessRoleOrder, accessRoleLabels } from '@/lib/roles'

const selectClass = 'h-9 rounded-md border border-gray-200 bg-white px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary'

export default function RoleAssign({ employeeId, current }: { employeeId: string; current: string | null }) {
  const [value, setValue] = useState(current || '')
  const [saving, setSaving] = useState(false)

  async function onChange(next: string) {
    setValue(next)
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('employees').update({ access_role: next || null }).eq('id', employeeId)
    setSaving(false)
    if (error) toast.error('Erreur'); else toast.success('Rôle mis à jour')
  }

  return (
    <select className={selectClass} value={value} onChange={e => onChange(e.target.value)} disabled={saving}>
      <option value="">— Aucun accès —</option>
      {accessRoleOrder.filter(r => r !== 'admin').map(r => (
        <option key={r} value={r}>{accessRoleLabels[r]}</option>
      ))}
    </select>
  )
}
