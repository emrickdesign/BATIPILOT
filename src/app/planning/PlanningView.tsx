'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, CalendarDays, HardHat, Users2, X, AlertTriangle, UserCheck, ArrowRight, CloudRain, CalendarClock, CalendarOff, UserPlus, Check, Clock3 } from 'lucide-react'
import { employeeInitials } from '@/lib/equipe'
import DottedPage from '@/components/PageDottedBg'
import DottedCard from '@/components/charts/DottedCard'
import { BREAK_START, BREAK_END, workedHours, formatRange } from '@/lib/horaires'
import type { DayWeather } from '@/lib/meteo'
import type { WeatherAlert } from './page'

export type PlanningViewMode = 'jour' | 'semaine' | 'mois'
type ProjectRow = { id: string; title: string; status: string; address?: string | null; is_outdoor?: boolean | null }
type EmployeeRow = { id: string; full_name: string; color: string }
type AssignmentRow = { id: string; employee_id: string; project_id: string; date: string; start_hour: number; end_hour: number }

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

// Frise horaire de la vue jour (heures affichées + affectation par défaut = journée complète).
const DAY_START = 6
const DAY_END = 20
const TOTAL_H = DAY_END - DAY_START
// Journée type : 8h→17h avec pause déjeuner 12h→13h ⇒ 7 h travaillées.
const DEFAULT_START = 8
const DEFAULT_END = 17
const AXIS = Array.from({ length: TOTAL_H + 1 }, (_, i) => DAY_START + i) // toutes les heures 6h…20h

// Gabarit de la vue semaine : chaque case est dimensionnée pour 6 salariés (2 colonnes × 3 lignes).
const WEEK_COL = 200                 // largeur de la colonne « Chantier »
const WEEK_SLOTS_H = 3 * 28 + 2 * 4  // 3 pastilles de 28 px + 2 gouttières de 4 px
const WEEK_CELL_H = WEEK_SLOTS_H + 62 // + barre météo + bouton « Affecter »

const fmtShort = (iso: string) => { const [, m, d] = iso.split('-'); return `${d}/${m}` }
const fmtLong = (iso: string) => {
  const dt = new Date(iso + 'T00:00:00')
  return `${['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'][dt.getDay()]} ${dt.getDate()} ${MONTHS[dt.getMonth()]}`
}

// Barre d'un salarié sur la frise du jour : étirable (poignées gauche/droite) et déplaçable.
function EmployeeBar({ emp, a, busy, onChange, onRemove }: {
  emp: EmployeeRow; a: AssignmentRow; busy: boolean
  onChange: (s: number, e: number) => void; onRemove: () => void
}) {
  const [range, setRange] = useState({ s: a.start_hour, e: a.end_hour })
  useEffect(() => { setRange({ s: a.start_hour, e: a.end_hour }) }, [a.start_hour, a.end_hour])
  const drag = useRef<{ mode: 'move' | 'start' | 'end'; x0: number; s0: number; e0: number; w: number; last: { s: number; e: number } } | null>(null)

  function begin(mode: 'move' | 'start' | 'end', ev: React.PointerEvent) {
    ev.preventDefault(); ev.stopPropagation()
    const track = (ev.currentTarget as HTMLElement).closest('[data-track]') as HTMLElement | null
    if (!track) return
    drag.current = { mode, x0: ev.clientX, s0: range.s, e0: range.e, w: track.getBoundingClientRect().width, last: { s: range.s, e: range.e } }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
  }
  function move(ev: PointerEvent) {
    const d = drag.current; if (!d) return
    const dh = Math.round((ev.clientX - d.x0) / d.w * TOTAL_H)
    let s = d.s0, e = d.e0
    if (d.mode === 'move') { const len = d.e0 - d.s0; s = Math.min(Math.max(d.s0 + dh, DAY_START), DAY_END - len); e = s + len }
    else if (d.mode === 'start') { s = Math.min(Math.max(d.s0 + dh, DAY_START), d.e0 - 1) }
    else { e = Math.max(Math.min(d.e0 + dh, DAY_END), d.s0 + 1) }
    d.last = { s, e }
    setRange({ s, e })
  }
  function end() {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', end)
    const d = drag.current; drag.current = null
    if (d && (d.last.s !== a.start_hour || d.last.e !== a.end_hour)) onChange(d.last.s, d.last.e)
  }

  const left = (range.s - DAY_START) / TOTAL_H * 100
  const width = (range.e - range.s) / TOTAL_H * 100
  const heures = workedHours(range.s, range.e)
  // Pause déjeuner : trou visuel dans la barre, positionné en % de la barre elle-même.
  const spanH = range.e - range.s
  const bStart = Math.max(range.s, BREAK_START), bEnd = Math.min(range.e, BREAK_END)
  const showBreak = bEnd > bStart && spanH > 0
  return (
    <div
      className="absolute top-1 bottom-1 rounded-lg flex items-center text-white text-[11px] font-semibold shadow-[0_2px_8px_rgba(0,0,0,0.18)] ring-1 ring-white/40 select-none touch-none"
      style={{ left: `${left}%`, width: `${width}%`, backgroundColor: emp.color }}
    >
      {showBreak && (
        <span
          aria-hidden
          className="absolute top-0 bottom-0 pointer-events-none bg-white/45"
          style={{
            left: `${(bStart - range.s) / spanH * 100}%`,
            width: `${(bEnd - bStart) / spanH * 100}%`,
            backgroundImage: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.55) 0 4px, transparent 4px 8px)',
          }}
          title="Pause déjeuner"
        />
      )}
      <span onPointerDown={e => begin('start', e)} className="absolute left-0 top-0 bottom-0 w-2.5 cursor-ew-resize rounded-l-lg hover:bg-black/20 z-10" title="Étirer le début" />
      <span onPointerDown={e => begin('move', e)} className="relative z-10 flex-1 min-w-0 h-full flex items-center gap-1 pl-3 pr-1 cursor-grab active:cursor-grabbing drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]">
        <span className="truncate">{emp.full_name.split(' ')[0]}</span>
        <span className="opacity-90 whitespace-nowrap hidden sm:inline">· {formatRange(range.s, range.e)} · {heures} h</span>
      </span>
      <button onPointerDown={e => e.stopPropagation()} onClick={onRemove} disabled={busy} className="relative z-10 px-1 mr-1.5 opacity-70 hover:opacity-100" title="Retirer"><X className="w-3 h-3" /></button>
      <span onPointerDown={e => begin('end', e)} className="absolute right-0 top-0 bottom-0 w-2.5 cursor-ew-resize rounded-r-lg hover:bg-black/20 z-10" title="Étirer la fin" />
    </div>
  )
}

