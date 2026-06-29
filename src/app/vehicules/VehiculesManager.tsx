'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Plus, Truck, Pencil, Trash2, User } from 'lucide-react'
import type { Vehicle, Employee } from '@/types'

type Draft = { id?: string; name: string; plate: string; driver_employee_id: string; active: boolean; notes: string }
const empty: Draft = { name: '', plate: '', driver_employee_id: '', active: true, notes: '' }
const selectClass = 'w-full h-10 rounded-md border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary'

export default function VehiculesManager({ vehicles, employees }: { vehicles: Vehicle[]; employees: Employee[] }) {
  const router = useRouter()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const driverName = (id?: string | null) => employees.find(e => e.id === id)?.full_name

  function set(k: keyof Draft, v: string | boolean) { setDraft(d => (d ? { ...d, [k]: v } : d)) }

  async function handleSave() {
    if (!draft) return
    if (!draft.name.trim()) { toast.error('Nom du véhicule requis'); return }
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    const payload = {
      name: draft.name.trim(), plate: draft.plate || null,
      driver_employee_id: draft.driver_employee_id || null, active: draft.active, notes: draft.notes || null,
    }
    const { error } = draft.id
      ? await supabase.from('vehicles').update(payload).eq('id', draft.id)
      : await supabase.from('vehicles').insert({ user_id: user.id, ...payload })
    setSaving(false)
    if (error) { toast.error('Erreur lors de l’enregistrement'); return }
    toast.success(draft.id ? 'Véhicule modifié' : 'Véhicule ajouté')
    setDraft(null); router.refresh()
  }

  async function remove(v: Vehicle) {
    if (!confirm(`Supprimer ${v.name} ?`)) return
    const supabase = createClient()
    const { error } = await supabase.from('vehicles').delete().eq('id', v.id)
    if (error) toast.error('Erreur'); else { toast.success('Véhicule supprimé'); router.refresh() }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setDraft({ ...empty })} className="gap-1"><Plus className="w-4 h-4" /> Ajouter un véhicule</Button>
      </div>

      {draft && (
        <Card className="border border-primary/30 bg-white">
          <CardContent className="p-4 space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Nom / modèle *</Label>
                <Input value={draft.name} onChange={e => set('name', e.target.value)} placeholder="Renault Master" />
              </div>
              <div className="space-y-1">
                <Label>Immatriculation</Label>
                <Input value={draft.plate} onChange={e => set('plate', e.target.value)} placeholder="AB-123-CD" />
              </div>
              <div className="space-y-1">
                <Label>Conducteur habituel</Label>
                <select className={selectClass} value={draft.driver_employee_id} onChange={e => set('driver_employee_id', e.target.value)}>
                  <option value="">— Aucun —</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
                </select>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={draft.active} onChange={e => set('active', e.target.checked)} className="w-4 h-4 accent-[var(--primary)]" />
                  Véhicule actif
                </label>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea rows={2} value={draft.notes} onChange={e => set('notes', e.target.value)} placeholder="Entretien, assurance…" />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setDraft(null)}>Annuler</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {vehicles.length === 0 && !draft ? (
        <Card className="border border-gray-200/80 bg-white">
          <CardContent className="p-10 text-center text-gray-400">Aucun véhicule. Ajoute ta flotte pour suivre conducteurs et présence chantier.</CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {vehicles.map(v => (
            <Card key={v.id} className={`border bg-white ${v.active ? 'border-gray-200/80' : 'border-gray-200/80 opacity-60'}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="grid place-items-center w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex-shrink-0"><Truck className="w-5 h-5" /></span>
                    <div className="min-w-0">
                      <div className="font-semibold text-marine truncate">{v.name}</div>
                      <div className="text-xs text-gray-400">{v.plate || 'Sans plaque'}</div>
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => setDraft({ id: v.id, name: v.name, plate: v.plate || '', driver_employee_id: v.driver_employee_id || '', active: v.active, notes: v.notes || '' })} className="p-1.5 text-gray-400 hover:text-marine"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => remove(v)} className="p-1.5 text-gray-400 hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3 text-xs">
                  {driverName(v.driver_employee_id)
                    ? <span className="inline-flex items-center gap-1 text-gray-600"><User className="w-3 h-3" /> {driverName(v.driver_employee_id)}</span>
                    : <span className="text-gray-400">Pas de conducteur attitré</span>}
                  {!v.active && <Badge className="bg-gray-100 text-gray-500 border-0 text-[10px]">Inactif</Badge>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
