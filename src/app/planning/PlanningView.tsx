'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, CalendarDays, HardHat, Users2, X, AlertTriangle, UserCheck } from 'lucide-react'
import { employeeInitials } from '@/lib/equipe'

export type PlanningViewMode = 'jour' | 'semaine' | 'mois'
type ProjectRow = { id: string; title: string; status: string; address?: string | null }
type EmployeeRow = { id: string; full_name: string; color: string }
type AssignmentRow = { id: string; employee_id: string; project_id: string; date: string }

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

const fmtShort = (iso: string) => { const [, m, d] = iso.split('-'); return `${d}/${m}` }
const fmtLong = (iso: string) => {
  const dt = new Date(iso + 'T00:00:00')
  return `${['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'][dt.getDay()]} ${dt.getDate()} ${MONTHS[dt.getMonth()]}`
}

export default function PlanningView({
  view, days, anchor, prevDate, nextDate, projects, employees, assignments,
}: {
  view: PlanningViewMode; days: string[]; anchor: string; prevDate: string; nextDate: string
  projects: ProjectRow[]; employees: EmployeeRow[]; assignments: AssignmentRow[]
}) {
  const router = useRouter()
  const [items, setItems] = useState<AssignmentRow[]>(assignments)
  const [busy, setBusy] = useState(false)

  const empById = useMemo(() => new Map(employees.map(e => [e.id, e])), [employees])
  const cellMap = useMemo(() => {
    const m = new Map<string, AssignmentRow[]>()
    for (const a of items) { const k = `${a.project_id}|${a.date}`; if (!m.has(k)) m.set(k, []); m.get(k)!.push(a) }
    return m
  }, [items])
  const conflictByDay = useMemo(() => {
    const c = new Map<string, number>()
    for (const a of items) { const k = `${a.employee_id}|${a.date}`; c.set(k, (c.get(k) || 0) + 1) }
    return c
  }, [items])
  const countByDate = useMemo(() => {
    const c = new Map<string, number>()
    for (const a of items) c.set(a.date, (c.get(a.date) || 0) + 1)
    return c
  }, [items])

  const todayIso = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })()
  const daySet = useMemo(() => new Set(days), [days])

  // Indicateurs (§11.2)
  const nbConflits = useMemo(() => [...conflictByDay].filter(([k, n]) => n > 1 && daySet.has(k.split('|')[1])).length, [conflictByDay, daySet])
  const sansEquipe = useMemo(() => projects.filter(p => !days.some(d => (cellMap.get(`${p.id}|${d}`) || []).length > 0)), [projects, days, cellMap])

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

  // Chip salarié affecté
  const Chip = ({ a, date }: { a: AssignmentRow; date: string }) => {
    const e = empById.get(a.employee_id)
    if (!e) return null
    const conflict = (conflictByDay.get(`${a.employee_id}|${date}`) || 0) > 1
    return (
      <span className={`group inline-flex items-center gap-1 pl-1 pr-1 h-6 rounded-full text-white text-[11px] font-medium ${conflict ? 'ring-2 ring-rose-400' : ''}`}
        style={{ backgroundColor: e.color }} title={`${e.full_name}${conflict ? ' — affecté à plusieurs chantiers ce jour' : ''}`}>
        <span className="grid place-items-center w-4 h-4 rounded-full bg-white/25 text-[9px]">{employeeInitials(e.full_name)}</span>
        <span className="max-w-[60px] truncate">{e.full_name.split(' ')[0]}</span>
        <button onClick={() => removeAssignment(a)} disabled={busy} className="opacity-60 hover:opacity-100"><X className="w-3 h-3" /></button>
      </span>
    )
  }
  const AffectSelect = ({ projectId, date }: { projectId: string; date: string }) => {
    const assignedIds = new Set((cellMap.get(`${projectId}|${date}`) || []).map(a => a.employee_id))
    const available = employees.filter(e => !assignedIds.has(e.id))
    if (!available.length) return null
    return (
      <select value="" disabled={busy}
        onChange={e => { addAssignment(projectId, date, e.target.value); e.target.value = '' }}
        className="mt-1 w-full h-6 text-[11px] rounded border border-dashed border-gray-200 bg-transparent text-gray-400 hover:border-primary hover:text-primary cursor-pointer focus:outline-none">
        <option value="">+ Affecter</option>
        {available.map(e => <option key={e.id} value={e.id} className="text-gray-900">{e.full_name}</option>)}
      </select>
    )
  }

  const switchHref = (v: PlanningViewMode) => `/planning?view=${v}&date=${anchor}`
  const navHref = (d: string) => `/planning?view=${view}&date=${d}`
  const rangeLabel = view === 'jour' ? fmtLong(days[0])
    : view === 'mois' ? `${MONTHS[new Date(days[0] + 'T00:00:00').getMonth()]} ${new Date(days[0] + 'T00:00:00').getFullYear()}`
      : `Semaine du ${fmtShort(days[0])} au ${fmtShort(days[6])}`

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

  // Disponibilités (vue jour) : salariés sans affectation ce jour
  const dispoJour = view === 'jour' ? employees.filter(e => !items.some(a => a.date === days[0] && a.employee_id === e.id)) : []

  return (
    <Wrapper>
      {/* Sélecteur de vue + navigation */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-gray-100">
          {(['jour', 'semaine', 'mois'] as const).map(v => (
            <Link key={v} href={switchHref(v)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${view === v ? 'bg-white text-marine shadow-[var(--shadow-xs)]' : 'text-gray-500 hover:text-gray-800'}`}>
              {v}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Link href={navHref(prevDate)}><Button variant="outline" size="icon-sm"><ChevronLeft className="w-4 h-4" /></Button></Link>
          <span className="inline-flex items-center gap-2 px-3 h-9 rounded-xl bg-white border border-gray-200 text-sm font-medium text-marine capitalize">
            <CalendarDays className="w-4 h-4 text-gray-400" /> {rangeLabel}
          </span>
          <Link href={navHref(nextDate)}><Button variant="outline" size="icon-sm"><ChevronRight className="w-4 h-4" /></Button></Link>
          <Link href={`/planning?view=${view}`}><Button variant="outline" size="sm">Aujourd&apos;hui</Button></Link>
        </div>
      </div>

      {/* Indicateurs (§11.2) */}
      <div className="flex flex-wrap gap-2">
        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${nbConflits > 0 ? 'bg-rose-100 text-rose-700' : 'bg-gray-100 text-gray-500'}`}>
          <AlertTriangle className="w-3.5 h-3.5" /> {nbConflits} conflit{nbConflits > 1 ? 's' : ''} d&apos;affectation
        </span>
        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${sansEquipe.length > 0 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
          <HardHat className="w-3.5 h-3.5" /> {sansEquipe.length} chantier{sansEquipe.length > 1 ? 's' : ''} sans équipe
        </span>
      </div>

      {projects.length === 0 ? (
        <EmptyState icon={<HardHat className="w-12 h-12 mx-auto mb-3 text-gray-300" />}
          title="Aucun chantier actif à planifier"
          desc="Créez un chantier pour commencer à affecter votre équipe."
          cta={<Link href="/chantiers/nouveau"><Button>Nouveau chantier</Button></Link>} />
      ) : view === 'semaine' ? (
        /* ───────── Vue semaine ───────── */
        <Card className="border border-gray-200/80 overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-[760px]">
              <div className="grid" style={{ gridTemplateColumns: '180px repeat(7, 1fr)' }}>
                <div className="p-3 text-xs font-semibold uppercase tracking-wider text-gray-400 border-b border-gray-100">Chantier</div>
                {days.map((d, i) => (
                  <div key={d} className={`p-3 text-center border-b border-l border-gray-100 ${d === todayIso ? 'bg-accent' : ''}`}>
                    <div className="text-xs font-semibold text-marine">{DAY_LABELS[i]}</div>
                    <div className="text-[11px] text-gray-400">{fmtShort(d)}</div>
                  </div>
                ))}
              </div>
              {projects.map(p => (
                <div key={p.id} className="grid border-b border-gray-100 last:border-0" style={{ gridTemplateColumns: '180px repeat(7, 1fr)' }}>
                  <div className="p-3 flex items-center gap-2 min-w-0">
                    <HardHat className="w-4 h-4 text-gray-300 flex-shrink-0" />
                    <Link href={`/chantiers/${p.id}`} className="text-sm font-medium text-gray-800 truncate hover:text-primary">{p.title}</Link>
                  </div>
                  {days.map(d => (
                    <div key={d} className={`p-2 border-l border-gray-100 min-h-[64px] ${d === todayIso ? 'bg-[#FFF7F0]' : ''}`}>
                      <div className="flex flex-wrap gap-1">
                        {(cellMap.get(`${p.id}|${d}`) || []).map(a => <Chip key={a.id} a={a} date={d} />)}
                      </div>
                      <AffectSelect projectId={p.id} date={d} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </Card>
      ) : view === 'jour' ? (
        /* ───────── Vue jour ───────── */
        <div className="space-y-4">
          <div className="grid gap-3">
            {projects.map(p => (
              <Card key={p.id} className="border border-gray-200/80">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <HardHat className="w-4 h-4 text-gray-300 flex-shrink-0" />
                    <Link href={`/chantiers/${p.id}`} className="text-sm font-semibold text-gray-800 hover:text-primary truncate">{p.title}</Link>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(cellMap.get(`${p.id}|${days[0]}`) || []).map(a => <Chip key={a.id} a={a} date={days[0]} />)}
                  </div>
                  <div className="max-w-[220px]"><AffectSelect projectId={p.id} date={days[0]} /></div>
                </CardContent>
              </Card>
            ))}
          </div>
          {/* Disponibilités (§11.1) */}
          <Card className="border border-gray-200/80">
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold text-gray-500 mb-2 flex items-center gap-2"><UserCheck className="w-4 h-4 text-emerald-500" /> Disponibles ce jour ({dispoJour.length})</h3>
              {dispoJour.length === 0 ? <p className="text-sm text-gray-400">Tout le monde est affecté.</p> : (
                <div className="flex flex-wrap gap-1.5">
                  {dispoJour.map(e => (
                    <span key={e.id} className="inline-flex items-center gap-1.5 rounded-full bg-gray-50 border border-gray-200 pl-1 pr-2.5 py-0.5 text-xs">
                      <span className="grid place-items-center w-5 h-5 rounded-full text-white text-[9px]" style={{ backgroundColor: e.color }}>{employeeInitials(e.full_name)}</span>
                      {e.full_name}
                    </span>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        /* ───────── Vue mois ───────── */
        <Card className="border border-gray-200/80 overflow-hidden">
          <div className="grid grid-cols-7 text-center border-b border-gray-100">
            {DAY_LABELS.map(l => <div key={l} className="p-2 text-xs font-semibold text-gray-400">{l}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {Array.from({ length: (new Date(days[0] + 'T00:00:00').getDay() + 6) % 7 }).map((_, i) => <div key={`b${i}`} className="min-h-[72px] border-b border-l border-gray-50" />)}
            {days.map(d => {
              const n = countByDate.get(d) || 0
              return (
                <Link key={d} href={`/planning?view=jour&date=${d}`} className={`min-h-[72px] border-b border-l border-gray-50 p-1.5 hover:bg-gray-50 transition-colors ${d === todayIso ? 'bg-accent' : ''}`}>
                  <div className="text-xs font-medium text-gray-600">{Number(d.split('-')[2])}</div>
                  {n > 0 && <div className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold"><Users2 className="w-3 h-3" />{n}</div>}
                </Link>
              )
            })}
          </div>
        </Card>
      )}

      <p className="text-xs text-gray-400">
        Un salarié encadré en rouge est sur plusieurs chantiers le même jour. Affectation des véhicules, absences et envoi du planning aux salariés : à venir.
      </p>
    </Wrapper>
  )
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-5 animate-fade-up">
      <div>
        <h1 className="text-2xl md:text-[26px] font-bold font-heading text-marine">Planning</h1>
        <p className="text-gray-500 mt-1 text-sm">Qui va où, quand, sur quel chantier — jour, semaine ou mois.</p>
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
