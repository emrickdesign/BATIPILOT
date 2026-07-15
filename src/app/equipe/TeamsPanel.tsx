'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Plus, X, Users2, MessageSquare, HardHat, Trash2, Pencil, Check, Loader2 } from 'lucide-react'
import { employeeColors, employeeInitials } from '@/lib/equipe'

type Emp = { id: string; full_name: string; color: string }
type Team = { id: string; name: string; color: string; project_id: string | null; conversation_id: string | null }
type Member = { team_id: string; employee_id: string }
type Project = { id: string; title: string }

const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

export default function TeamsPanel({
  employees, teams: initialTeams, members: initialMembers, projects,
}: {
  employees: Emp[]; teams: Team[]; members: Member[]; projects: Project[]
}) {
  const router = useRouter()
  const [teams, setTeams] = useState<Team[]>(initialTeams)
  const [members, setMembers] = useState<Member[]>(initialMembers)
  const [busy, setBusy] = useState(false)

  // Resync après refresh
  const [syncedT, setSyncedT] = useState(initialTeams)
  if (syncedT !== initialTeams) { setSyncedT(initialTeams); setTeams(initialTeams) }
  const [syncedM, setSyncedM] = useState(initialMembers)
  if (syncedM !== initialMembers) { setSyncedM(initialMembers); setMembers(initialMembers) }

  const empById = useMemo(() => new Map(employees.map(e => [e.id, e])), [employees])
  const projById = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects])
  const memberIdsOf = (teamId: string) => members.filter(m => m.team_id === teamId).map(m => m.employee_id)

  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(employeeColors[1] || '#E0674C')
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [affectFor, setAffectFor] = useState<string | null>(null)
  const [affectProj, setAffectProj] = useState('')
  const [affectDate, setAffectDate] = useState(todayIso())

  async function uid() { const { data } = await createClient().auth.getUser(); return data.user?.id || null }

  async function createTeam() {
    const name = newName.trim()
    if (!name) { toast.error('Nom de l\'équipe requis'); return }
    setBusy(true)
    const supabase = createClient()
    const user_id = await uid(); if (!user_id) { setBusy(false); return }
    // Discussion de groupe créée d'emblée (participants ajoutés avec les membres).
    const { data: conv } = await supabase.from('conversations').insert({ user_id, type: 'group', name }).select('id').single()
    const { data: team, error } = await supabase.from('teams')
      .insert({ user_id, name, color: newColor, conversation_id: conv?.id ?? null })
      .select('id,name,color,project_id,conversation_id').single()
    setBusy(false)
    if (error || !team) { toast.error('Erreur création équipe'); return }
    setTeams(prev => [...prev, team])
    setCreating(false); setNewName(''); setNewColor(employeeColors[1] || '#E0674C')
    toast.success('Équipe créée')
    router.refresh()
  }

  async function renameTeam(t: Team) {
    const name = editName.trim(); if (!name) return
    setEditId(null)
    setTeams(prev => prev.map(x => x.id === t.id ? { ...x, name } : x))
    const supabase = createClient()
    await supabase.from('teams').update({ name }).eq('id', t.id)
    if (t.conversation_id) await supabase.from('conversations').update({ name }).eq('id', t.conversation_id)
    toast.success('Équipe renommée')
  }

  async function deleteTeam(t: Team) {
    if (!confirm(`Supprimer l'équipe « ${t.name} » ?`)) return
    setTeams(prev => prev.filter(x => x.id !== t.id))
    setMembers(prev => prev.filter(m => m.team_id !== t.id))
    await createClient().from('teams').delete().eq('id', t.id)
    toast.success('Équipe supprimée')
    router.refresh()
  }

  async function addMember(t: Team, employeeId: string) {
    if (!employeeId) return
    setMembers(prev => [...prev, { team_id: t.id, employee_id: employeeId }])
    const supabase = createClient()
    const user_id = await uid(); if (!user_id) return
    await supabase.from('team_members').insert({ user_id, team_id: t.id, employee_id: employeeId })
    if (t.conversation_id) await supabase.from('conversation_participants').insert({ user_id, conversation_id: t.conversation_id, employee_id: employeeId })
  }

  async function removeMember(t: Team, employeeId: string) {
    setMembers(prev => prev.filter(m => !(m.team_id === t.id && m.employee_id === employeeId)))
    const supabase = createClient()
    await supabase.from('team_members').delete().eq('team_id', t.id).eq('employee_id', employeeId)
    if (t.conversation_id) await supabase.from('conversation_participants').delete().eq('conversation_id', t.conversation_id).eq('employee_id', employeeId)
  }

  async function affecter(t: Team) {
    if (!affectProj) { toast.error('Choisissez un chantier'); return }
    const ids = memberIdsOf(t.id)
    if (!ids.length) { toast.error('Ajoutez d\'abord des salariés à l\'équipe'); return }
    setBusy(true)
    const supabase = createClient()
    const user_id = await uid(); if (!user_id) { setBusy(false); return }
    // 1) rattacher l'équipe au chantier
    await supabase.from('teams').update({ project_id: affectProj }).eq('id', t.id)
    setTeams(prev => prev.map(x => x.id === t.id ? { ...x, project_id: affectProj } : x))
    // 2) créer les affectations planning des membres (journée complète), sans doublon
    const { data: existing } = await supabase.from('assignments').select('employee_id').eq('user_id', user_id).eq('project_id', affectProj).eq('date', affectDate)
    const has = new Set((existing || []).map(a => a.employee_id))
    const rows = ids.filter(id => !has.has(id)).map(id => ({ user_id, employee_id: id, project_id: affectProj, date: affectDate, start_hour: 8, end_hour: 17 }))
    if (rows.length) await supabase.from('assignments').insert(rows)
    setBusy(false); setAffectFor(null); setAffectProj('')
    toast.success(`Équipe affectée — ${rows.length} salarié(s) planifié(s)`)
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold font-heading text-marine flex items-center gap-2"><Users2 className="w-5 h-5 text-primary" /> Équipes</h2>
          <p className="text-gray-500 text-xs mt-0.5">Regroupez des salariés. Chaque équipe a sa discussion de groupe.</p>
        </div>
        {!creating && <Button size="sm" className="gap-1 flex-shrink-0" onClick={() => setCreating(true)}><Plus className="w-4 h-4" /> Équipe</Button>}
      </div>

      {/* Création */}
      {creating && (
        <Card className="border border-primary/30">
          <CardContent className="p-3 space-y-2.5">
            <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nom de l'équipe (ex : Équipe 1, Chantier Moreau)" autoFocus />
            <div className="flex items-center gap-1.5">
              {employeeColors.map(c => (
                <button key={c} type="button" onClick={() => setNewColor(c)} className={`w-6 h-6 rounded-full transition-transform ${newColor === c ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : ''}`} style={{ backgroundColor: c }} />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={createTeam} disabled={busy}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Créer'}</Button>
              <Button size="sm" variant="ghost" onClick={() => { setCreating(false); setNewName('') }}>Annuler</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {teams.length === 0 && !creating && (
        <Card className="border border-dashed border-gray-200">
          <CardContent className="py-8 text-center text-gray-400 text-sm">
            <Users2 className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            Aucune équipe. Créez-en une pour regrouper des salariés et lancer leur discussion.
          </CardContent>
        </Card>
      )}

      {/* Liste des équipes */}
      <div className="space-y-3">
        {teams.map(t => {
          const ids = memberIdsOf(t.id)
          const available = employees.filter(e => !ids.includes(e.id))
          const proj = t.project_id ? projById.get(t.project_id) : null
          return (
            <Card key={t.id} className="border border-gray-200/80 overflow-hidden">
              <div className="h-[3px]" style={{ backgroundColor: t.color }} />
              <CardContent className="p-3.5 space-y-3">
                {/* En-tête */}
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                  {editId === t.id ? (
                    <input value={editName} onChange={e => setEditName(e.target.value)} onKeyDown={e => e.key === 'Enter' && renameTeam(t)}
                      className="flex-1 min-w-0 text-sm font-semibold border-b border-gray-300 focus:outline-none focus:border-primary" autoFocus />
                  ) : (
                    <span className="flex-1 min-w-0 font-semibold text-marine truncate">{t.name}</span>
                  )}
                  {editId === t.id ? (
                    <button onClick={() => renameTeam(t)} className="grid place-items-center w-7 h-7 rounded-md text-[#3F7A2E] hover:bg-gray-50"><Check className="w-4 h-4" /></button>
                  ) : (
                    <button onClick={() => { setEditId(t.id); setEditName(t.name) }} title="Renommer" className="grid place-items-center w-7 h-7 rounded-md text-gray-400 hover:text-primary hover:bg-gray-50"><Pencil className="w-3.5 h-3.5" /></button>
                  )}
                  <button onClick={() => deleteTeam(t)} title="Supprimer" className="grid place-items-center w-7 h-7 rounded-md text-gray-400 hover:text-red-500 hover:bg-gray-50"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>

                {/* Membres */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {ids.length === 0 && <span className="text-xs text-gray-400">Aucun salarié</span>}
                  {ids.map(id => {
                    const e = empById.get(id); if (!e) return null
                    return (
                      <span key={id} className="inline-flex items-center gap-1.5 pl-1 pr-1.5 h-7 rounded-full text-white text-[11px] font-semibold" style={{ backgroundColor: e.color }}>
                        <span className="grid place-items-center w-5 h-5 rounded-full bg-white/25 text-[9px]">{employeeInitials(e.full_name)}</span>
                        {e.full_name.split(' ')[0]}
                        <button onClick={() => removeMember(t, id)} className="opacity-60 hover:opacity-100"><X className="w-3 h-3" /></button>
                      </span>
                    )
                  })}
                  {available.length > 0 && (
                    <div className="relative inline-flex">
                      <span className="pointer-events-none inline-flex items-center gap-1 h-7 px-2.5 rounded-full border border-dashed border-gray-300 text-[11px] font-medium text-gray-400">
                        <Plus className="w-3 h-3" /> Ajouter
                      </span>
                      <select value="" onChange={e => { addMember(t, e.target.value); e.currentTarget.value = '' }} className="absolute inset-0 w-full opacity-0 cursor-pointer" aria-label="Ajouter un salarié">
                        <option value="">Ajouter…</option>
                        {available.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
                      </select>
                    </div>
                  )}
                </div>

                {/* Chantier rattaché */}
                {proj && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <HardHat className="w-3.5 h-3.5 text-[#C14E33]" /> Rattachée à <Link href={`/chantiers/${proj.id}`} className="font-medium text-primary hover:underline truncate">{proj.title}</Link>
                  </div>
                )}

                {/* Affecter à un chantier */}
                {affectFor === t.id ? (
                  <div className="rounded-xl bg-gray-50 p-2.5 space-y-2">
                    <select value={affectProj} onChange={e => setAffectProj(e.target.value)} className="w-full h-9 rounded-lg border border-gray-200 px-2 text-sm bg-white">
                      <option value="">Choisir un chantier…</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                    </select>
                    <div className="flex items-center gap-2">
                      <input type="date" value={affectDate} onChange={e => setAffectDate(e.target.value)} className="h-9 rounded-lg border border-gray-200 px-2 text-sm bg-white" />
                      <Button size="sm" onClick={() => affecter(t)} disabled={busy}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Affecter'}</Button>
                      <Button size="sm" variant="ghost" onClick={() => setAffectFor(null)}>Annuler</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 pt-0.5">
                    <Link href="/messages" className="flex-1">
                      <Button variant="outline" size="sm" className="w-full gap-1.5"><MessageSquare className="w-3.5 h-3.5" /> Discussion</Button>
                    </Link>
                    <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={() => { setAffectFor(t.id); setAffectProj(t.project_id || '') }}>
                      <HardHat className="w-3.5 h-3.5" /> Affecter
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