// Sélecteur de salarié maison (pas de <select> natif) : bouton pastille + panneau flottant.
// Rendu en portal + position fixed pour ne pas être rogné par les conteneurs à overflow.
function AffectPicker({ available, busy, variant = 'pill', onPick }: {
  available: EmployeeRow[]; busy: boolean; variant?: 'pill' | 'cta'
  onPick: (employeeId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect()
      if (!r) return
      const width = Math.max(r.width, 232)
      const left = Math.min(Math.max(r.left + r.width / 2 - width / 2, 8), window.innerWidth - width - 8)
      const below = window.innerHeight - r.bottom
      const top = below > 260 ? r.bottom + 6 : Math.max(8, r.top - 6 - 260)
      setPos({ top, left, width })
    }
    place()
    const close = () => setOpen(false)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', close, true)
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', close, true) }
  }, [open])

  if (!available.length) return null

  const cta = variant === 'cta'
  return (
    <>
      <button
        ref={btnRef} type="button" disabled={busy} onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox" aria-expanded={open}
        className={cta
          ? `inline-flex items-center gap-2 h-9 pl-3 pr-4 rounded-full bg-gradient-to-b from-[#E5734F] to-[#C14E33] text-white text-[13px] font-semibold border border-white/30 shadow-[0_4px_14px_rgba(193,78,51,0.35)] hover:shadow-[0_6px_18px_rgba(193,78,51,0.45)] hover:-translate-y-px active:translate-y-0 transition-all disabled:opacity-50 ${open ? 'ring-2 ring-[#C14E33]/30' : ''}`
          : `inline-flex items-center gap-1.5 h-7 pl-2 pr-2.5 rounded-full bg-white/80 backdrop-blur-sm border border-dashed border-[#E0B9A6] text-[11px] font-semibold text-[#B0563A] shadow-sm hover:bg-white hover:border-[#C14E33] hover:shadow-[0_3px_10px_rgba(193,78,51,0.22)] hover:-translate-y-px transition-all disabled:opacity-50 ${open ? 'border-[#C14E33] ring-2 ring-[#C14E33]/20' : ''}`}
      >
        <UserPlus className={cta ? 'w-4 h-4' : 'w-3.5 h-3.5'} /> Affecter
      </button>

      {open && pos && typeof document !== 'undefined' && createPortal(
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
          <div
            role="listbox"
            style={{ top: pos.top, left: pos.left, width: pos.width }}
            className="fixed z-[61] rounded-2xl border border-[#EBD9CE] bg-gradient-to-br from-[#FFF9F5] to-[#FCEBE1] shadow-[0_18px_44px_rgba(80,40,20,0.22)] overflow-hidden animate-fade-up"
          >
            <p className="px-3 pt-2.5 pb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#B0563A]/70">
              Qui part sur le chantier ?
            </p>
            <div className="max-h-[248px] overflow-y-auto pb-1.5">
              {available.map(e => (
                <button
                  key={e.id} type="button" role="option" aria-selected={false} disabled={busy}
                  onClick={() => { onPick(e.id); setOpen(false) }}
                  className="group w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-white/80 transition-colors disabled:opacity-50"
                >
                  <span className="grid place-items-center w-7 h-7 rounded-full text-white text-[10px] font-bold ring-2 ring-white shadow-sm flex-shrink-0"
                    style={{ backgroundColor: e.color }}>{employeeInitials(e.full_name)}</span>
                  <span className="flex-1 min-w-0 truncate text-[13px] font-medium text-marine">{e.full_name}</span>
                  <Check className="w-4 h-4 text-[#C14E33] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                </button>
              ))}
            </div>
            <p className="px-3 py-2 border-t border-[#EBD9CE]/80 text-[10px] text-gray-400">
              Journée type {DEFAULT_START}h–{BREAK_START}h · {BREAK_END}h–{DEFAULT_END}h ({workedHours(DEFAULT_START, DEFAULT_END)} h)
            </p>
          </div>
        </>,
        document.body
      )}
    </>
  )
}

