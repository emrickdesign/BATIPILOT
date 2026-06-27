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
import { Plus, Users, Phone, Mail, Pencil, Trash2, Check } from 'lucide-react'
import type { Employee } from '@/types'
import { employeeRoleOptions, skillOptions, employeeColors, employeeInitials } from '@/lib/equipe'

type Draft = {
  id?: string; full_name: string; role: string; skills: string[]
  phone: string; email: string; hourly_cost: string; color: string; notes: string
}

const empty: Draft = {
  full_name: '', role: '', skills: [], phone: '', email: '', hourly_cost: '', color: employeeColors[0], notes: '',
}

const selectClass =
  'w-full h-10 rounded-md border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6A00]'

export default function EquipeManager({ employees }: { employees: Employee[] }) {
  const router = useRouter()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)

  function startNew() { setDraft({ ...empty, color: employeeColors[employees.length % employeeColors.length] }) }
  function startEdit(e: Employee) {
    setDraft({
      id: e.id, full_name: e.full_name, role: e.role || '', skills: e.skills || [],
      phone: e.phone || '', email: e.email || '', hourly_cost: e.hourly_cost != null ? String(e.hourly_cost) : '',
      color: e.color || employeeColors[0], notes: e.notes || '',
    })
  }
  function set(k: keyof Draft, v: string | string[]) { setDraft(d => (d ? { ...d, [k]: v } : d)) }
  function toggleSkill(s: string) {
    setDraft(d => d ? { ...d, skills: d.skills.includes(s) ? d.skills.filter(x => x !== s) : [...d.skills, s] } : d)
  }

  async function handleSave() {
    if (!draft) return
    if (!draft.full_name.trim()) { toast.error('Indiquez le nom du salarié'); return }
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    const payload = {
      full_name: draft.full_name.trim(),
      role: draft.role || null,
      skills: draft.skills,
      phone: draft.phone || null,
      email: draft.email || null,
      hourly_cost: draft.hourly_cost === '' ? null : Number(draft.hourly_cost.replace(',', '.')),
      color: draft.color,
      notes: draft.notes || null,
    }
    const { error } = draft.id
      ? await supabase.from('employees').update(payload).eq('id', draft.id)
      : await supabase.from('employees').insert({ user_id: user.id, ...payload })
    setSaving(false)
    if (error) { toast.error('Erreur lors de l\'enregistrement'); return }
    toast.success(draft.id ? 'Salarié modifié' : 'Salarié ajouté')
    setDraft(null)
    router.refresh()
  }

  async function toggleActive(e: Employee) {
    const supabase = createClient()
    const { error } = await supabase.from('employees').update({ active: !e.active }).eq('id', e.id)
    if (error) { toast.error('Erreur'); return }
    toast.success(e.active ? 'Salarié désactivé' : 'Salarié réactivé')
    router.refresh()
  }

  async function handleDelete(e: Employee) {
    if (!confirm(`Supprimer ${e.full_name} ?`)) return
    const supabase = createClient()
    const { error } = await supabase.from('employees').delete().eq('id', e.id)
    if (error) { toast.error('Erreur lors de la suppression'); return }
    toast.success('Salarié supprimé')
    router.refresh()
  }

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-[26px] font-bold font-heading text-marine">Équipe</h1>
          <p className="text-gray-500 mt-1 text-sm">Vos salariés, leurs compétences et leur coût — base du planning et des heures.</p>
        </div>
        {!draft && (
          <Button className="h-10 gap-2 shadow-sm" onClick={startNew}>
            <Plus className="w-4 h-4" /> Ajouter un salarié
          </Button>
        )}
      </div>

      {/* Formulaire ajout/édition */}
      {draft && (
        <Card className="border-2 border-[#FF6A00]/30">
          <CardContent className="p-4 space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs text-gray-500">Nom complet *</Label>
                <Input value={draft.full_name} onChange={e => set('full_name', e.target.value)} placeholder="Jean Dupont" /></div>
              <div className="space-y-1"><Label className="text-xs text-gray-500">Fonction</Label>
                <select value={draft.role} onChange={e => set('role', e.target.value)} className={selectClass}>
                  <option value="">— À définir —</option>
                  {employeeRoleOptions.map(r => <option key={r} value={r}>{r}</option>)}
                </select></div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500">Compétences</Label>
              <div className="flex flex-wrap gap-2">
                {skillOptions.map(s => (
                  <button key={s} type="button" onClick={() => toggleSkill(s)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                      draft.skills.includes(s) ? 'border-[#FF6A00] bg-[#FFF1E6] text-[#FF6A00]' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}>{s}</button>
                ))}
              </div>
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="space-y-1"><Label className="text-xs text-gray-500">Téléphone</Label>
                <Input value={draft.phone} onChange={e => set('phone', e.target.value)} placeholder="06 12 34 56 78" /></div>
              <div className="space-y-1"><Label className="text-xs text-gray-500">Email</Label>
                <Input type="email" value={draft.email} onChange={e => set('email', e.target.value)} placeholder="jean@..." /></div>
              <div className="space-y-1"><Label className="text-xs text-gray-500">Coût horaire (€/h)</Label>
                <Input type="number" step="0.5" value={draft.hourly_cost} onChange={e => set('hourly_cost', e.target.value)} placeholder="Optionnel" /></div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500">Couleur (planning)</Label>
              <div className="flex flex-wrap gap-2">
                {employeeColors.map(c => (
                  <button key={c} type="button" onClick={() => set('color', c)}
                    className={`w-7 h-7 rounded-full transition-transform ${draft.color === c ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : ''}`}
                    style={{ backgroundColor: c }} aria-label={c} />
                ))}
              </div>
            </div>
            <div className="space-y-1"><Label className="text-xs text-gray-500">Notes</Label>
              <Textarea rows={2} value={draft.notes} onChange={e => set('notes', e.target.value)} placeholder="Permis, habilitations, disponibilités..." /></div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDraft(null)} disabled={saving}>Annuler</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? 'Enregistrement...' : draft.id ? 'Enregistrer' : 'Ajouter le salarié'}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Liste */}
      {employees.length === 0 && !draft ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="font-medium">Aucun salarié pour l&apos;instant</p>
            <p className="text-sm mt-1">Ajoutez votre équipe pour planifier les chantiers et suivre les heures.</p>
            <Button className="mt-4" onClick={startNew}>Ajouter un salarié</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {employees.map(e => (
            <Card key={e.id} className={`card-interactive border border-gray-200/80 ${!e.active ? 'opacity-60' : ''}`}>
              <CardContent className="p-4 flex items-center gap-3">
                <span className="grid place-items-center w-11 h-11 rounded-full text-white font-bold text-sm flex-shrink-0"
                  style={{ backgroundColor: e.color }}>{employeeInitials(e.full_name)}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900 truncate">{e.full_name}</span>
                    {e.role && <Badge variant="outline" className="text-xs flex-shrink-0">{e.role}</Badge>}
                    {!e.active && <Badge className="bg-gray-100 text-gray-500 border-0 text-xs">Inactif</Badge>}
                  </div>
                  <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-gray-500">
                    {e.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{e.phone}</span>}
                    {e.email && <span className="flex items-center gap-1 truncate"><Mail className="w-3 h-3" />{e.email}</span>}
                    {e.hourly_cost != null && <span>{e.hourly_cost} €/h</span>}
                  </div>
                  {e.skills?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {e.skills.map(s => <Badge key={s} className="bg-orange-50 text-orange-700 border-0 text-[11px]">{s}</Badge>)}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => toggleActive(e)} title={e.active ? 'Désactiver' : 'Réactiver'}
                    className={`grid place-items-center w-8 h-8 rounded-md hover:bg-gray-50 ${e.active ? 'text-gray-400 hover:text-amber-600' : 'text-green-500'}`}><Check className="w-4 h-4" /></button>
                  <button onClick={() => startEdit(e)} title="Modifier"
                    className="grid place-items-center w-8 h-8 rounded-md text-gray-400 hover:text-blue-600 hover:bg-gray-50"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => handleDelete(e)} title="Supprimer"
                    className="grid place-items-center w-8 h-8 rounded-md text-gray-400 hover:text-red-500 hover:bg-gray-50"><Trash2 className="w-4 h-4" /></button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
