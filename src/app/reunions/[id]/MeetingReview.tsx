'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Loader2, Plus, Trash2, Send, CheckCircle2, ChevronDown, Check, Pencil, ListChecks, AlertTriangle, ArrowRight, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { employeeInitials } from '@/lib/equipe'
import type { Meeting, MeetingAction, MeetingSummary } from '@/types'
import { formatDuration } from '../meta'
import { updateAction, addAction, deleteAction, publishMeeting, updateTranscript } from '../actions'
import DatePicker from '../DatePicker'

type EmployeeLite = { id: string; full_name: string; color: string }
const PRIOS: { v: 'low' | 'normal' | 'high'; label: string; cls: string; dot: string }[] = [
  { v: 'low', label: 'Basse', cls: 'bg-slate-100 text-slate-600 border-slate-200', dot: 'bg-slate-400' },
  { v: 'normal', label: 'Normale', cls: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500' },
  { v: 'high', label: 'Haute', cls: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500' },
]

export default function MeetingReview({
  meeting,
  actions: initialActions,
  employees,
}: {
  meeting: Meeting
  participants: { employee_id: string; employees: EmployeeLite | null }[]
  actions: MeetingAction[]
  employees: EmployeeLite[]
}) {
  const router = useRouter()
  const [generating, setGenerating] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [actions, setActions] = useState<MeetingAction[]>(initialActions)
  const [showTranscript, setShowTranscript] = useState(false)
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set())
  const [justAdded, setJustAdded] = useState<string | null>(null)

  const empById = new Map(employees.map((e) => [e.id, e]))
  const summary = (meeting.summary || null) as MeetingSummary | null
  const hasSummary = meeting.status === 'ready' || meeting.status === 'published'
  const published = meeting.status === 'published'

  async function generate() {
    setGenerating(true)
    try {
      const res = await fetch('/api/reunions/generer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ meetingId: meeting.id }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Génération impossible')
      toast.success(`Compte-rendu généré — ${data.actionsCount} action(s) proposée(s)`)
      router.refresh()
    } catch (e: any) {
      toast.error(e?.message || 'Génération impossible')
      setGenerating(false)
    }
  }

  function patchLocal(id: string, patch: Partial<MeetingAction>) {
    setActions((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)))
  }
  async function saveAction(id: string, patch: Partial<MeetingAction>) {
    patchLocal(id, patch)
    try { await updateAction(id, patch as any) } catch { toast.error('Modification non enregistrée') }
  }
  async function onAdd() {
    try {
      const row = (await addAction(meeting.id, meeting.project_id || null)) as MeetingAction
      setActions((prev) => [...prev, { ...row, title: '' }])
      setJustAdded(row.id)
    } catch { toast.error('Ajout impossible') }
  }
  async function onDelete(id: string) {
    setActions((prev) => prev.filter((a) => a.id !== id))
    setConfirmed((prev) => { const n = new Set(prev); n.delete(id); return n })
    try { await deleteAction(id) } catch { toast.error('Suppression impossible') }
  }
  function toggleConfirm(a: MeetingAction) {
    if (!confirmed.has(a.id)) {
      if (!a.title.trim()) { toast.error('Donne un intitulé à l’action avant de la valider.'); return }
      saveAction(a.id, { title: a.title.trim() })
    }
    setConfirmed((prev) => { const n = new Set(prev); n.has(a.id) ? n.delete(a.id) : n.add(a.id); return n })
  }
  async function publish() {
    setPublishing(true)
    try {
      await publishMeeting(meeting.id)
      toast.success('Réunion publiée — les salariés voient leurs actions.')
      router.refresh()
    } catch (e: any) { toast.error(e?.message || 'Publication impossible') }
    finally { setPublishing(false) }
  }

  // --- Brouillon : transcript prêt, pas encore de compte-rendu ---
  if (!hasSummary) {
    return (
      <div className="grid gap-5 lg:grid-cols-[1fr_minmax(320px,420px)]">
        <TranscriptPanel meetingId={meeting.id} text={meeting.transcript} open onToggle={() => {}} full />
        <div className="rounded-2xl border border-orange-200 bg-gradient-to-b from-orange-50 to-white p-6 text-center lg:sticky lg:top-6 lg:self-start">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 text-white"><Sparkles className="size-7" /></div>
          <h3 className="mt-3 text-lg font-semibold text-slate-800">Compte-rendu automatique</h3>
          <p className="mx-auto mt-1 max-w-xs text-sm text-slate-500">
            Durée {formatDuration(meeting.duration_sec)} · {(meeting.transcript || '').split(/\s+/).filter(Boolean).length} mots.
            L’IA rédige les notes et propose les actions à assigner.
          </p>
          <Button className="mt-4 w-full" onClick={generate} disabled={generating} size="lg">
            {generating ? <><Loader2 className="size-4 animate-spin" /> Génération…</> : <><Sparkles className="size-4" /> Générer le compte-rendu</>}
          </Button>
        </div>
      </div>
    )
  }

  const confirmedCount = actions.filter((a) => confirmed.has(a.id)).length

  return (
    <div className="space-y-5 pb-28">
      {/* En bref — bandeau coloré pleine largeur */}
      {summary?.tldr && (
        <div className="rounded-2xl border border-orange-200 bg-gradient-to-r from-orange-50 via-orange-50/60 to-white p-5">
          <div className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-orange-600"><Sparkles className="size-3.5" /> En bref</div>
          <p className="text-[15px] leading-relaxed text-slate-800">{summary.tldr}</p>
        </div>
      )}

      {/* Résumé (gauche) + Actions à assigner (droite) */}
      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        {/* Colonne gauche : décisions + sujets */}
        <div className="space-y-5">
          {summary && summary.decisions.length > 0 && (
            <Section title="Décisions" tone="green">
              <ul className="space-y-2">
                {summary.decisions.map((d, i) => <li key={i} className="flex gap-2 text-sm text-slate-700"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600" />{d}</li>)}
              </ul>
            </Section>
          )}
          {summary && (summary.topics.length > 0 || summary.risks.length > 0 || summary.next_steps.length > 0) && (
            <Section title="Sujets & suites" tone="blue">
              {summary.topics.map((t, i) => (
                <div key={i} className="mb-3 last:mb-0">
                  <div className="text-sm font-semibold text-slate-800">{t.title}</div>
                  <ul className="mt-1 space-y-1">{t.points.map((p, j) => <li key={j} className="text-sm text-slate-600">• {p}</li>)}</ul>
                </div>
              ))}
              {summary.risks.length > 0 && (
                <div className="mt-3 rounded-xl bg-amber-50 p-3">
                  <div className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-amber-700"><AlertTriangle className="size-4" /> Points de vigilance</div>
                  <ul className="space-y-1">{summary.risks.map((r, i) => <li key={i} className="text-sm text-amber-800">{r}</li>)}</ul>
                </div>
              )}
              {summary.next_steps.length > 0 && (
                <div className="mt-3">
                  <div className="mb-1 text-sm font-semibold text-slate-800">Prochaines étapes</div>
                  <ul className="space-y-1">{summary.next_steps.map((s, i) => <li key={i} className="flex items-center gap-1.5 text-sm text-slate-600"><ArrowRight className="size-3.5 text-blue-500" />{s}</li>)}</ul>
                </div>
              )}
            </Section>
          )}
        </div>

        {/* Colonne droite : actions à assigner */}
        <div className="rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-4">
            <h3 className="flex items-center gap-2 font-semibold text-slate-800"><ListChecks className="size-5 text-orange-600" /> Actions à assigner {actions.length > 0 && <span className="text-sm font-normal text-slate-400">· {confirmedCount}/{actions.length} validées</span>}</h3>
            <Button variant="outline" size="sm" onClick={onAdd}><Plus className="size-3.5" /> Ajouter</Button>
          </div>

          {actions.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-400">Aucune action — ajoutez-en une ou régénérez le compte-rendu.</p>
          ) : (
            <div className="space-y-2.5 p-4">
              {actions.map((a) => {
                const isConfirmed = confirmed.has(a.id)
                const emp = a.employee_id ? empById.get(a.employee_id) : null
                const prio = PRIOS.find((p) => p.v === a.priority) || PRIOS[1]

                if (isConfirmed) {
                  return (
                    <div key={a.id} className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50/60 p-3">
                      <CheckCircle2 className="size-5 shrink-0 text-green-600" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-slate-800">{a.title}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          {emp ? <span className="inline-flex items-center gap-1"><span className="flex size-4 items-center justify-center rounded-full text-[8px] font-bold text-white" style={{ background: emp.color }}>{employeeInitials(emp.full_name)}</span>{emp.full_name}</span> : <span className="text-slate-400">Non assignée</span>}
                          {a.due_date && <span>· {new Date(a.due_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</span>}
                          <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] ${prio.cls}`}><span className={`size-1.5 rounded-full ${prio.dot}`} />{prio.label}</span>
                        </div>
                      </div>
                      <button onClick={() => toggleConfirm(a)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Modifier"><Pencil className="size-3.5" /></button>
                    </div>
                  )
                }

                return (
                  <div key={a.id} className={`rounded-xl border border-l-4 border-slate-200 bg-white p-3 ${a.priority === 'high' ? 'border-l-red-400' : a.priority === 'low' ? 'border-l-slate-300' : 'border-l-blue-400'}`}>
                    <div className="flex items-start gap-2">
                      <input
                        autoFocus={justAdded === a.id}
                        value={a.title}
                        onChange={(e) => patchLocal(a.id, { title: e.target.value })}
                        onBlur={(e) => saveAction(a.id, { title: e.target.value })}
                        placeholder="Intitulé de l’action à réaliser…"
                        className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm font-medium text-slate-800 outline-none placeholder:font-normal placeholder:text-slate-400 focus:border-orange-300 focus:bg-white"
                      />
                      <button onClick={() => onDelete(a.id)} className="mt-1 rounded-lg p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500"><Trash2 className="size-4" /></button>
                    </div>

                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white pl-2 text-xs">
                        <User className="size-3.5 text-slate-400" />
                        <select value={a.employee_id || ''} onChange={(e) => saveAction(a.id, { employee_id: e.target.value || null })} className="h-8 max-w-[130px] bg-transparent pr-1 text-slate-700 outline-none">
                          <option value="">Non assignée</option>
                          {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
                        </select>
                      </div>

                      <DatePicker value={a.due_date} onChange={(v) => saveAction(a.id, { due_date: v })} />

                      <div className="inline-flex overflow-hidden rounded-full border border-slate-200">
                        {PRIOS.map((p) => (
                          <button key={p.v} onClick={() => saveAction(a.id, { priority: p.v })} className={`px-2.5 py-1 text-[11px] font-medium transition ${a.priority === p.v ? p.cls + ' border-0' : 'bg-white text-slate-400 hover:bg-slate-50'}`}>
                            {p.label}
                          </button>
                        ))}
                      </div>

                      <button onClick={() => toggleConfirm(a)} className="inline-flex items-center gap-1.5 rounded-full bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700">
                        <Check className="size-3.5" /> Valider
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Transcription complète — pleine largeur, sous les deux colonnes */}
      <TranscriptPanel meetingId={meeting.id} text={meeting.transcript} open={showTranscript} onToggle={() => setShowTranscript((s) => !s)} />

      {/* Barre de publication (fixée en bas), boutons plus gros */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur md:left-60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            {published
              ? <span className="inline-flex items-center gap-1.5 font-medium text-green-700"><CheckCircle2 className="size-5" /> Publiée — visible par les salariés</span>
              : actions.length > 0
                ? <span className="text-slate-500"><strong className="text-slate-700">{confirmedCount}/{actions.length}</strong> actions validées — vérifiez, assignez, puis publiez.</span>
                : <span className="text-slate-500">Publier envoie le compte-rendu aux salariés.</span>}
          </div>
          <div className="flex gap-3">
            <Button variant="outline" size="lg" className="h-12 px-6 text-[15px]" onClick={generate} disabled={generating}>
              {generating ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Régénérer
            </Button>
            <Button size="lg" className="h-12 px-8 text-[15px]" onClick={publish} disabled={publishing}>
              {publishing ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />} {published ? 'Republier' : 'Publier & assigner'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children, tone }: { title: string; children: React.ReactNode; tone: 'green' | 'blue' }) {
  const ring = tone === 'green' ? 'border-green-100' : 'border-blue-100'
  const bar = tone === 'green' ? 'bg-green-500' : 'bg-blue-500'
  return (
    <div className={`rounded-2xl border ${ring} bg-white p-4`}>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800"><span className={`h-4 w-1 rounded-full ${bar}`} />{title}</h3>
      {children}
    </div>
  )
}

function TranscriptPanel({ meetingId, text, open, onToggle, full }: { meetingId: string; text?: string | null; open: boolean; onToggle: () => void; full?: boolean }) {
  const [val, setVal] = useState(text || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const words = val.split(/\s+/).filter(Boolean).length

  async function save() {
    if (val === (text || '')) return
    setSaving(true)
    try { await updateTranscript(meetingId, val); setSaved(true); setTimeout(() => setSaved(false), 1500) }
    catch { toast.error('Transcription non enregistrée') }
    finally { setSaving(false) }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <button onClick={onToggle} className="flex w-full items-center justify-between p-4 text-sm font-semibold text-slate-700">
        <span className="flex items-center gap-2"><span className="h-4 w-1 rounded-full bg-slate-400" /> Transcription complète <span className="font-normal text-slate-400">· {words} mots</span></span>
        <span className="flex items-center gap-2">
          {saving ? <Loader2 className="size-4 animate-spin text-slate-400" /> : saved ? <span className="text-xs font-medium text-green-600">Enregistré</span> : null}
          {!full && <ChevronDown className={`size-4 transition ${open ? 'rotate-180' : ''}`} />}
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4">
          <textarea
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onBlur={save}
            placeholder="Transcription…"
            className={`w-full resize-y rounded-xl border border-slate-100 bg-slate-50/40 p-3 text-sm leading-relaxed text-slate-700 outline-none focus:border-orange-300 ${full ? 'min-h-[50vh]' : 'min-h-[200px]'}`}
          />
          <p className="mt-1.5 text-xs text-slate-400">Sélectionnez et supprimez les passages à retirer (hors-sujet, privé…). Le compte-rendu est généré à partir de ce texte.</p>
        </div>
      )}
    </div>
  )
}
