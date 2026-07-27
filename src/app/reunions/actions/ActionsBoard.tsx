'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ListChecks, CalendarClock, CalendarPlus, HardHat, Flag, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import { employeeInitials } from '@/lib/equipe'
import ReunionsTabs from '../ReunionsTabs'
import DatePicker from '../DatePicker'
import { updateAction, assignActionToPlanning } from '../actions'

type EmployeeLite = { id: string; full_name: string; color: string }
type Row = {
  id: string
  title: string
  status: 'todo' | 'doing' | 'done'
  priority: 'low' | 'normal' | 'high'
  due_date: string | null
  employee_id: string | null
  project_id: string | null
  meetings: { id: string; title: string; occurred_at: string; status: string } | null
  employees: EmployeeLite | null
  projects: { id: string; title: string } | null
}

const COLS: { key: Row['status']; label: string; head: string }[] = [
  { key: 'todo', label: 'À faire', head: 'bg-slate-100 text-slate-600' },
  { key: 'doing', label: 'En cours', head: 'bg-blue-100 text-blue-700' },
  { key: 'done', label: 'Fait', head: 'bg-green-100 text-green-700' },
]
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

export default function ActionsBoard({ actions: initial, employees, projects }: { actions: Row[]; employees: EmployeeLite[]; projects: { id: string; title: string }[] }) {
  const router = useRouter()
  const [rows, setRows] = useState<Row[]>(initial)
  const [fEmp, setFEmp] = useState('')
  const [fProj, setFProj] = useState('')
  const [fPeriod, setFPeriod] = useState<'all' | 'overdue' | 'week'>('all')

  const today = todayISO()
  const inWeek = (d: string | null) => { if (!d) return false; const diff = (new Date(d).getTime() - new Date(today).getTime()) / 86400000; return diff >= 0 && diff <= 7 }

  const filtered = useMemo(() => rows.filter((r) => {
    if (fEmp && r.employee_id !== fEmp) return false
    if (fProj && r.project_id !== fProj) return false
    if (fPeriod === 'overdue' && !(r.due_date && r.due_date < today && r.status !== 'done')) return false
    if (fPeriod === 'week' && !inWeek(r.due_date)) return false
    return true
  }), [rows, fEmp, fProj, fPeriod, today])

  const overdueCount = rows.filter((r) => r.due_date && r.due_date < today && r.status !== 'done').length

  async function move(r: Row, status: Row['status']) {
    setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, status } : x)))
    try { await updateAction(r.id, { status }) } catch { toast.error('Statut non enregistré') }
  }
  async function toPlanning(r: Row, date: string) {
    try {
      await assignActionToPlanning(r.id, date)
      setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, status: 'doing' } : x)))
      toast.success('Ajouté au planning')
    } catch (e: any) { toast.error(e?.message || 'Impossible') }
  }

  return (
    <div className="w-full pb-10">
      <ReunionsTabs />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><ListChecks className="size-6 text-orange-600" /> Actions</h1>
          <p className="mt-1 text-sm text-slate-500">
            Toutes les actions issues des réunions. {overdueCount > 0 && <span className="font-medium text-red-600">{overdueCount} en retard.</span>}
          </p>
        </div>
      </div>

      {/* Filtres */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select value={fEmp} onChange={(e) => setFEmp(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm">
          <option value="">Tous les salariés</option>
          {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
        </select>
        <select value={fProj} onChange={(e) => setFProj(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm">
          <option value="">Tous les chantiers</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
        <div className="inline-flex overflow-hidden rounded-lg border border-slate-200">
          {([['all', 'Toutes'], ['week', 'Cette semaine'], ['overdue', 'En retard']] as const).map(([v, l]) => (
            <button key={v} onClick={() => setFPeriod(v)} className={`px-3 py-1.5 text-sm transition ${fPeriod === v ? 'bg-orange-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>{l}</button>
          ))}
        </div>
        {(fEmp || fProj || fPeriod !== 'all') && <button onClick={() => { setFEmp(''); setFProj(''); setFPeriod('all') }} className="text-sm text-slate-400 hover:text-slate-600">Réinitialiser</button>}
      </div>

      {/* Colonnes */}
      <div className="grid gap-4 md:grid-cols-3">
        {COLS.map((col) => {
          const items = filtered.filter((r) => r.status === col.key)
          return (
            <div key={col.key} className="rounded-2xl bg-slate-50/70 p-3">
              <div className="mb-3 flex items-center justify-between px-1">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${col.head}`}>{col.label}</span>
                <span className="text-xs font-medium text-slate-400">{items.length}</span>
              </div>
              <div className="space-y-2.5">
                {items.length === 0 && <p className="px-1 py-6 text-center text-xs text-slate-400">—</p>}
                {items.map((r) => {
                  const overdue = r.due_date && r.due_date < today && r.status !== 'done'
                  return (
                    <div key={r.id} className={`rounded-xl border bg-white p-3 shadow-sm ${overdue ? 'border-red-200' : 'border-slate-200'}`}>
                      <div className="flex items-start gap-2">
                        <span className={`mt-1 size-2 shrink-0 rounded-full ${r.priority === 'high' ? 'bg-red-500' : r.priority === 'low' ? 'bg-slate-300' : 'bg-blue-500'}`} />
                        <p className="text-sm font-medium leading-snug text-slate-800">{r.title}</p>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        {r.employees && <span className="inline-flex items-center gap-1"><span className="flex size-4 items-center justify-center rounded-full text-[8px] font-bold text-white" style={{ background: r.employees.color }}>{employeeInitials(r.employees.full_name)}</span>{r.employees.full_name}</span>}
                        {r.projects && <span className="inline-flex items-center gap-1"><HardHat className="size-3" />{r.projects.title}</span>}
                        {r.due_date && <span className={`inline-flex items-center gap-1 ${overdue ? 'font-medium text-red-600' : ''}`}><CalendarClock className="size-3" />{new Date(r.due_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</span>}
                        {r.priority === 'high' && <span className="inline-flex items-center gap-0.5 text-red-500"><Flag className="size-3" /></span>}
                      </div>
                      {r.meetings && (
                        <Link href={`/reunions/${r.meetings.id}`} className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-orange-600">
                          {r.meetings.title} <ArrowRight className="size-3" />
                        </Link>
                      )}
                      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-slate-50 pt-2">
                        <select value={r.status} onChange={(e) => move(r, e.target.value as Row['status'])} className="h-7 rounded-md border border-slate-200 bg-white px-1.5 text-xs text-slate-600">
                          <option value="todo">À faire</option>
                          <option value="doing">En cours</option>
                          <option value="done">Fait</option>
                        </select>
                        {r.employee_id && r.project_id && (
                          <div title="Ajouter au planning">
                            <DatePicker value={null} placeholder="→ Planning" onChange={(v) => { if (v) toPlanning(r, v) }} />
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