export default function PlanningView({
  view, days, anchor, prevDate, nextDate, projects, employees, assignments,
  absentByDate = {}, weather = {}, weatherAlerts = [],
}: {
  view: PlanningViewMode; days: string[]; anchor: string; prevDate: string; nextDate: string
  projects: ProjectRow[]; employees: EmployeeRow[]; assignments: AssignmentRow[]
  absentByDate?: Record<string, string[]>
  weather?: Record<string, Record<string, DayWeather>>
  weatherAlerts?: WeatherAlert[]
}) {
  const router = useRouter()
  const [items, setItems] = useState<AssignmentRow[]>(assignments)
  const [busy, setBusy] = useState(false)
  const [selDay, setSelDay] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  // Resync après router.refresh()
  const [syncedFrom, setSyncedFrom] = useState(assignments)
  if (syncedFrom !== assignments) { setSyncedFrom(assignments); setItems(assignments) }

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
  // Vue mois : chantiers mobilisés, salariés engagés et heures planifiées, jour par jour.
  const statsByDate = useMemo(() => {
    const m = new Map<string, { chantiers: Set<string>; salaries: Set<string>; heures: number }>()
    for (const a of items) {
      let e = m.get(a.date)
      if (!e) { e = { chantiers: new Set(), salaries: new Set(), heures: 0 }; m.set(a.date, e) }
      e.chantiers.add(a.project_id)
      e.salaries.add(a.employee_id)
      e.heures += workedHours(a.start_hour, a.end_hour)
    }
    return m
  }, [items])

  const todayIso = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })()
  const daySet = useMemo(() => new Set(days), [days])

  const nbConflits = useMemo(() => [...conflictByDay].filter(([k, n]) => n > 1 && daySet.has(k.split('|')[1])).length, [conflictByDay, daySet])
  const sansEquipe = useMemo(() => projects.filter(p => !days.some(d => (cellMap.get(`${p.id}|${d}`) || []).length > 0)), [projects, days, cellMap])

  async function addAssignment(projectId: string, date: string, employeeId: string) {
    if (!employeeId) return
    setBusy(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setBusy(false); return }
    const { data, error } = await supabase.from('assignments')
      .insert({ user_id: user.id, project_id: projectId, date, employee_id: employeeId, start_hour: DEFAULT_START, end_hour: DEFAULT_END })
      .select('id,employee_id,project_id,date,start_hour,end_hour').single()
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
  // Étirement/déplacement d'un créneau (vue jour) — optimiste, sans refresh pour rester fluide.
  async function updateHours(a: AssignmentRow, s: number, e: number) {
    setItems(prev => prev.map(x => (x.id === a.id ? { ...x, start_hour: s, end_hour: e } : x)))
    const { error } = await createClient().from('assignments').update({ start_hour: s, end_hour: e }).eq('id', a.id)
    if (error) toast.error('Erreur horaire')
  }

  // Décale toute l'équipe d'un chantier d'un jour (météo) vers un jour clément.
  async function reschedule(projectId: string, fromDate: string, toDate: string) {
    setBusy(true)
    const supabase = createClient()
    const source = items.filter(a => a.project_id === projectId && a.date === fromDate)
    const alreadyOnTarget = new Set(items.filter(a => a.project_id === projectId && a.date === toDate).map(a => a.employee_id))
    let ok = 0
    for (const a of source) {
      if (alreadyOnTarget.has(a.employee_id)) {
        // Déjà affecté au jour cible → on supprime le doublon (contrainte unique emp+proj+date).
        const { error } = await supabase.from('assignments').delete().eq('id', a.id)
        if (!error) { setItems(prev => prev.filter(x => x.id !== a.id)); ok++ }
      } else {
        const { error } = await supabase.from('assignments').update({ date: toDate }).eq('id', a.id)
        if (!error) { setItems(prev => prev.map(x => (x.id === a.id ? { ...x, date: toDate } : x))); ok++ }
      }
    }
    setBusy(false)
    if (ok > 0) { toast.success(`Chantier décalé au ${toDate.split('-').reverse().slice(0, 2).join('/')}`); router.refresh() }
    else toast.error('Rien à décaler')
  }

  const visibleAlerts = weatherAlerts.filter(a => !dismissed.has(`${a.projectId}|${a.date}`))

  // Petite pastille météo pour une cellule chantier×jour (chantiers extérieurs uniquement).
  const WeatherBadge = ({ projectId, date, bar }: { projectId: string; date: string; bar?: boolean }) => {
    const dw = weather[projectId]?.[date]
    if (!dw) return null
    return (
      <span title={`${dw.label} — min ${Math.round(dw.tMin)}° / max ${Math.round(dw.tMax)}°`}
        className={`${bar ? 'w-full flex' : 'inline-flex'} items-center justify-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold leading-tight ${dw.bad ? 'bg-sky-100 text-sky-700' : 'bg-gray-100 text-gray-500'}`}>
        <span aria-hidden>{dw.emoji}</span><span className="truncate">{dw.label}</span>
      </span>
    )
  }

  // Chip salarié affecté (semaine / mois)
  const Chip = ({ a, date, full }: { a: AssignmentRow; date: string; full?: boolean }) => {
    const e = empById.get(a.employee_id)
    if (!e) return null
    const conflict = (conflictByDay.get(`${a.employee_id}|${date}`) || 0) > 1
    return (
      <span className={`group ${full ? 'flex w-full min-w-0' : 'inline-flex'} items-center gap-1 pl-1 pr-1 h-7 rounded-full text-white text-[11px] font-semibold shadow-sm ring-2 ring-white transition-transform hover:-translate-y-px ${conflict ? 'ring-rose-400' : ''}`}
        style={{ backgroundColor: e.color }} title={`${e.full_name}${conflict ? ' — affecté à plusieurs chantiers ce jour' : ''}`}>
        <span className="grid place-items-center w-5 h-5 rounded-full bg-white/25 text-[9px] flex-shrink-0">{employeeInitials(e.full_name)}</span>
        <span className={`${full ? 'flex-1 min-w-0' : 'max-w-[60px]'} truncate`}>{e.full_name.split(' ')[0]}</span>
        <button onClick={() => removeAssignment(a)} disabled={busy} className="opacity-60 hover:opacity-100 flex-shrink-0"><X className="w-3 h-3" /></button>
      </span>
    )
  }
  const affectPicker = (projectId: string, date: string, variant?: 'pill' | 'cta') => {
    const assignedIds = new Set((cellMap.get(`${projectId}|${date}`) || []).map(a => a.employee_id))
    const absent = new Set(absentByDate[date] || [])
    const available = employees.filter(e => !assignedIds.has(e.id) && !absent.has(e.id))
    return <AffectPicker available={available} busy={busy} variant={variant}
      onPick={empId => addAssignment(projectId, date, empId)} />
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

  const absentJour = new Set(view === 'jour' ? (absentByDate[days[0]] || []) : [])
  const dispoJour = view === 'jour' ? employees.filter(e => !items.some(a => a.date === days[0] && a.employee_id === e.id) && !absentJour.has(e.id)) : []
  const absentsJourList = view === 'jour' ? employees.filter(e => absentJour.has(e.id)) : []

  return (
    <Wrapper>
      {/* Sélecteur de vue + indicateurs (§11.2) + navigation — tout sur une ligne */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-white/80 ring-1 ring-[#EBD9CE] shadow-sm">
            {(['jour', 'semaine', 'mois'] as const).map(v => (
              <Link key={v} href={switchHref(v)}
                className={`px-3.5 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${view === v ? 'bg-primary text-primary-foreground shadow-[var(--shadow-brand)]' : 'text-gray-500 hover:text-gray-800'}`}>
                {v}
              </Link>
            ))}
          </div>
          <span className="hidden sm:block w-px h-6 bg-[#EBD9CE]" />
          <span className={`inline-flex items-center gap-1.5 px-2.5 h-8 rounded-full text-xs font-semibold ring-1 ring-white/70 shadow-sm ${nbConflits > 0 ? 'bg-rose-100 text-rose-700' : 'bg-white/80 text-gray-500'}`}>
            <AlertTriangle className="w-3.5 h-3.5" /> {nbConflits} <span className="hidden md:inline font-medium">conflit{nbConflits > 1 ? 's' : ''}</span>
          </span>
          <span className={`inline-flex items-center gap-1.5 px-2.5 h-8 rounded-full text-xs font-semibold ring-1 ring-white/70 shadow-sm ${sansEquipe.length > 0 ? 'bg-amber-100 text-amber-700' : 'bg-white/80 text-gray-500'}`}>
            <HardHat className="w-3.5 h-3.5" /> {sansEquipe.length} <span className="hidden md:inline font-medium">sans équipe</span>
          </span>
          <span className={`inline-flex items-center gap-1.5 px-2.5 h-8 rounded-full text-xs font-semibold ring-1 ring-white/70 shadow-sm ${visibleAlerts.length > 0 ? 'bg-sky-100 text-sky-700' : 'bg-white/80 text-gray-500'}`}>
            <CloudRain className="w-3.5 h-3.5" /> {visibleAlerts.length} <span className="hidden md:inline font-medium">météo</span>
          </span>
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

      {/* Alertes météo → replanification (chantiers extérieurs) */}
      {visibleAlerts.length > 0 && (
        <Card className="border-0 shadow-[var(--shadow-sm)] overflow-hidden ring-1 ring-sky-100">
          <div className="bg-gradient-to-r from-sky-50 to-transparent px-4 py-2.5 border-b border-sky-100 flex items-center gap-2">
            <CloudRain className="w-4 h-4 text-sky-600" />
            <h3 className="text-sm font-semibold text-marine">Météo défavorable sur des chantiers extérieurs planifiés</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {visibleAlerts.map(al => (
              <div key={`${al.projectId}|${al.date}`} className="flex items-center gap-3 px-4 py-3 flex-wrap">
                <span className="text-xl leading-none" aria-hidden>{al.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-800">
                    <Link href={`/chantiers/${al.projectId}`} className="font-semibold hover:text-primary">{al.projectTitle}</Link>
                    <span className="text-gray-500"> · {al.detail} </span>
                    <span className="font-medium capitalize">{al.dateLabel}</span>
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {al.nbAffectes} salarié{al.nbAffectes > 1 ? 's' : ''} affecté{al.nbAffectes > 1 ? 's' : ''} ce jour-là
                    {al.suggestLabel ? <> · prochain jour clément : <span className="font-medium text-emerald-600 capitalize">{al.suggestLabel}</span></> : <> · aucun jour clément dans les 7 jours</>}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {al.suggestDate && (
                    <Button size="sm" disabled={busy} onClick={() => reschedule(al.projectId, al.date, al.suggestDate!)}>
                      <CalendarClock className="w-3.5 h-3.5 mr-1.5" /> Décaler au {al.suggestLabel}
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="text-gray-400 hover:text-gray-700"
                    onClick={() => setDismissed(prev => new Set(prev).add(`${al.projectId}|${al.date}`))}>
                    Ignorer
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {projects.length === 0 ? (
        <EmptyState icon={<HardHat className="w-12 h-12 mx-auto mb-3 text-gray-300" />}
          title="Aucun chantier actif à planifier"
          desc="Créez un chantier pour commencer à affecter votre équipe."
          cta={<Link href="/chantiers/nouveau"><Button>Nouveau chantier</Button></Link>} />
      ) : view === 'semaine' ? (
        /* ───────── Vue semaine ───────── */
        <Card className="border-0 bg-white/90 backdrop-blur-sm ring-1 ring-white/70 shadow-[0_10px_28px_-8px_rgba(80,40,20,0.28),0_2px_6px_rgba(80,40,20,0.10)] overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-[1320px]">
              {/* Bandeau des jours — dégradé corail + motif de points, pour isoler visuellement la zone d'affectation */}
              <div className="grid border-b border-[#E6C9B8] bg-gradient-to-b from-[#FCEBE1] to-[#F7DDCE] shadow-[0_2px_6px_rgba(80,40,20,0.10)]" style={{ gridTemplateColumns: `${WEEK_COL}px repeat(7, 1fr)` }}>
                <div className="p-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[#B0563A] flex items-center gap-2">
                  <HardHat className="w-3.5 h-3.5" /> Chantier
                </div>
                {days.map((d, i) => {
                  const we = i >= 5
                  return (
                    <div key={d} className={`relative p-2.5 text-center border-l border-[#E6C9B8]/70 ${d === todayIso ? 'bg-[#C14E33]/12' : we ? 'bg-[#8A4B24]/[0.05]' : ''}`}>
                      <div aria-hidden className="absolute inset-0 pointer-events-none opacity-70"
                        style={{ backgroundImage: 'radial-gradient(rgba(138,75,36,0.13) 1px, transparent 1px)', backgroundSize: '12px 12px' }} />
                      <div className="relative">
                        <div className={`text-[11px] font-bold uppercase tracking-[0.1em] ${d === todayIso ? 'text-[#C14E33]' : 'text-[#B0563A]/75'}`}>{DAY_LABELS[i]}</div>
                        <div className={`mt-1 inline-grid place-items-center w-7 h-7 rounded-full text-[13px] font-bold ${d === todayIso ? 'bg-[#C14E33] text-white shadow-[0_3px_10px_rgba(193,78,51,0.4)]' : 'text-marine'}`}>
                          {Number(d.split('-')[2])}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              {projects.map(p => (
                <div key={p.id} className="grid border-b border-[#F0E2D8] last:border-0 group/row" style={{ gridTemplateColumns: `${WEEK_COL}px repeat(7, 1fr)` }}>
                  {/* Colonne chantier : fond crème pointillé — hors de la zone des salariés */}
                  <div className="relative p-3 flex items-center gap-2.5 min-w-0 bg-gradient-to-r from-[#FFF7F2] to-[#FCEBE1] border-r border-[#E6C9B8] group-hover/row:from-[#FFF3EA] transition-colors">
                    <div aria-hidden className="absolute inset-0 pointer-events-none opacity-60"
                      style={{ backgroundImage: 'radial-gradient(rgba(138,75,36,0.10) 1px, transparent 1px)', backgroundSize: '14px 14px' }} />
                    <span className="relative grid place-items-center w-8 h-8 rounded-lg bg-white/80 text-[#C14E33] flex-shrink-0 ring-1 ring-[#EBD9CE] shadow-sm"><HardHat className="w-4 h-4" /></span>
                    <Link href={`/chantiers/${p.id}`} className="relative text-[12px] font-bold uppercase tracking-[0.05em] text-marine truncate hover:text-primary">{p.title}</Link>
                  </div>
                  {days.map((d, i) => (
                    <div key={d} className={`p-2 border-l border-[#F0E2D8] flex flex-col items-stretch transition-colors group-hover/row:bg-[#FFFBF8] ${d === todayIso ? 'bg-[#C14E33]/[0.045]' : i >= 5 ? 'bg-[#8A4B24]/[0.025]' : ''}`}
                      style={{ minHeight: WEEK_CELL_H }}>
                      {weather[p.id]?.[d] && <div className="w-full mb-1"><WeatherBadge projectId={p.id} date={d} bar /></div>}
                      {/* Place réservée pour 6 salariés : 2 colonnes × 3 lignes */}
                      <div className="grid grid-cols-2 gap-1 content-start" style={{ minHeight: WEEK_SLOTS_H }}>
                        {(cellMap.get(`${p.id}|${d}`) || []).map(a => <Chip key={a.id} a={a} date={d} full />)}
                      </div>
                      <div className="mt-auto pt-1.5 flex justify-center">{affectPicker(p.id, d)}</div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </Card>
      ) : view === 'jour' ? (
        /* ───────── Vue jour : frise horaire draggable ───────── */
        <div className="space-y-4">
          <div className="grid gap-3">
            {projects.map(p => {
              const rows = cellMap.get(`${p.id}|${days[0]}`) || []
              return (
                <DottedCard key={p.id} className="shadow-[0_10px_28px_-8px_rgba(80,40,20,0.28),0_2px_6px_rgba(80,40,20,0.10)] ring-1 ring-white/60 transition-shadow hover:shadow-[0_16px_38px_-10px_rgba(80,40,20,0.34),0_3px_8px_rgba(80,40,20,0.12)]">
                  <div className="p-4">
                    <div className="flex items-center gap-2.5 mb-3">
                      <span className="grid place-items-center w-9 h-9 rounded-xl bg-[#FCE7DE] text-[#C14E33] flex-shrink-0 ring-1 ring-white/80 shadow-sm"><HardHat className="w-4 h-4" /></span>
                      <Link href={`/chantiers/${p.id}`} className="text-[13px] font-bold uppercase tracking-[0.06em] text-marine hover:text-primary truncate">{p.title}</Link>
                      <span className="ml-auto flex items-center gap-2 flex-shrink-0">
                        <WeatherBadge projectId={p.id} date={days[0]} />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{rows.length} affecté{rows.length > 1 ? 's' : ''}</span>
                      </span>
                    </div>

                    {/* Axe des heures */}
                    <div className="flex items-center gap-2">
                      <div className="w-24 flex-shrink-0" />
                      <div className="relative flex-1 h-4">
                        {AXIS.map(h => (
                          <span key={h} className="absolute -translate-x-1/2 text-[9px] text-gray-400 tabular-nums" style={{ left: `${(h - DAY_START) / TOTAL_H * 100}%` }}>{h}h</span>
                        ))}
                      </div>
                    </div>

                    {/* Une frise par salarié affecté */}
                    <div className="space-y-1.5 mt-1">
                      {rows.length === 0 && <p className="text-sm text-gray-400 py-1">Personne d&apos;affecté sur ce chantier.</p>}
                      {rows.map(a => {
                        const emp = empById.get(a.employee_id)
                        if (!emp) return null
                        return (
                          <div key={a.id} className="flex items-center gap-2">
                            <div className="w-24 flex-shrink-0 flex items-center gap-1.5 min-w-0">
                              <span className="grid place-items-center w-5 h-5 rounded-full text-white text-[9px] flex-shrink-0" style={{ backgroundColor: emp.color }}>{employeeInitials(emp.full_name)}</span>
                              <span className="text-xs text-gray-700 truncate">{emp.full_name.split(' ')[0]}</span>
                            </div>
                            <div data-track className="relative flex-1 h-9 rounded-lg bg-white/70 ring-1 ring-[#EBD9CE] shadow-[inset_0_1px_3px_rgba(80,40,20,0.10)]">
                              <div aria-hidden className="absolute top-0 bottom-0 bg-[#8A4B24]/[0.06]"
                                style={{ left: `${(BREAK_START - DAY_START) / TOTAL_H * 100}%`, width: `${(BREAK_END - BREAK_START) / TOTAL_H * 100}%` }} />
                              {AXIS.slice(1, -1).map(h => (
                                <div key={h} className="absolute top-0 bottom-0 w-px bg-[#8A4B24]/10" style={{ left: `${(h - DAY_START) / TOTAL_H * 100}%` }} />
                              ))}
                              <EmployeeBar emp={emp} a={a} busy={busy} onChange={(s, e) => updateHours(a, s, e)} onRemove={() => removeAssignment(a)} />
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    <div className="mt-3 flex justify-center">{affectPicker(p.id, days[0], 'cta')}</div>
                  </div>
                </DottedCard>
              )
            })}
          </div>

          {/* Disponibilités (§11.1) */}
          <Card className="border-0 bg-[#F1F6E9]/70 ring-1 ring-white/60 shadow-[0_10px_28px_-8px_rgba(46,90,34,0.28),0_2px_6px_rgba(46,90,34,0.10)]">
            <CardContent className="p-4">
              <h3 className="text-[12px] font-bold uppercase tracking-[0.08em] text-[#2E5A22] mb-2.5 flex items-center gap-2"><UserCheck className="w-4 h-4 text-[#3F7A2E]" /> Disponibles ce jour ({dispoJour.length})</h3>
              {dispoJour.length === 0 ? <p className="text-sm text-[#3F7A2E]/70">Tout le monde est affecté.</p> : (
                <div className="flex flex-wrap gap-1.5">
                  {dispoJour.map(e => (
                    <span key={e.id} className="inline-flex items-center gap-1.5 rounded-full bg-white border border-[#CFE0BE] pl-1 pr-2.5 py-0.5 text-xs shadow-sm">
                      <span className="grid place-items-center w-5 h-5 rounded-full text-white text-[9px]" style={{ backgroundColor: e.color }}>{employeeInitials(e.full_name)}</span>
                      {e.full_name}
                    </span>
                  ))}
                </div>
              )}
              {absentsJourList.length > 0 && (
                <div className="mt-3 pt-3 border-t border-[#CFE0BE]">
                  <h3 className="text-[12px] font-bold uppercase tracking-[0.08em] text-rose-700 mb-2 flex items-center gap-2"><CalendarOff className="w-4 h-4" /> Absents ce jour ({absentsJourList.length})</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {absentsJourList.map(e => (
                      <span key={e.id} className="inline-flex items-center gap-1.5 rounded-full bg-white border border-rose-200 pl-1 pr-2.5 py-0.5 text-xs shadow-sm">
                        <span className="grid place-items-center w-5 h-5 rounded-full text-white text-[9px]" style={{ backgroundColor: e.color }}>{employeeInitials(e.full_name)}</span>
                        <span className="line-through text-gray-500">{e.full_name}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <p className="text-xs text-gray-400">Glissez le bord d&apos;un créneau pour ajuster ses heures, ou déplacez-le. Par défaut : {formatRange(DEFAULT_START, DEFAULT_END)} — pause déjeuner déduite, soit {workedHours(DEFAULT_START, DEFAULT_END)} h travaillées.</p>
        </div>
      ) : (
        /* ───────── Vue mois ───────── */
        <>
          <Card className="relative border-0 bg-white/90 backdrop-blur-sm ring-1 ring-white/70 shadow-[0_10px_28px_-8px_rgba(80,40,20,0.28),0_2px_6px_rgba(80,40,20,0.10)] overflow-hidden">
            {/* Quadrillage papier millimétré en fond de calendrier */}
            <div aria-hidden className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: [
                  'linear-gradient(rgba(138,75,36,0.055) 1px, transparent 1px)',
                  'linear-gradient(90deg, rgba(138,75,36,0.055) 1px, transparent 1px)',
                  'radial-gradient(rgba(138,75,36,0.10) 1px, transparent 1px)',
                ].join(', '),
                backgroundSize: '22px 22px, 22px 22px, 22px 22px',
              }} />
            <div className="relative grid grid-cols-7 text-center border-b border-[#E6C9B8] bg-gradient-to-b from-[#FCEBE1] to-[#F7DDCE] shadow-[0_2px_6px_rgba(80,40,20,0.08)]">
              {DAY_LABELS.map((l, i) => (
                <div key={l} className={`p-2.5 text-[11px] font-bold uppercase tracking-[0.12em] ${i >= 5 ? 'text-[#B0563A]/55' : 'text-[#B0563A]'}`}>{l}</div>
              ))}
            </div>
            <div className="relative grid grid-cols-7">
              {Array.from({ length: (new Date(days[0] + 'T00:00:00').getDay() + 6) % 7 }).map((_, i) => (
                <div key={`b${i}`} className="min-h-[116px] border-b border-l border-[#F0E2D8]"
                  style={{ backgroundImage: 'repeating-linear-gradient(45deg, rgba(138,75,36,0.05) 0 6px, transparent 6px 12px)' }} />
              ))}
              {days.map(d => {
                const st = statsByDate.get(d)
                const nSal = st?.salaries.size || 0
                const nChan = st?.chantiers.size || 0
                const heures = Math.round(st?.heures || 0)
                const nAbs = (absentByDate[d] || []).length
                const charge = employees.length ? Math.min(1, nSal / employees.length) : 0
                const isToday = d === todayIso
                const isSel = d === selDay
                const isWe = (new Date(d + 'T00:00:00').getDay() + 6) % 7 >= 5
                return (
                  <button key={d} onClick={() => setSelDay(d)}
                    className={`relative text-left min-h-[116px] border-b border-l border-[#F0E2D8] p-2 flex flex-col transition-colors
                      ${isSel ? 'bg-[#C14E33]/[0.07] ring-2 ring-inset ring-[#C14E33]/45' : isToday ? 'bg-[#C14E33]/[0.045]' : isWe ? 'bg-[#8A4B24]/[0.028]' : 'hover:bg-white/70'}`}>
                    <div className="flex items-center justify-between">
                      <span className={`inline-grid place-items-center w-7 h-7 rounded-full text-[13px] font-bold ${isToday ? 'bg-[#C14E33] text-white shadow-[0_3px_10px_rgba(193,78,51,0.4)]' : 'text-marine'}`}>
                        {Number(d.split('-')[2])}
                      </span>
                      {nAbs > 0 && (
                        <span title={`${nAbs} absent${nAbs > 1 ? 's' : ''}`} className="inline-flex items-center gap-0.5 px-1.5 h-5 rounded-full bg-rose-100 text-rose-600 text-[10px] font-bold">
                          <CalendarOff className="w-2.5 h-2.5" />{nAbs}
                        </span>
                      )}
                    </div>

                    {nSal > 0 ? (
                      <>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          <span title={`${nChan} chantier${nChan > 1 ? 's' : ''} mobilisé${nChan > 1 ? 's' : ''}`}
                            className="inline-flex items-center gap-1 px-1.5 h-[19px] rounded-md bg-white/85 ring-1 ring-[#EBD9CE] text-[#B0472F] text-[10px] font-bold">
                            <HardHat className="w-2.5 h-2.5" />{nChan}
                          </span>
                          <span title={`${nSal} salarié${nSal > 1 ? 's' : ''} engagé${nSal > 1 ? 's' : ''}`}
                            className="inline-flex items-center gap-1 px-1.5 h-[19px] rounded-md bg-white/85 ring-1 ring-[#EBD9CE] text-[#2F6BE8] text-[10px] font-bold">
                            <Users2 className="w-2.5 h-2.5" />{nSal}
                          </span>
                          <span title={`${heures} h planifiées (pause déduite)`}
                            className="inline-flex items-center gap-1 px-1.5 h-[19px] rounded-md bg-white/85 ring-1 ring-[#EBD9CE] text-[#3F7A2E] text-[10px] font-bold">
                            <Clock3 className="w-2.5 h-2.5" />{heures}h
                          </span>
                        </div>
                        {/* Charge de l'équipe : part des salariés engagés ce jour */}
                        <div className="mt-auto pt-2">
                          <div className="h-1.5 rounded-full bg-[#8A4B24]/10 overflow-hidden">
                            <div className="h-full rounded-full transition-[width]"
                              style={{ width: `${charge * 100}%`, background: charge >= 1 ? 'linear-gradient(90deg,#C14E33,#E5734F)' : 'linear-gradient(90deg,#4E9331,#7DBB57)' }} />
                          </div>
                          <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider text-gray-400">
                            {nSal}/{employees.length} équipe
                          </p>
                        </div>
                      </>
                    ) : (
                      <p className="mt-auto text-[10px] font-medium uppercase tracking-wider text-gray-300">Libre</p>
                    )}
                  </button>
                )
              })}
              {Array.from({ length: (7 - ((((new Date(days[0] + 'T00:00:00').getDay() + 6) % 7) + days.length) % 7)) % 7 }).map((_, i) => (
                <div key={`e${i}`} className="min-h-[116px] border-b border-l border-[#F0E2D8]"
                  style={{ backgroundImage: 'repeating-linear-gradient(45deg, rgba(138,75,36,0.05) 0 6px, transparent 6px 12px)' }} />
              ))}
            </div>
          </Card>

          {/* Modal d'affectation centré (comme en semaine, en 1 clic) */}
          {selDay && daySet.has(selDay) && typeof document !== 'undefined' && createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setSelDay(null)}>
              <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px]" />
              <div
                onClick={e => e.stopPropagation()}
                className="relative w-[420px] max-w-full rounded-2xl bg-white shadow-[var(--shadow-lg)] border border-gray-100 overflow-hidden animate-fade-up"
              >
                <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-marine capitalize flex items-center gap-1.5"><CalendarDays className="w-4 h-4 text-gray-400" /> {fmtLong(selDay)}</h3>
                  <button onClick={() => setSelDay(null)} className="text-gray-400 hover:text-gray-700"><X className="w-4 h-4" /></button>
                </div>
                <div className="max-h-[45vh] overflow-y-auto divide-y divide-gray-100">
                  {projects.map(p => (
                    <div key={p.id} className="px-4 py-2.5">
                      <Link href={`/chantiers/${p.id}`} className="text-[12px] font-bold uppercase tracking-[0.05em] text-marine hover:text-primary truncate block mb-1.5">{p.title}</Link>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {(cellMap.get(`${p.id}|${selDay}`) || []).map(a => <Chip key={a.id} a={a} date={selDay} />)}
                        {affectPicker(p.id, selDay)}
                      </div>
                    </div>
                  ))}
                </div>
                <Link href={`/planning?view=jour&date=${selDay}`} className="flex items-center justify-center gap-1 px-4 py-2.5 border-t border-gray-100 text-sm font-medium text-primary hover:bg-accent transition-colors">
                  Ouvrir la journée <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>,
            document.body
          )}
        </>
      )}

      {view !== 'jour' && (
        <p className="text-xs text-gray-400">
          Un salarié encadré en rouge est sur plusieurs chantiers le même jour.{view === 'mois' ? ' Cliquez un jour pour affecter directement.' : ''}
        </p>
      )}
    </Wrapper>
  )
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <DottedPage>
      <div className="space-y-5 animate-fade-up">
        <div>
          <h1 className="text-2xl md:text-[26px] font-bold font-heading text-marine">Planning</h1>
          <p className="text-gray-500 mt-1 text-sm">Qui va où, quand, sur quel chantier — jour, semaine ou mois.</p>
        </div>
        {children}
      </div>
    </DottedPage>
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
