'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'

const selectClass = 'w-full h-10 rounded-md border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary'

export default function AddVehicleLog({ vehicles, projects }: {
  vehicles: { id: string; name: string }[]
  projects: { id: string; title: string }[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id || '')
  const [projectId, setProjectId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [hours, setHours] = useState('')
  const [km, setKm] = useState('')

  async function save() {
    if (!vehicleId) { toast.error('Choisis un véhicule'); return }
    if (!hours) { toast.error('Indique les heures de présence'); return }
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    const { error } = await supabase.from('vehicle_logs').upsert({
      user_id: user.id, vehicle_id: vehicleId, project_id: projectId || null,
      date, hours_present: Number(hours.replace(',', '.')), km: km ? Number(km.replace(',', '.')) : null,
    }, { onConflict: 'user_id,vehicle_id,date,project_id' })
    setSaving(false)
    if (error) { toast.error('Erreur'); return }
    toast.success('Relevé véhicule enregistré')
    setHours(''); setKm(''); setOpen(false); router.refresh()
  }

  if (vehicles.length === 0) return null

  return open ? (
    <Card className="border border-primary/30 bg-white">
      <CardContent className="p-4 grid sm:grid-cols-6 gap-3 items-end">
        <div className="space-y-1">
          <Label>Véhicule</Label>
          <select className={selectClass} value={vehicleId} onChange={e => setVehicleId(e.target.value)}>
            {vehicles.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label>Chantier</Label>
          <select className={selectClass} value={projectId} onChange={e => setProjectId(e.target.value)}>
            <option value="">— Aucun —</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label>Date</Label>
          <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Heures présence</Label>
          <Input value={hours} onChange={e => setHours(e.target.value)} placeholder="7" inputMode="decimal" />
        </div>
        <div className="space-y-1">
          <Label>Km (optionnel)</Label>
          <Input value={km} onChange={e => setKm(e.target.value)} placeholder="km" inputMode="decimal" />
        </div>
        <div className="flex gap-2">
          <Button onClick={save} disabled={saving} className="flex-1">{saving ? '…' : 'Ajouter'}</Button>
          <Button variant="destructive-outline" onClick={() => setOpen(false)}>✕</Button>
        </div>
      </CardContent>
    </Card>
  ) : (
    <div className="flex justify-end">
      <Button variant="outline" onClick={() => setOpen(true)} className="gap-1"><Plus className="w-4 h-4" /> Relevé véhicule</Button>
    </div>
  )
}
