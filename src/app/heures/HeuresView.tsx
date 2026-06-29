'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, CalendarDays, Clock, Plus, Users2 } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { employeeInitials } from '@/lib/equipe'

type EmployeeRow = { id: string; full_name: string; color: string; hourly_cost: number | null }
type ProjectRow = { id: string; title: string; status: string }
type AssignmentRow = { employee_id: string; project_id: string; date: string }
type EntryRow = { id: string; employee_id: string; project_id: string | null; date: string; hours: number }

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const fmtShort = (iso: string) => { const [, m, d] = iso.split('-'); return `${d}/${m}` }
const keyOf = (e: string, p: string | null, d: string) => `${e}|${p || ''}|${d}`

export default function HeuresView({
  days, prevWeek, nextWeek, employees, projects, assignments, entries,
}: {
  days: string[]; prevWeek: string; nextWeek: string
  employees: EmployeeRow[]; projects: ProjectRow[]; assignments: AssignmentRow[]; entries: EntryRow[]
}) {
  const router = useRouter()
  const empById = useMemo(() => new Map(employees.map(e => [e.id, e])), [employees])
  const projById = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects])

  const [hours, setHours] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {}
    for (const e of entries) m[keyOf(e.employee_id, e.project_id, e.date)] = String(e.hours)
    return m
  })
  const [ids, setIds] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {}
    for (const e of entries) m[keyOf(e.employee_id, e.project_id, e.date)] = e.id
    return m
  })
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [addEmp, setAddEmp] = useState(''); const [addProj, setAddProj] = useState(''); const [addDay, setAddDay] = useState(days[0]); const [addHours, setAddHours] = useState('')

  // Lignes = union (affectations planning) ∪ (heures saisies)
  const rowsByDay = useMemo(() => {
    const seen = new Set<string>()
    const rows: { key: string; employee_id: string; project_id: string | null; date: string }[] = []
    const push = (employee_id: string, project_id: string | null, date: string) => {
      const k = keyOf(employee_id, project_id, date)
      if (seen.has(k)) return
      seen.add(k); rows.push({ key: k, employee_id, project_id, date })
    }
    for (const a of assignments) push(a.employee_id, a.project_id, a.date)
    for (const e of entries) push(e.employee_id, e.project_id, e.date)
    const byDay = new Map<string, typeof rows>()
    for (const d of days) byDay.set(d, [])
    for (const r of rows) {
      if (!byDay.has(r.date)) byDay.set(r.date, [])
      byDay.get(r.date)!.push(r)
    }
    for (const [, arr] of byDay) arr.sort((a, b) => (empById.get(a.employee_id)?.full_name || '').localeCompare(empById.get(b.employee_id)?.full_name || ''))
    return byDay
  }, [assignments, entries, days, empById])

  const num = (v: string) => Number((v || '').replace(',', '.')) || 0

  async function saveCell(employee_id: string, project_id: string | null, date: string) {
    const k = keyOf(employee_id, project_id, date)
    const h = num(hours[k])
    setSavingKey(k)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSavingKey(null); return }

    if (h <= 0) {
      if (ids[k]) {
        await supabase.from('time_entries').delete().eq('id', ids[k])
        setIds(p => { const n = { ...p }; delete n[k]; return n })
      }
      setSavingKey(null); return
    }
    const { data, error } = await supabase.from('time_entries')
      .upsert({ user_id: user.id, employee_id, project_id, date, hours: h, status: 'valide' }, { onConflict: 'employee_id,project_id,date' })
      .select('id').single()
    setSavingKey(null)
    if (error || !data) { toast.error('Erreur lors de l\'enregistrement'); return }
    setIds(p => ({ ...p, [k]: data.id }))
  }

  async function handleAdd() {
    if (!addEmp) { toast.error('Choisissez un salarié'); return }
    if (num(addHours) <= 0) { toast.error('Indiquez un nombre d\'heures'); return }
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase.from('time_entries')
      .upsert({ user_id: user.id, employee_id: addEmp, project_id: addProj || null, date: addDay, hours: num(addHours), status: 'valide' }, { onConflict: 'employee_id,project_id,date' })
    if (error) { toast.error('Erreur'); return }
    toast.success('Heures ajoutées')
    setShowAdd(false); setAddEmp(''); setAddProj(''); setAddHours('')
    router.refresh()
  }

  // Totaux (à partir de l'état courant)
  const totals = useMemo(() => {
    let grand = 0, cost = 0
    const perEmp = new Map<string, number>(); const perProj = new Map<string, number>()
    for (const [k, v] of Object.entries(hours)) {
      const h = num(v); if (h <= 0) continue
      const [e, p] = k.split('|')
      grand += h
      perEmp.set(e, (perEmp.get(e) || 0) + h)
      if (p) perProj.set(p, (perProj.get(p) || 0) + h)
      const hc = empById.get(e)?.hourly_cost
      if (hc) cost += h * Number(hc)
    }
    return { grand, cost, perEmp, perProj }
  }, [hours, empById])

  const weekLabel = `Semaine du ${fmtShort(days[0])} au ${fmtShort(days[6])}`

  if (employees.length === 0) {
    return (
      <Shell>
        <Card><CardContent className="py-12 text-center text-gray-500">
          <Users2 className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="font-medium">Ajoutez d&apos;abord votre équipe</p>
          <p className="text-sm mt-1">Les heures se déclarent par salarié. Créez votre équipe pour commencer.</p>
          <Link href="/equipe" className="mt-4 inline-block"><Button>Gérer l&apos;équipe</Button></Link>
        </CardContent></Card>
      </Shell>
    )
  }

  return (
    <Shell>
      {/* Nav semaine */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Link href={`/heures?week=${prevWeek}`}><Button variant="outline" size="icon-sm"><ChevronLeft className="w-4 h-4" /></Button></Link>
          <span className="inline-flex items-center gap-2 px-3 h-9 rounded-xl bg-white border border-gray-200 text-sm font-medium text-marine">
            <CalendarDays className="w-4 h-4 text-gray-400" /> {weekLabel}
          </span>
          <Link href={`/heures?week=${nextWeek}`}><Button variant="outline" size="icon-sm"><ChevronRight className="w-4 h-4" /></Button></Link>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/heures"><Button variant="outline" size="sm">Cette semaine</Button></Link>
          <Button size="sm" className="gap-1" onClick={() => setShowAdd(v => !v)}><Plus className="w-4 h-4" /> Heures</Button>
        </div>
      </div>

      {/* Synthèse */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Mini label="Total heures" value={`${totals.grand.toFixed(1).replace('.0', '')} h`} tile="bg-blue-100 text-blue-600" icon={<Clock className="w-4 h-4" />} />
        <Mini label="Masse salariale est." value={formatCurrency(totals.cost)} tile="bg-violet-100 text-violet-600" icon={<Users2 className="w-4 h-4" />} />
        <Mini label="Salariés actifs" value={String(employees.length)} tile="bg-emerald-100 text-emerald-600" icon={<Users2 className="w-4 h-4" />} />
      </div>

      {/* Ajout manuel */}
      {showAdd && (
        <Card><CardContent className="p-4 grid sm:grid-cols-5 gap-3 items-end">
          <div className="space-y-1"><label className="text-xs text-gray-500">Salarié</label>
            <select value={addEmp} onChange={e => setAddEmp(e.target.value)} className={sel}><option value="">—</option>{employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}</select></div>
          <div className="space-y-1"><label className="text-xs text-gray-500">Chantier</label>
            <select value={addProj} onChange={e => setAddProj(e.target.value)} className={sel}><option value="">— Aucun —</option>{projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select></div>
          <div className="space-y-1"><label className="text-xs text-gray-500">Jour</label>
            <select value={addDay} onChange={e => setAddDay(e.target.value)} className={sel}>{days.map((d, i) => <option key={d} value={d}>{DAY_LABELS[i]} {fmtShort(d)}</option>)}</select></div>
          <div className="space-y-1"><label className="text-xs text-gray-500">Heures</label>
            <Input type="number" step="0.5" value={addHours} onChange={e => setAddHours(e.target.value)} /></div>
          <Button onClick={handleAdd}>Ajouter</Button>
        </CardContent></Card>
      )}

      {/* Grille par jour */}
      <Card className="border border-gray-200/80">
        <CardContent className="p-0 divide-y divide-gray-100">
          {days.map((d, i) => {
            const rows = rowsByDay.get(d) || []
            const dayTotal = rows.reduce((s, r) => s + num(hours[r.key]), 0)
            return (
              <div key={d} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-semibold text-marine">{DAY_LABELS[i]} {fmtShort(d)}</div>
                  {dayTotal > 0 && <div className="text-xs text-gray-500">{dayTotal.toFixed(1).replace('.0', '')} h</div>}
                </div>
                {rows.length === 0 ? (
                  <p className="text-xs text-gray-400">Aucune affectation ni heure ce jour.</p>
                ) : (
                  <div className="space-y-1.5">
                    {rows.map(r => {
                      const e = empById.get(r.employee_id)
                      const p = r.project_id ? projById.get(r.project_id) : null
                      if (!e) return null
                      return (
                        <div key={r.key} className="flex items-center gap-3">
                          <span className="grid place-items-center w-7 h-7 rounded-full text-white text-[10px] font-bold flex-shrink-0" style={{ backgroundColor: e.color }}>{employeeInitials(e.full_name)}</span>
                          <span className="text-sm text-gray-800 w-32 truncate">{e.full_name}</span>
                          <span className="text-xs text-gray-400 flex-1 truncate">{p?.title || 'Sans chantier'}</span>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <Input type="number" step="0.5" min="0" value={hours[r.key] || ''}
                              onChange={ev => setHours(prev => ({ ...prev, [r.key]: ev.target.value }))}
                              onBlur={() => saveCell(r.employee_id, r.project_id, r.date)}
                              className={`w-16 h-8 text-sm text-right ${savingKey === r.key ? 'opacity-50' : ''}`} placeholder="0" />
                            <span className="text-xs text-gray-400">h</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* Totaux par salarié / chantier */}
      {totals.grand > 0 && (
        <div className="grid md:grid-cols-2 gap-3">
          <Card className="border border-gray-200/80"><CardContent className="p-4">
            <div className="text-xs font-medium text-gray-400 mb-2">Heures par salarié (semaine)</div>
            <div className="space-y-1.5">
              {[...totals.perEmp.entries()].sort((a, b) => b[1] - a[1]).map(([id, h]) => {
                const e = empById.get(id); if (!e) return null
                const cost = e.hourly_cost ? h * Number(e.hourly_cost) : 0
                return (
                  <div key={id} className="flex items-center gap-2 text-sm">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: e.color }} />
                    <span className="flex-1 truncate text-gray-700">{e.full_name}</span>
                    <span className="font-medium tabular-nums">{h.toFixed(1).replace('.0', '')} h</span>
                    {cost > 0 && <span className="text-gray-400 tabular-nums w-20 text-right">{formatCurrency(cost)}</span>}
                  </div>
                )
              })}
            </div>
          </CardContent></Card>
          <Card className="border border-gray-200/80"><CardContent className="p-4">
            <div className="text-xs font-medium text-gray-400 mb-2">Heures par chantier (semaine)</div>
            <div className="space-y-1.5">
              {[...totals.perProj.entries()].sort((a, b) => b[1] - a[1]).map(([id, h]) => {
                const p = projById.get(id)
                return (
                  <div key={id} className="flex items-center gap-2 text-sm">
                    <Link href={`/chantiers/${id}`} className="flex-1 truncate text-gray-700 hover:text-primary">{p?.title || 'Chantier'}</Link>
                    <span className="font-medium tabular-nums">{h.toFixed(1).replace('.0', '')} h</span>
                  </div>
                )
              })}
            </div>
          </CardContent></Card>
        </div>
      )}
    </Shell>
  )
}

const sel = 'w-full h-10 rounded-md border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary'

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-5 animate-fade-up">
      <div>
        <h1 className="text-2xl md:text-[26px] font-bold font-heading text-marine">Heures</h1>
        <p className="text-gray-500 mt-1 text-sm">Saisissez les heures de votre équipe, reliées au planning et aux chantiers.</p>
      </div>
      {children}
    </div>
  )
}

function Mini({ label, value, tile, icon }: { label: string; value: string; tile: string; icon: React.ReactNode }) {
  return (
    <Card className="border border-gray-200/80"><CardContent className="p-3">
      <span className={`grid place-items-center w-8 h-8 rounded-lg ${tile}`}>{icon}</span>
      <div className="text-xl font-bold text-[#0F172A] mt-2 leading-none">{value}</div>
      <div className="text-[11px] text-gray-500 mt-1">{label}</div>
    </CardContent></Card>
  )
}
