'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, CalendarDays, HardHat, Users2, X } from 'lucide-react'
import { employeeInitials } from '@/lib/equipe'

type ProjectRow = { id: string; title: string; status: string }
type EmployeeRow = { id: string; full_name: string; color: string }
type AssignmentRow = { id: string; employee_id: string; project_id: string; date: string }

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

function fmtShort(iso: string) {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

export default function PlanningView({
  days, prevWeek, nextWeek, projects, employees, assignments,
}: {
  days: string[]; prevWeek: string; nextWeek: string
  projects: ProjectRow[]; employees: EmployeeRow[]; assignments: AssignmentRow[]
}) {
  const router = useRouter()
  const [items, setItems] = useState<AssignmentRow[]>(assignments)
  const [busy, setBusy] = useState(false)

  const empById = useMemo(() => new Map(employees.map(e => [e.id, e])), [employees])

  // map "projectId|date" -> assignments
  const cellMap = useMemo(() => {
    const m = new Map<string, AssignmentRow[]>()
    for (const a of items) {
      const k = `${a.project_id}|${a.date}`
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(a)
    }
    return m
  }, [items])

  // employés affectés à >1 chantier le même jour (conflit)
  const conflictByDay = useMemo(() => {
    const count = new Map<string, number>() // `${empId}|${date}` -> n
    for (const a of items) {
      const k = `${a.employee_id}|${a.date}`
      count.set(k, (count.get(k) || 0) + 1)
    }
    return count
  }, [items])

  const todayIso = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })()

  async function addAssignment(projectId: string, date: string, employeeId: string) {
    if (!employeeId) return
    setBusy(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setBusy(false); return }
    const { data, error } = await supabase.from('assignments')
      .insert({ user_id: user.id, project_id: projectId, date, employee_id: employeeId })
      .select('id,employee_id,project_id,date').single()
    setBusy(false)
    if (error || !data) { toast.error('Erreur lors de l\'affectation'); return }
    setItems(prev => [...prev, data])
    router.refresh()
  }

  async function removeAssignment(a: AssignmentRow) {
    setBusy(true)
    const supabase = createClient()
    const { error } = await supabase.from('assignments').delete().eq('id', a.id)
    setBusy(false)
    if (error) { toast.error('Erreur'); return }
    setItems(prev => prev.filter(x => x.id !== a.id))
    router.refresh()
  }

  const weekLabel = `Semaine du ${fmtShort(days[0])} au ${fmtShort(days[6])}`

  if (employees.length === 0) {
    return (
      <Wrapper>
        <EmptyState icon={<Users2 className="w-12 h-12 mx-auto mb-3 text-gray-300" />}
          title="Ajoutez d'abord votre équipe"
          desc="Le planning affecte vos salariés aux chantiers. Commencez par créer votre équipe."
          cta={<Link href="/equipe"><Button>Gérer l&apos;équipe</Button></Link>} />
      </Wrapper>
    )
  }

  return (
    <Wrapper>
      {/* Navigation semaine */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Link href={`/planning?week=${prevWeek}`}><Button variant="outline" size="icon-sm"><ChevronLeft className="w-4 h-4" /></Button></Link>
          <span className="inline-flex items-center gap-2 px-3 h-9 rounded-xl bg-white border border-gray-200 text-sm font-medium text-marine capitalize">
            <CalendarDays className="w-4 h-4 text-gray-400" /> {weekLabel}
          </span>
          <Link href={`/planning?week=${nextWeek}`}><Button variant="outline" size="icon-sm"><ChevronRight className="w-4 h-4" /></Button></Link>
        </div>
        <Link href="/planning"><Button variant="outline" size="sm">Aujourd&apos;hui</Button></Link>
      </div>

      {projects.length === 0 ? (
        <EmptyState icon={<HardHat className="w-12 h-12 mx-auto mb-3 text-gray-300" />}
          title="Aucun chantier actif à planifier"
          desc="Créez un chantier pour commencer à affecter votre équipe."
          cta={<Link href="/chantiers/nouveau"><Button>Nouveau chantier</Button></Link>} />
      ) : (
        <Card className="border border-gray-200/80 overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-[760px]">
              {/* En-tête jours */}
              <div className="grid" style={{ gridTemplateColumns: '180px repeat(7, 1fr)' }}>
                <div className="p-3 text-xs font-semibold uppercase tracking-wider text-gray-400 border-b border-gray-100">Chantier</div>
                {days.map((d, i) => (
                  <div key={d} className={`p-3 text-center border-b border-l border-gray-100 ${d === todayIso ? 'bg-[#FFF1E6]' : ''}`}>
                    <div className="text-xs font-semibold text-marine">{DAY_LABELS[i]}</div>
                    <div className="text-[11px] text-gray-400">{fmtShort(d)}</div>
                  </div>
                ))}
              </div>

              {/* Lignes chantiers */}
              {projects.map(p => (
                <div key={p.id} className="grid border-b border-gray-100 last:border-0" style={{ gridTemplateColumns: '180px repeat(7, 1fr)' }}>
                  <div className="p-3 flex items-center gap-2 min-w-0">
                    <HardHat className="w-4 h-4 text-gray-300 flex-shrink-0" />
                    <Link href={`/chantiers/${p.id}`} className="text-sm font-medium text-gray-800 truncate hover:text-[#FF6A00]">{p.title}</Link>
                  </div>
                  {days.map(d => {
                    const cell = cellMap.get(`${p.id}|${d}`) || []
                    const assignedIds = new Set(cell.map(a => a.employee_id))
                    const available = employees.filter(e => !assignedIds.has(e.id))
                    return (
                      <div key={d} className={`p-2 border-l border-gray-100 min-h-[64px] ${d === todayIso ? 'bg-[#FFF7F0]' : ''}`}>
                        <div className="flex flex-wrap gap-1">
                          {cell.map(a => {
                            const e = empById.get(a.employee_id)
                            if (!e) return null
                            const conflict = (conflictByDay.get(`${a.employee_id}|${d}`) || 0) > 1
                            return (
                              <span key={a.id}
                                className={`group inline-flex items-center gap-1 pl-1 pr-1 h-6 rounded-full text-white text-[11px] font-medium ${conflict ? 'ring-2 ring-rose-400' : ''}`}
                                style={{ backgroundColor: e.color }}
                                title={`${e.full_name}${conflict ? ' — affecté à plusieurs chantiers ce jour' : ''}`}>
                                <span className="grid place-items-center w-4 h-4 rounded-full bg-white/25 text-[9px]">{employeeInitials(e.full_name)}</span>
                                <span className="max-w-[60px] truncate">{e.full_name.split(' ')[0]}</span>
                                <button onClick={() => removeAssignment(a)} disabled={busy}
                                  className="opacity-60 hover:opacity-100"><X className="w-3 h-3" /></button>
                              </span>
                            )
                          })}
                        </div>
                        {available.length > 0 && (
                          <select
                            value="" disabled={busy}
                            onChange={e => { addAssignment(p.id, d, e.target.value); e.target.value = '' }}
                            className="mt-1 w-full h-6 text-[11px] rounded border border-dashed border-gray-200 bg-transparent text-gray-400 hover:border-[#FF6A00] hover:text-[#FF6A00] cursor-pointer focus:outline-none">
                            <option value="">+ Affecter</option>
                            {available.map(e => <option key={e.id} value={e.id} className="text-gray-900">{e.full_name}</option>)}
                          </select>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      <p className="text-xs text-gray-400">Astuce : un salarié encadré en rouge est affecté à plusieurs chantiers le même jour.</p>
    </Wrapper>
  )
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-5 animate-fade-up">
      <div>
        <h1 className="text-2xl md:text-[26px] font-bold font-heading text-marine">Planning</h1>
        <p className="text-gray-500 mt-1 text-sm">Affectez votre équipe aux chantiers, jour par jour.</p>
      </div>
      {children}
    </div>
  )
}

function EmptyState({ icon, title, desc, cta }: { icon: React.ReactNode; title: string; desc: string; cta: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="py-12 text-center text-gray-500">
        {icon}
        <p className="font-medium">{title}</p>
        <p className="text-sm mt-1">{desc}</p>
        <div className="mt-4">{cta}</div>
      </CardContent>
    </Card>
  )
}
