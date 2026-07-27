'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Mic, Square, Loader2, Users, HardHat, AlertTriangle, Radio } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { employeeInitials } from '@/lib/equipe'
import type { Meeting, MeetingAction } from '@/types'
import { meetingTypeLabel, MEETING_STATUS } from '../meta'
import { saveTranscript } from '../actions'
import MeetingReview from './MeetingReview'

type ParticipantRow = { employee_id: string; employees: { id: string; full_name: string; color: string } | null }

export default function MeetingRecorder({
  meeting,
  participants,
  actions,
  employees,
}: {
  meeting: Meeting & { projects?: { title: string } | null }
  participants: ParticipantRow[]
  actions: MeetingAction[]
  employees: { id: string; full_name: string; color: string }[]
}) {
  const router = useRouter()
  const isRecordingStage = meeting.status === 'recording'

  return (
    <div className="w-full">
      <Link href="/reunions" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" /> Réunions
      </Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{meeting.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
            <span className="font-medium text-orange-600">{meetingTypeLabel(meeting.type)}</span>
            {meeting.projects?.title && <span className="inline-flex items-center gap-1"><HardHat className="size-3.5" />{meeting.projects.title}</span>}
            <span>{new Date(meeting.occurred_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
          </div>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${(MEETING_STATUS[meeting.status] ?? MEETING_STATUS.draft).className}`}>
          {(MEETING_STATUS[meeting.status] ?? MEETING_STATUS.draft).label}
        </span>
      </div>

      {isRecordingStage
        ? <LiveRecorder meetingId={meeting.id} consent={meeting.consent} participants={participants} onDone={() => router.refresh()} />
        : <MeetingReview meeting={meeting} participants={participants} actions={actions} employees={employees} />}
    </div>
  )
}

/* ------------------------------ Enregistrement live (pleine largeur, 2 colonnes) ------------------------------ */

function LiveRecorder({ meetingId, consent, participants, onDone }: { meetingId: string; consent: boolean; participants: ParticipantRow[]; onDone: () => void }) {
  const [supported, setSupported] = useState(true)
  const [recording, setRecording] = useState(false)
  const [interim, setInterim] = useState('')
  const [transcript, setTranscript] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [saving, setSaving] = useState(false)

  const recognitionRef = useRef<any>(null)
  const activeRef = useRef(false)
  const transcriptRef = useRef('')
  const timerRef = useRef<any>(null)

  useEffect(() => {
    const SR = typeof window !== 'undefined' && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
    setSupported(!!SR)
  }, [])

  const buildRecognition = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    const r = new SR()
    r.lang = 'fr-FR'
    r.continuous = true
    r.interimResults = true
    r.onresult = (e: any) => {
      let pending = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const chunk = e.results[i][0].transcript
        if (e.results[i].isFinal) {
          transcriptRef.current = (transcriptRef.current + ' ' + chunk.trim()).trim()
          setTranscript(transcriptRef.current)
        } else pending += chunk
      }
      setInterim(pending)
    }
    r.onerror = (e: any) => {
      if (e?.error === 'not-allowed' || e?.error === 'service-not-allowed') {
        activeRef.current = false
        setRecording(false)
        toast.error('Micro refusé. Autorisez le micro dans le navigateur pour enregistrer.')
      }
    }
    r.onend = () => {
      setInterim('')
      if (activeRef.current) { try { r.start() } catch { /* déjà en cours */ } }
      else setRecording(false)
    }
    return r
  }, [])

  const start = useCallback(() => {
    if (!consent) { toast.error('Consentement requis pour enregistrer.'); return }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) { setSupported(false); return }
    activeRef.current = true
    const r = buildRecognition()
    recognitionRef.current = r
    try { r.start() } catch { /* ignore */ }
    setRecording(true)
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000)
  }, [buildRecognition, consent])

  const stop = useCallback(() => {
    activeRef.current = false
    try { recognitionRef.current?.stop() } catch { /* ignore */ }
    recognitionRef.current = null
    setRecording(false)
    setInterim('')
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }, [])

  useEffect(() => () => { activeRef.current = false; try { recognitionRef.current?.stop() } catch {} ; if (timerRef.current) clearInterval(timerRef.current) }, [])

  async function finish() {
    stop()
    const text = transcriptRef.current.trim()
    if (!text) { toast.error('Rien n’a été capté — parle un peu avant de terminer.'); return }
    setSaving(true)
    try {
      await saveTranscript(meetingId, text, elapsed)
      toast.success('Réunion enregistrée')
      onDone()
    } catch (e: any) {
      toast.error(e?.message || 'Enregistrement impossible')
      setSaving(false)
    }
  }

  const mmss = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`
  const words = transcript.split(/\s+/).filter(Boolean).length

  if (!supported) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
        <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="size-4" /> Reconnaissance vocale indisponible</div>
        <p className="mt-1">La transcription live utilise la reconnaissance vocale du navigateur, disponible sur <strong>Google Chrome</strong> (ordinateur ou Android). Ouvre cette réunion dans Chrome pour enregistrer.</p>
      </div>
    )
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(300px,360px)_1fr]">
      {/* Colonne gauche : contrôle + intervenants */}
      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-orange-50/40 p-6 text-center">
          <div className={`mx-auto flex size-24 items-center justify-center rounded-full transition ${recording ? 'animate-pulse bg-red-100 text-red-600 ring-4 ring-red-200' : 'bg-orange-100 text-orange-600'}`}>
            <Mic className="size-10" />
          </div>
          <div className="mt-4 font-mono text-3xl font-bold tabular-nums text-slate-900">{mmss}</div>
          <p className={`mt-0.5 inline-flex items-center gap-1.5 text-xs font-medium ${recording ? 'text-red-600' : 'text-slate-500'}`}>
            {recording && <Radio className="size-3 animate-pulse" />}
            {recording ? 'Écoute en cours…' : transcript ? 'En pause' : 'Prêt à écouter'}
          </p>

          <div className="mt-5 space-y-2">
            {!recording ? (
              <Button onClick={start} disabled={!consent} size="lg" className="w-full">
                <Mic className="size-4" /> {transcript ? 'Reprendre l’écoute' : 'Démarrer l’écoute'}
              </Button>
            ) : (
              <Button onClick={stop} variant="secondary" size="lg" className="w-full">
                <Square className="size-4" /> Mettre en pause
              </Button>
            )}
            <Button onClick={finish} size="lg" className="w-full" disabled={saving || (!transcript && !recording)}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : 'Terminer & enregistrer'}
            </Button>
          </div>
          {!consent && <p className="mt-3 rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] text-amber-700">Consentement non confirmé — enregistrement bloqué.</p>}
        </div>

        <div className="flex items-start gap-2 rounded-xl border border-slate-100 bg-slate-50/60 p-3 text-xs text-slate-500">
          <Mic className="mt-0.5 size-3.5 shrink-0 text-orange-500" />
          <span>Pour une bonne transcription, <strong className="text-slate-700">parlez près de l’appareil, dans un endroit calme</strong>. Sur un chantier bruyant ou à plusieurs, rapprochez le micro du locuteur : la reconnaissance du navigateur capte mal le son lointain ou couvert par le bruit.</span>
        </div>

        {participants.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400"><Users className="size-3.5" /> Intervenants</div>
            <div className="flex flex-wrap gap-2">
              {participants.map((p) => p.employees ? (
                <span key={p.employee_id} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700">
                  <span className="flex size-4 items-center justify-center rounded-full text-[8px] font-bold text-white" style={{ background: p.employees.color || '#c1531e' }}>{employeeInitials(p.employees.full_name)}</span>
                  {p.employees.full_name}
                </span>
              ) : null)}
            </div>
          </div>
        )}
      </div>

      {/* Colonne droite : transcription live */}
      <div className="flex min-h-[60vh] flex-col rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Transcription en direct</span>
          <span className="text-xs text-slate-400">{words} mots</span>
        </div>
        <textarea
          value={transcript}
          onChange={(e) => { setTranscript(e.target.value); transcriptRef.current = e.target.value }}
          placeholder="Le texte de la réunion s’écrit ici au fur et à mesure. Vous pouvez le corriger avant de terminer."
          className="min-h-0 flex-1 resize-none rounded-xl border border-slate-100 bg-slate-50/40 p-4 text-[15px] leading-relaxed text-slate-700 outline-none focus:border-orange-300"
        />
        {interim && <p className="mt-2 text-[15px] italic text-slate-400">{interim}…</p>}
      </div>
    </div>
  )
}
