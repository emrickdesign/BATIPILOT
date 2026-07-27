'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Loader2, Plus, Trash2, Send, CheckCircle2, ChevronDown, Flag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import type { Meeting, MeetingAction, MeetingSummary } from '@/types'
import { formatDuration } from '../meta'
import { updateAction, addAction, deleteAction, publishMeeting } from '../actions'

type EmployeeLite = { id: string; full_name: string; color: string }

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

  const summary = (meeting.summary || null) as MeetingSummary | null
  const hasSummary = meeting.status === 'ready' || meeting.status === 'published'
  const published = meeting.status === 'published'

  async function generate() {
    setGenerating(true)
    try {
      const res = await fetch('/api/reunions/generer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingId: meeting.id }),
      })
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
      const row = await addAction(meeting.id, meeting.project_id || null)
      setActions((prev) => [...prev, row as MeetingAction])
    } catch { toast.error('Ajout impossible') }
  }
  async function onDelete(id: string) {
    setActions((prev) => prev.filter((a) => a.id !== id))
    try { await deleteAction(id) } catch { toast.error('Suppression impossible') }
  }
  async function publish() {
    setPublishing(true)
    try {
      await publishMeeting(meeting.id)
      toast.success('Réunion publiée — les salariés voient leurs actions.')
      router.refresh()
    } catch (e: any) {
      toast.error(e?.message || 'Publication impossible')
    } finally {
      setPublishing(false)
    }
  }

  // --- Brouillon : transcript prêt, pas encore de compte-rendu ---
  if (!hasSummary) {
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-orange-100 bg-orange-50/50 p-6 text-center">
          <Sparkles className="mx-auto size-7 text-orange-500" />
          <h3 className="mt-2 text-lg font-semibold text-slate-800">Transcription prête</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            Durée {formatDuration(meeting.duration_sec)} · {(meeting.transcript || '').split(/\s+/).filter(Boolean).length} mots.
            L’IA va rédiger le compte-rendu et proposer les actions à assigner.
          </p>
          <Button className="mt-4" onClick={generate} disabled={generating} size="lg">
            {generating ? <><Loader2 className="size-4 animate-spin" /> Génération…</> : <><Sparkles className="size-4" /> Générer le compte-rendu</>}
          </Button>
        </div>
        <TranscriptBlock text={meeting.transcript} open={showTranscript} onToggle={() => setShowTranscript((s) => !s)} />
      </div>
    )
  }

  // --- Compte-rendu prêt (ready / published) ---
  return (
    <div className="space-y-5">
      {summary?.tldr && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-orange-500">En bref</div>
          <p className="text-[15px] leading-relaxed text-slate-700">{summary.tldr}</p>
        </div>
      )}

      {summary && summary.decisions.length > 0 && (
        <Section title="Décisions">
          <ul className="space-y-1.5">
            {summary.decisions.map((d, i) => (
              <li key={i} className="flex gap-2 text-sm text-slate-700"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600" />{d}</li>
            ))}
          </ul>
        </Section>
      )}

      {/* Actions assignées — éditables */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Actions {actions.length > 0 && <span className="text-slate-400">({actions.length})</span>}</h3>
          <Button variant="outline" size="sm" onClick={onAdd}><Plus className="size-3.5" /> Ajouter</Button>
        </div>
        {actions.length === 0 ? (
          <p className="py-2 text-sm text-slate-400">Aucune action — ajoutez-en une ou régénérez.</p>
        ) : (
          <div className="space-y-2">
            {actions.map((a) => (
              <div key={a.id} className="rounded-xl border border-slate-100 bg-slate-50/60 p-2.5">
                <div className="flex items-start gap-2">
                  <input
                    value={a.title}
                    onChange={(e) => patchLocal(a.id, { title: e.target.value })}
                    onBlur={(e) => saveAction(a.id, { title: e.target.value.trim() || 'Action' })}
                    className="min-w-0 flex-1 bg-transparent text-sm font-medium text-slate-800 outline-none"
                  />
                  <button onClick={() => onDelete(a.id)} className="text-slate-300 hover:text-red-500"><Trash2 className="size-4" /></button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <select
                    value={a.employee_id || ''}
                    onChange={(e) => saveAction(a.id, { employee_id: e.target.value || null })}
                    className="h-7 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700"
                  >
                    <option value="">Non assignée</option>
                    {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
                  </select>
                  <input
                    type="date"
                    value={a.due_date || ''}
                    onChange={(e) => saveAction(a.id, { due_date: e.target.value || null })}
                    className="h-7 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-600"
                  />
                  <select
                    value={a.priority}
                    onChange={(e) => saveAction(a.id, { priority: e.target.value as any })}
                    className="h-7 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-600"
                  >
                    <option value="low">Basse</option>
                    <option value="normal">Normale</option>
                    <option value="high">Haute</option>
                  </select>
                  {a.priority === 'high' && <Flag className="size-3.5 text-red-500" />}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {summary && (summary.topics.length > 0 || summary.risks.length > 0 || summary.next_steps.length > 0) && (
        <Section title="Détail">
          {summary.topics.map((t, i) => (
            <div key={i} className="mb-3">
              <div className="text-sm font-semibold text-slate-700">{t.title}</div>
              <ul className="mt-1 space-y-1">{t.points.map((p, j) => <li key={j} className="text-sm text-slate-600">• {p}</li>)}</ul>
            </div>
          ))}
          {summary.risks.length > 0 && (
            <div className="mb-3">
              <div className="text-sm font-semibold text-amber-700">Points de vigilance</div>
              <ul className="mt-1 space-y-1">{summary.risks.map((r, i) => <li key={i} className="text-sm text-slate-600">⚠ {r}</li>)}</ul>
            </div>
          )}
          {summary.next_steps.length > 0 && (
            <div>
              <div className="text-sm font-semibold text-slate-700">Prochaines étapes</div>
              <ul className="mt-1 space-y-1">{summary.next_steps.map((s, i) => <li key={i} className="text-sm text-slate-600">→ {s}</li>)}</ul>
            </div>
          )}
        </Section>
      )}

      <TranscriptBlock text={meeting.transcript} open={showTranscript} onToggle={() => setShowTranscript((s) => !s)} />

      {/* Barre de publication */}
      <div className="sticky bottom-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-lg backdrop-blur">
        <div className="flex items-center gap-2 text-sm">
          {published
            ? <span className="inline-flex items-center gap-1.5 font-medium text-green-700"><CheckCircle2 className="size-4" /> Publiée — visible par les salariés</span>
            : <span className="text-slate-500">Vérifiez les actions puis publiez pour les envoyer aux salariés.</span>}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={generate} disabled={generating}>
            {generating ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />} Régénérer
          </Button>
          <Button onClick={publish} disabled={publishing}>
            {publishing ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} {published ? 'Republier' : 'Publier & assigner'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="mb-2 text-sm font-semibold text-slate-700">{title}</h3>
      {children}
    </div>
  )
}

function TranscriptBlock({ text, open, onToggle }: { text?: string | null; open: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <button onClick={onToggle} className="flex w-full items-center justify-between p-4 text-sm font-semibold text-slate-700">
        Transcription complète
        <ChevronDown className={`size-4 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <p className="whitespace-pre-wrap px-4 pb-4 text-sm leading-relaxed text-slate-600">{text || '—'}</p>}
    </div>
  )
}
