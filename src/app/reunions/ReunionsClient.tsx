'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Mic, Plus, Calendar, Clock, CheckSquare, HardHat, ShieldAlert } from 'lucide-react'
import ReunionsTabs from './ReunionsTabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { employeeInitials } from '@/lib/equipe'
import type { MeetingType } from '@/types'
import { MEETING_TYPES, meetingTypeLabel, MEETING_STATUS, formatDuration } from './meta'
import { createMeeting } from './actions'

type EmployeeLite = { id: string; full_name: string; color: string; role?: string | null }
type MeetingRow = {
  id: string
  title: string
  type: MeetingType
  status: keyof typeof MEETING_STATUS
  occurred_at: string
  duration_sec?: number | null
  confidential: boolean
  project_id?: string | null
  meeting_participants?: { employee_id: string }[]
  meeting_actions?: { id: string; status: string }[]
}

export default function ReunionsClient({
  meetings,
  employees,
  projects,
}: {
  meetings: MeetingRow[]
  employees: EmployeeLite[]
  projects: { id: string; title: string }[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState('')
  const [type, setType] = useState<MeetingType>('chantier_hebdo')
  const [projectId, setProjectId] = useState('')
  const [participants, setParticipants] = useState<string[]>([])
  const [consent, setConsent] = useState(false)

  const empById = new Map(employees.map((e) => [e.id, e]))

  const [fType, setFType] = useState('')
  const [fProj, setFProj] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [fPeriod, setFPeriod] = useState<'all' | 'month' | 'quarter'>('all')

  const filtered = useMemo(() => {
    const now = Date.now()
    return meetings.filter((m) => {
      if (fType && m.type !== fType) return false
      if (fProj && m.project_id !== fProj) return false
      if (fStatus && m.status !== fStatus) return false
      if (fPeriod !== 'all') {
        const days = (now - new Date(m.occurred_at).getTime()) / 86400000
        if (fPeriod === 'month' && days > 31) return false
        if (fPeriod === 'quarter' && days > 92) return false
      }
      return true
    })
  }, [meetings, fType, fProj, fStatus, fPeriod])
  const anyFilter = fType || fProj || fStatus || fPeriod !== 'all'

  function toggleParticipant(id: string) {
    setParticipants((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  }

  async function submit() {
    if (!consent) { toast.error('Merci de confirmer que les participants sont informés de l’enregistrement.'); return }
    setSaving(true)
    try {
      const { id } = await createMeeting({ title, type, projectId: projectId || null, participantIds: participants, consent })
      toast.success('Réunion créée — prête à enregistrer')
      router.push(`/reunions/${id}`)
    } catch (e: any) {
      toast.error(e?.message || 'Création impossible')
      setSaving(false)
    }
  }

  return (
    <div className="w-full">
      <ReunionsTabs />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 text-white"><Mic className="size-5" /></span>
            Réunions
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Enregistrez vos réunions, l’IA rédige le compte-rendu et assigne les actions à vos salariés.
          </p>
        </div>
        <Button size="lg" onClick={() => setOpen(true)}>
          <Plus className="size-4" /> Nouvelle réunion
        </Button>
      </div>

      {meetings.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <select value={fType} onChange={(e) => setFType(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm">
            <option value="">Tous les types</option>
            {MEETING_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <select value={fProj} onChange={(e) => setFProj(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm">
            <option value="">Tous les chantiers</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
          <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm">
            <option value="">Tous les statuts</option>
            {(Object.keys(MEETING_STATUS) as (keyof typeof MEETING_STATUS)[]).map((s) => <option key={s} value={s}>{MEETING_STATUS[s].label}</option>)}
          </select>
          <div className="inline-flex overflow-hidden rounded-lg border border-slate-200">
            {([['all', 'Toutes'], ['month', '30 j'], ['quarter', '3 mois']] as const).map(([v, l]) => (
              <button key={v} onClick={() => setFPeriod(v)} className={`px-3 py-1.5 text-sm transition ${fPeriod === v ? 'bg-orange-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>{l}</button>
            ))}
          </div>
          {anyFilter && <button onClick={() => { setFType(''); setFProj(''); setFStatus(''); setFPeriod('all') }} className="text-sm text-slate-400 hover:text-slate-600">Réinitialiser</button>}
        </div>
      )}

      {meetings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 px-6 py-20 text-center">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-orange-50 text-orange-600">
            <Mic className="size-8" />
          </div>
          <h2 className="text-lg font-semibold text-slate-800">Aucune réunion pour l’instant</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            Lancez votre première réunion : point chantier, sécurité, brief d’équipe… L’IA s’occupe des notes et des actions.
          </p>
          <Button size="lg" className="mt-5" onClick={() => setOpen(true)}>
            <Plus className="size-4" /> Démarrer une réunion
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 px-6 py-12 text-center text-sm text-slate-500">
          Aucune réunion ne correspond aux filtres.
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((m) => {
            const st = MEETING_STATUS[m.status] ?? MEETING_STATUS.draft
            const parts = m.meeting_participants ?? []
            const actions = m.meeting_actions ?? []
            const doneCount = actions.filter((a) => a.status === 'done').length
            return (
              <Link
                key={m.id}
                href={`/reunions/${m.id}`}
                className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-orange-300 hover:shadow-md"
              >
                <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-50 to-orange-100 text-orange-600">
                  {m.type === 'securite' ? <ShieldAlert className="size-5" /> : m.type === 'demarrage' || m.type === 'chantier_hebdo' ? <HardHat className="size-5" /> : <Mic className="size-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-[15px] font-semibold text-slate-900">{m.title}</h3>
                    {m.confidential && <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-white">RH</span>}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span className="font-medium text-orange-600">{meetingTypeLabel(m.type)}</span>
                    <span className="inline-flex items-center gap-1"><Calendar className="size-3" />{new Date(m.occurred_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</span>
                    <span className="inline-flex items-center gap-1"><Clock className="size-3" />{formatDuration(m.duration_sec)}</span>
                    {actions.length > 0 && <span className="inline-flex items-center gap-1"><CheckSquare className="size-3" />{doneCount}/{actions.length} actions</span>}
                  </div>
                </div>
                <div className="hidden -space-x-2 sm:flex">
                  {parts.slice(0, 5).map((p) => {
                    const e = empById.get(p.employee_id)
                    if (!e) return null
                    return (
                      <span key={p.employee_id} title={e.full_name} className="flex size-8 items-center justify-center rounded-full border-2 border-white text-[11px] font-bold text-white" style={{ background: e.color || '#c1531e' }}>
                        {employeeInitials(e.full_name)}
                      </span>
                    )
                  })}
                  {parts.length > 5 && <span className="flex size-8 items-center justify-center rounded-full border-2 border-white bg-slate-200 text-[11px] font-bold text-slate-600">+{parts.length - 5}</span>}
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${st.className}`}>{st.label}</span>
              </Link>
            )
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[95vw] sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl">Nouvelle réunion</DialogTitle>
          </DialogHeader>

          <div className="grid gap-5 md:grid-cols-2">
            {/* Colonne gauche : infos */}
            <div className="space-y-4">
              <div>
                <Label htmlFor="m-title">Titre</Label>
                <Input id="m-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Point chantier — semaine 12" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="m-type">Type de réunion</Label>
                <select id="m-type" value={type} onChange={(e) => setType(e.target.value as MeetingType)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm">
                  {MEETING_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <p className="mt-1 text-xs text-slate-400">{MEETING_TYPES.find((t) => t.value === type)?.hint}</p>
              </div>
              <div>
                <Label htmlFor="m-project">Chantier lié <span className="text-slate-400">(optionnel)</span></Label>
                <select id="m-project" value={projectId} onChange={(e) => setProjectId(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm">
                  <option value="">— Aucun —</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
              </div>
            </div>

            {/* Colonne droite : participants */}
            <div className="flex flex-col">
              <Label>Participants {participants.length > 0 && <span className="text-orange-600">({participants.length})</span>}</Label>
              {employees.length === 0 ? (
                <p className="mt-2 text-xs text-slate-400">Aucun salarié — ajoutez votre équipe dans « Salariés ».</p>
              ) : (
                <div className="mt-2 flex max-h-56 flex-col gap-1.5 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/50 p-2">
                  {employees.map((e) => {
                    const on = participants.includes(e.id)
                    return (
                      <button key={e.id} type="button" onClick={() => toggleParticipant(e.id)} className={`flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left text-sm transition ${on ? 'border-orange-300 bg-orange-50' : 'border-transparent bg-white hover:bg-slate-100'}`}>
                        <span className="flex size-7 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: e.color || '#c1531e' }}>{employeeInitials(e.full_name)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-slate-800">{e.full_name}</span>
                          {e.role && <span className="block truncate text-[11px] text-slate-400">{e.role}</span>}
                        </span>
                        <span className={`flex size-4 items-center justify-center rounded-full border ${on ? 'border-orange-500 bg-orange-500' : 'border-slate-300'}`}>{on && <CheckSquare className="size-3 text-white" />}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <label className="mt-1 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-4 accent-orange-600" />
            <span>Je confirme que les participants ont été <strong>informés de l’enregistrement</strong> de cette réunion.</span>
          </label>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Annuler</Button>
            <Button size="lg" onClick={submit} disabled={saving || !consent}>
              {saving ? 'Création…' : <><Mic className="size-4" /> Créer & enregistrer</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
