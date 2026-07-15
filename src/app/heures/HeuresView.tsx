'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, CalendarDays, Clock, Plus, Users2, Check, X, MapPin, FileSpreadsheet, CheckCheck } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { employeeInitials } from '@/lib/equipe'

type EmployeeRow = { id: string; full_name: string; color: string; hourly_cost: number | null }
type ProjectRow = { id: string; title: string; status: string }
type AssignmentRow = { employee_id: string; project_id: string; date: string }
type EntryRow = { id: string; employee_id: string; project_id: string | null; date: string; hours: number; status: string }
type PresenceRow = { employee_id: string | null; project_id: string | null; type: string; occurred_at: string }
type VehLogRow = { project_id: string | null; date: string; hours_present: number }
type HeureStatus = 'declare' | 'valide' | 'refuse'

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const fmtShort = (iso: string) => { const [, m, d] = iso.split('-'); return `${d}/${m}` }
const keyOf = (e: string, p: string | null, d: string) => `${e}|${p || ''}|${d}`

// Heures travaillées déduites des pointages géolocalisés d'un salarié sur un chantier/jour :
// on somme les créneaux entre (arrivée/reprise) et (pause/départ), arrondi au quart d'heure.
function buildPointed(presence: PresenceRow[]) {
  const groups = new Map<string, PresenceRow[]>()
  for (const ev of presence) {
    if (!ev.employee_id) continue
    const date = ev.occurred_at.split('T')[0]
    const k = keyOf(ev.employee_id, ev.project_id, date)
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(ev)
  }
  const out = new Map<string, { arrivee?: string; depart?: string; hours: number }>()
  for (const [k, evts] of groups) {
    const sorted = [...evts].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
    let clockIn: number | null = null, total = 0
    let arrivee: string | undefined, depart: string | undefined
    for (const e of sorted) {
      const t = new Date(e.occurred_at).getTime()
      const hm = e.occurred_at.split('T')[1]?.slice(0, 5)
      if (e.type === 'arrivee' || e.type === 'reprise') { if (clockIn == null) clockIn = t; if (e.type === 'arrivee' && !arrivee) arrivee = hm }
      else if (e.type === 'pause' || e.type === 'depart') { if (clockIn != null) { total += t - clockIn; clockIn = null } if (e.type === 'depart') depart = hm }
    }
    out.set(k, { arrivee, depart, hours: Math.round((total / 3_600_000) * 4) / 4 })
  }
  return out
}

const ST: Record<HeureStatus, { label: string; cls: string }> = {
  declare: { label: 'À vérifier', cls: 'bg-amber-100 text-amber-700' },
  valide: { label: 'Validé', cls: 'bg-[#E9F2DB] text-[#3F7A2E]' },
  refuse: { label: 'À corriger', cls: 'bg-rose-100 text-rose-700' },
}

// Contrôle h/véhicules (doc §15.4)
type CtrlStatus = 'coherent' | 'ecart_faible' | 'ecart_important' | 'sans_vehicule' | 'sans_heures'
const CTRL: Record<CtrlStatus, { label: string; cls: string }> = {
  coherent: { label: 'Cohérent', cls: 'bg-[#E9F2DB] text-[#3F7A2E]' },
  ecart_faible: { label: 'Écart faible', cls: 'bg-amber-100 text-amber-700' },
  ecart_important: { label: 'Écart important', cls: 'bg-rose-100 text-rose-700' },
  sans_vehicule: { label: 'Heures sans véhicule', cls: 'bg-amber-100 text-amber-700' },
  sans_heures: { label: 'Véhicule sans heures', cls: 'bg-amber-100 text-amber-700' },
}
function classifyCtrl(emp: number, veh: number): CtrlStatus {
  if (veh === 0 && emp > 0) return 'sans_vehicule'
  if (emp === 0 && veh > 0) return 'sans_heures'
  const d = Math.abs(emp - veh)
  if (d <= 1) return 'coherent'
  if (d <= 3) return 'ecart_faible'
  return 'ecart_important'
}

export default function HeuresView({
  days, prevWeek, nextWeek, employees, projects, assignments, entries, presence, vehicleLogs,
}: {
  days: string[]; prevWeek: string; nextWeek: string
  employees: EmployeeRow[]; projects: ProjectRow[]; assignments: AssignmentRow[]
  entries: EntryRow[]; presence: PresenceRow[]; vehicleLogs: VehLogRow[]
}) {
  const router = useRouter()
  const empById = useMemo(() => new Map(employees.map(e => [e.id, e])), [employees])
  const projById = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects])
  // Heures déduites des pointages géolocalisés (remontée automatique).
  const pointedByKey = useMemo(() => buildPointed(presence), [presence])

  const [tab, setTab] = useState<'validation' | 'controle'>('validation')
  const num = (v: string) => Number((v || '').replace(',', '.')) || 0

  // Pré-remplissage : d'abord les heures pointées, puis les saisies manuelles (qui priment).
  const [hours, setHours] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {}
    for (const [k, v] of pointedByKey) if (v.hours > 0) m[k] = String(v.hours)
    for (const e of entries) m[keyOf(e.employee_id, e.project_id, e.date)] = String(e.hours)
    return m
  })
  const [ids, setIds] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {}; for (const e of entries) m[keyOf(e.employee_id, e.project_id, e.date)] = e.id; return m
  })
  const [statusMap, setStatusMap] = useState<Record<string, HeureStatus>>(() => {
    const m: Record<string, HeureStatus> = {}
    for (const [k, v] of pointedByKey) if (v.hours > 0) m[k] = 'declare'
    for (const e of entries) m[keyOf(e.employee_id, e.project_id, e.date)] = (e.status as HeureStatus) || 'declare'
    return m
  })
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [addEmp, setAddEmp] = useState(''); const [addProj, setAddProj] = useState(''); const [addDay, setAddDay] = useState(days[0]); const [addHours, setAddHours] = useState('')

  // Filtres (§12.1)
  const [fStatut, setFStatut] = useState<'tous' | HeureStatus>('tous')
  const [fEmp, setFEmp] = useState(''); const [fProj, setFProj] = useState('')

  const rowsByDay = useMemo(() => {
    const seen = new Set<string>()
    const rows: { key: string; employee_id: string; project_id: string | null; date: string }[] = []
    const push = (employee_id: string, project_id: string | null, date: string) => {
      const k = keyOf(employee_id, project_id, date)
      if (seen.has(k)) return; seen.add(k); rows.push({ key: k, employee_id, project_id, date })
    }
    for (const a of assignments) push(a.employee_id, a.project_id, a.date)
    for (const e of entries) push(e.employee_id, e.project_id, e.date)
    // Lignes issues des pointages (même sans affectation ni saisie préalable)
    for (const k of pointedByKey.keys()) { const [emp, proj, date] = k.split('|'); push(emp, proj || null, date) }
    const byDay = new Map<string, typeof rows>()
    for (const d of days) byDay.set(d, [])
    for (const r of rows) { if (!byDay.has(r.date)) byDay.set(r.date, []); byDay.get(r.date)!.push(r) }
    for (const [, arr] of byDay) arr.sort((a, b) => (empById.get(a.employee_id)?.full_name || '').localeCompare(empById.get(b.employee_id)?.full_name || ''))
    return byDay
  }, [assignments, entries, days, empById, pointedByKey])

  const matchFilter = (r: { employee_id: string; project_id: string | null; key: string }) => {
    if (fEmp && r.employee_id !== fEmp) return false
    if (fProj && r.project_id !== fProj) return false
    if (fStatut !== 'tous') {
      const st = statusMap[r.key]
      // une ligne sans heures n'a pas de statut → on l'exclut des filtres de statut
      if (num(hours[r.key]) <= 0 || (st || 'declare') !== fStatut) return false
    }
    return true
  }

  async function saveCell(employee_id: string, project_id: string | null, date: string) {
    const k = keyOf(employee_id, project_id, date)
    const h = num(hours[k])
    setSavingKey(k)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSavingKey(null); return }
    if (h <= 0) {
      if (ids[k]) { await supabase.from('time_entries').delete().eq('id', ids[k]); setIds(p => { const n = { ...p }; delete n[k]; return n }) }
      setSavingKey(null); return
    }
    const st = statusMap[k] || 'declare'
    const { data, error } = await supabase.from('time_entries')
      .upsert({ user_id: user.id, employee_id, project_id, date, hours: h, status: st }, { onConflict: 'employee_id,project_id,date' })
      .select('id').single()
    setSavingKey(null)
    if (error || !data) { toast.error('Erreur lors de l\'enregistrement'); return }
    setIds(p => ({ ...p, [k]: data.id }))
    setStatusMap(p => ({ ...p, [k]: st }))
  }

  // Persiste une ligne (crée l'entrée si elle vient d'un pointage, sinon met à jour le statut).
  async function persist(key: string, status: HeureStatus): Promise<boolean> {
    const supabase = createClient()
    const id = ids[key]
    if (id) {
      const { error } = await supabase.from('time_entries').update({ status }).eq('id', id)
      return !error
    }
    const [emp, proj, date] = key.split('|')
    const h = num(hours[key])
    if (h <= 0) return false
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false
    const { data, error } = await supabase.from('time_entries')
      .upsert({ user_id: user.id, employee_id: emp, project_id: proj || null, date, hours: h, status }, { onConflict: 'employee_id,project_id,date' })
      .select('id').single()
    if (error || !data) return false
    setIds(p => ({ ...p, [key]: data.id }))
    return true
  }

  async function setStatus(key: string, status: HeureStatus) {
    setStatusMap(p => ({ ...p, [key]: status }))
    const ok = await persist(key, status)
    if (!ok) { toast.error('Erreur'); return }
    toast.success(status === 'valide' ? 'Heures validées' : status === 'refuse' ? 'Marqué à corriger' : 'Mis à jour')
  }

  async function validateAll() {
    const keys = Object.keys(hours).filter(k => (statusMap[k] || 'declare') === 'declare' && num(hours[k]) > 0)
    if (!keys.length) { toast.info('Rien à valider'); return }
    const next = { ...statusMap }
    let n = 0
    for (const k of keys) { if (await persist(k, 'valide')) { next[k] = 'valide'; n++ } }
    setStatusMap(next)
    toast.success(`${n} ligne(s) validée(s)`)
  }

  async function handleAdd() {
    if (!addEmp) { toast.error('Choisissez un salarié'); return }
    if (num(addHours) <= 0) { toast.error('Indiquez un nombre d\'heures'); return }
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase.from('time_entries')
      .upsert({ user_id: user.id, employee_id: addEmp, project_id: addProj || null, date: addDay, hours: num(addHours), status: 'declare' }, { onConflict: 'employee_id,project_id,date' })
    if (error) { toast.error('Erreur'); return }
    toast.success('Heures ajoutées (à vérifier)')
    setShowAdd(false); setAddEmp(''); setAddProj(''); setAddHours(''); router.refresh()
  }

  function exportCsv() {
    const rows = [['Salarié', 'Chantier', 'Date', 'Heures', 'Statut']]
    for (const d of days) for (const r of (rowsByDay.get(d) || [])) {
      const h = num(hours[r.key]); if (h <= 0) continue
      if (!matchFilter(r)) continue
      const e = empById.get(r.employee_id)
      rows.push([e?.full_name || '', r.project_id ? (projById.get(r.project_id)?.title || '') : '', r.date, String(h), ST[(statusMap[r.key] || 'declare') as HeureStatus].label])
    }
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `heures-${days[0]}.csv`; a.click(); URL.revokeObjectURL(url)
    toast.success('Heures exportées (CSV)')
  }

  const totals = useMemo(() => {
    let grand = 0, cost = 0, aVerifier = 0
    const perEmp = new Map<string, number>(); const perProj = new Map<string, number>()
    for (const [k, v] of Object.entries(hours)) {
      const h = num(v); if (h <= 0) continue
      const [e, p] = k.split('|')
      grand += h; perEmp.set(e, (perEmp.get(e) || 0) + h)
      if (p) perProj.set(p, (perProj.get(p) || 0) + h)
      const hc = empById.get(e)?.hourly_cost; if (hc) cost += h * Number(hc)
      if ((statusMap[k] || 'declare') === 'declare') aVerifier++
    }
    return { grand, cost, perEmp, perProj, aVerifier }
  }, [hours, empById, statusMap])

  // Contrôle h/véhicules (semaine)
  const ctrlRows = useMemo(() => {
    const rows = new Map<string, { project_id: string | null; date: string; emp: number; veh: number }>()
    const k = (pid: string | null, d: string) => `${pid || 'none'}__${d}`
    for (const e of entries) { const r = rows.get(k(e.project_id, e.date)) || { project_id: e.project_id, date: e.date, emp: 0, veh: 0 }; r.emp += Number(e.hours) || 0; rows.set(k(e.project_id, e.date), r) }
    for (const l of vehicleLogs) { const r = rows.get(k(l.project_id, l.date)) || { project_id: l.project_id, date: l.date, emp: 0, veh: 0 }; r.veh += Number(l.hours_present) || 0; rows.set(k(l.project_id, l.date), r) }
    return [...rows.values()].map(r => ({ ...r, title: r.project_id ? (projById.get(r.project_id)?.title || 'Chantier') : 'Sans chantier', status: classifyCtrl(r.emp, r.veh) })).sort((a, b) => b.date.localeCompare(a.date))
  }, [entries, vehicleLogs, projById])
  const ctrlAlertes = ctrlRows.filter(r => r.status !== 'coherent').length

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
      {/* Onglets */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-gray-100 w-fit">
        {(['validation', 'controle'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === t ? 'bg-white text-marine shadow-[var(--shadow-xs)]' : 'text-gray-500 hover:text-gray-800'}`}>
            {t === 'validation' ? 'Validation des heures' : 'Contrôle h/véhicules'}
            {t === 'controle' && ctrlAlertes > 0 && <span className="ml-1.5 text-rose-500">{ctrlAlertes}</span>}
          </button>
        ))}
      </div>

      {/* Nav semaine */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Link href={`/heures?week=${prevWeek}`}><Button variant="outline" size="icon-sm"><ChevronLeft className="w-4 h-4" /></Button></Link>
          <span className="inline-flex items-center gap-2 px-3 h-9 rounded-xl bg-white border border-gray-200 text-sm font-medium text-marine"><CalendarDays className="w-4 h-4 text-gray-400" /> {weekLabel}</span>
          <Link href={`/heures?week=${nextWeek}`}><Button variant="outline" size="icon-sm"><ChevronRight className="w-4 h-4" /></Button></Link>
          <Link href="/heures"><Button variant="outline" size="sm">Cette semaine</Button></Link>
        </div>
        {tab === 'validation' && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1" onClick={exportCsv}><FileSpreadsheet className="w-4 h-4" /> Export</Button>
            <Button variant="outline" size="sm" className="gap-1" onClick={validateAll}><CheckCheck className="w-4 h-4" /> Tout valider</Button>
            <Button size="sm" className="gap-1" onClick={() => setShowAdd(v => !v)}><Plus className="w-4 h-4" /> Heures</Button>
          </div>
        )}
      </div>

      {tab === 'controle' ? (
        /* ───────── Onglet Contrôle (§15.4) ───────── */
        <Card className="border border-gray-200/80"><CardContent className="p-2 sm:p-4">
          <div className="flex items-center justify-between mb-3 px-1">
            <p className="text-sm text-gray-500">Heures déclarées vs présence véhicule, cette semaine.</p>
            <Link href="/controle" className="text-xs font-medium text-primary hover:underline">+ Relevé véhicule</Link>
          </div>
          {ctrlRows.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">Aucune donnée à comparer cette semaine.</p>
          ) : (
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                <th className="pb-2 font-medium">Chantier</th><th className="pb-2 font-medium">Date</th>
                <th className="pb-2 font-medium text-right">Heures</th><th className="pb-2 font-medium text-right">Véhicule</th><th className="pb-2 font-medium text-right">État</th>
              </tr></thead>
              <tbody>
                {ctrlRows.map((r, i) => (
                  <tr key={i} className="border-b border-gray-50 last:border-0">
                    <td className="py-2.5 text-marine font-medium truncate max-w-[180px]">{r.title}</td>
                    <td className="py-2.5 text-gray-500">{formatDate(r.date)}</td>
                    <td className="py-2.5 text-right tabular-nums text-gray-700">{r.emp} h</td>
                    <td className="py-2.5 text-right tabular-nums text-gray-700">{r.veh} h</td>
                    <td className="py-2.5 text-right"><Badge className={`${CTRL[r.status].cls} border-0 text-[11px]`}>{CTRL[r.status].label}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </CardContent></Card>
      ) : (
        <>
          {/* Synthèse */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Mini label="Total heures" value={`${totals.grand.toFixed(1).replace('.0', '')} h`} tile="bg-[#FCE7DE] text-[#C14E33]" icon={<Clock className="w-4 h-4" />} />
            <Mini label="À vérifier" value={String(totals.aVerifier)} tile="bg-amber-100 text-amber-600" icon={<Clock className="w-4 h-4" />} />
            <Mini label="Masse salariale est." value={formatCurrency(totals.cost)} tile="bg-[#F3E5D6] text-[#8A4B24]" icon={<Users2 className="w-4 h-4" />} />
            <Mini label="Salariés actifs" value={String(employees.length)} tile="bg-[#E9F2DB] text-[#3F7A2E]" icon={<Users2 className="w-4 h-4" />} />
          </div>

          {/* Filtres */}
          <div className="flex flex-wrap gap-2">
            <select value={fStatut} onChange={e => setFStatut(e.target.value as 'tous' | HeureStatus)} className={selSm}>
              <option value="tous">Tous statuts</option><option value="declare">À vérifier</option><option value="valide">Validées</option><option value="refuse">À corriger</option>
            </select>
            <select value={fEmp} onChange={e => setFEmp(e.target.value)} className={selSm}>
              <option value="">Tous salariés</option>{employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
            </select>
            <select value={fProj} onChange={e => setFProj(e.target.value)} className={selSm}>
              <option value="">Tous chantiers</option>{projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
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
                const rows = (rowsByDay.get(d) || []).filter(matchFilter)
                const dayTotal = rows.reduce((s, r) => s + num(hours[r.key]), 0)
                return (
                  <div key={d} className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-semibold text-marine">{DAY_LABELS[i]} {fmtShort(d)}</div>
                      {dayTotal > 0 && <div className="text-xs text-gray-500">{dayTotal.toFixed(1).replace('.0', '')} h</div>}
                    </div>
                    {rows.length === 0 ? (
                      <p className="text-xs text-gray-400">Aucune ligne ce jour.</p>
                    ) : (
                      <div className="space-y-2">
                        {rows.map(r => {
                          const e = empById.get(r.employee_id)
                          const p = r.project_id ? projById.get(r.project_id) : null
                          if (!e) return null
                          const st = (statusMap[r.key] || 'declare') as HeureStatus
                          const hasHours = num(hours[r.key]) > 0
                          const pres = pointedByKey.get(r.key)
                          return (
                            <div key={r.key} className="flex items-center gap-2.5 flex-wrap">
                              <span className="grid place-items-center w-7 h-7 rounded-full text-white text-[10px] font-bold flex-shrink-0" style={{ backgroundColor: e.color }}>{employeeInitials(e.full_name)}</span>
                              <span className="text-sm text-gray-800 w-28 truncate">{e.full_name}</span>
                              <span className="text-xs text-gray-400 flex-1 min-w-[80px] truncate">{p?.title || 'Sans chantier'}</span>
                              {pres && (pres.arrivee || pres.depart) && (
                                <span className="text-[11px] text-emerald-600 flex items-center gap-1" title="Heures pointées sur le chantier (géolocalisé)">
                                  <MapPin className="w-3 h-3" />{pres.arrivee || '—'}<span className="text-emerald-300">→</span>{pres.depart || '—'}
                                </span>
                              )}
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <Input type="number" step="0.5" min="0" value={hours[r.key] || ''}
                                  onChange={ev => setHours(prev => ({ ...prev, [r.key]: ev.target.value }))}
                                  onBlur={() => saveCell(r.employee_id, r.project_id, r.date)}
                                  className={`w-14 h-8 text-sm text-right ${savingKey === r.key ? 'opacity-50' : ''}`} placeholder="0" />
                                <span className="text-xs text-gray-400">h</span>
                              </div>
                              {hasHours && <Badge className={`${ST[st].cls} border-0 text-[10px]`}>{ST[st].label}</Badge>}
                              {hasHours && st !== 'valide' && (
                                <button onClick={() => setStatus(r.key, 'valide')} title="Valider" className="grid place-items-center w-7 h-7 rounded-lg bg-[#F1F6E9] text-[#3F7A2E] hover:bg-[#E9F2DB]"><Check className="w-3.5 h-3.5" /></button>
                              )}
                              {hasHours && st !== 'refuse' && (
                                <button onClick={() => setStatus(r.key, 'refuse')} title="À corriger" className="grid place-items-center w-7 h-7 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100"><X className="w-3.5 h-3.5" /></button>
                              )}
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

          {/* Totaux */}
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
                  {[...totals.perProj.entries()].sort((a, b) => b[1] - a[1]).map(([id, h]) => (
                    <div key={id} className="flex items-center gap-2 text-sm">
                      <Link href={`/chantiers/${id}`} className="flex-1 truncate text-gray-700 hover:text-primary">{projById.get(id)?.title || 'Chantier'}</Link>
                      <span className="font-medium tabular-nums">{h.toFixed(1).replace('.0', '')} h</span>
                    </div>
                  ))}
                </div>
              </CardContent></Card>
            </div>
          )}
        </>
      )}
    </Shell>
  )
}

const sel = 'w-full h-10 rounded-md border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary'
const selSm = 'h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary'

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-5 animate-fade-up">
      <div>
        <h1 className="text-2xl md:text-[26px] font-bold font-heading text-marine">Heures</h1>
        <p className="text-gray-500 mt-1 text-sm">Validez les heures de votre équipe et contrôlez-les avec les véhicules.</p>
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
