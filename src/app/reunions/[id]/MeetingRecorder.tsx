'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Mic, Square, Loader2, Users, HardHat, AlertTriangle, Radio, Sparkles, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { employeeInitials } from '@/lib/equipe'
import type { Meeting, MeetingAction } from '@/types'
import { meetingTypeLabel, MEETING_STATUS } from '../meta'
import { saveTranscript } from '../actions'
import MeetingReview from './MeetingReview'
import { transcribeAudio, whisperSupported } from './whisper'

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

/* ------------------------------ Enregistrement (audio complet + Whisper local) ------------------------------ */

type Progress = { stage: 'model' | 'transcribe'; pct?: number; label?: string }

function LiveRecorder({ meetingId, consent, participants, onDone }: { meetingId: string; consent: boolean; participants: ParticipantRow[]; onDone: () => void }) {
  const [supported, setSupported] = useState(true)
  const [status, setStatus] = useState<'idle' | 'recording' | 'paused' | 'transcribing'>('idle')
  const [interim, setInterim] = useState('')
  const [preview, setPreview] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [progress, setProgress] = useState<Progress | null>(null)

  // Audio (source de vérité) + reconnaissance live (aperçu best-effort)
  const streamRef = useRef<MediaStream | null>(null)
  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recognitionRef = useRef<any>(null)
  const activeRef = useRef(false)
  const previewRef = useRef('')
  const timerRef = useRef<any>(null)
  const startFreshRef = useRef<() => void>(() => {})

  useEffect(() => { setSupported(whisperSupported()) }, [])

  // --- Aperçu live via Web Speech (facultatif : la transcription finale vient de Whisper) ---
  const buildRecognition = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return null
    const r = new SR()
    r.lang = 'fr-FR'; r.continuous = true; r.interimResults = true
    r.onresult = (e: any) => {
      let pending = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const chunk = e.results[i][0].transcript
        if (e.results[i].isFinal) { previewRef.current = (previewRef.current + ' ' + chunk.trim()).trim(); setPreview(previewRef.current) }
        else pending += chunk
      }
      setInterim(pending)
    }
    r.onerror = () => { /* aperçu best-effort : on ignore */ }
    r.onend = () => { setInterim(''); if (activeRef.current) startFreshRef.current() }
    return r
  }, [])

  const startFresh = useCallback(() => {
    const r = buildRecognition()
    if (!r) return
    recognitionRef.current = r
    try { r.start() } catch { /* ignore */ }
  }, [buildRecognition])
  startFreshRef.current = startFresh

  const stopRecognition = useCallback(() => {
    activeRef.current = false
    try { recognitionRef.current?.stop() } catch { /* ignore */ }
    recognitionRef.current = null
    setInterim('')
  }, [])

  function pickMime() {
    const cands = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
    for (const c of cands) if ((window as any).MediaRecorder?.isTypeSupported?.(c)) return c
    return ''
  }

  async function start() {
    if (!consent) { toast.error('Consentement requis pour enregistrer.'); return }
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, noiseSuppression: true, echoCancellation: true, autoGainControl: true } as any })
    } catch {
      toast.error('Micro refusé. Autorisez le micro dans le navigateur pour enregistrer.')
      return
    }
    streamRef.current = stream
    const mime = pickMime()
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
    chunksRef.current = []
    mr.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data) }
    mr.start(1000)
    mediaRef.current = mr
    activeRef.current = true
    startFresh()
    setStatus('recording')
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000)
  }

  function pause() {
    stopRecognition()
    try { mediaRef.current?.pause() } catch { /* ignore */ }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    setStatus('paused')
  }
  function resume() {
    activeRef.current = true
    startFresh()
    try { mediaRef.current?.resume() } catch { /* ignore */ }
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000)
    setStatus('recording')
  }

  function stopRecorderGetBlob(): Promise<Blob | null> {
    return new Promise((resolve) => {
      const mr = mediaRef.current
      const cleanup = () => streamRef.current?.getTracks().forEach((t) => t.stop())
      if (!mr || mr.state === 'inactive') { cleanup(); return resolve(chunksRef.current.length ? new Blob(chunksRef.current) : null) }
      mr.onstop = () => { cleanup(); resolve(chunksRef.current.length ? new Blob(chunksRef.current, { type: chunksRef.current[0].type }) : null) }
      try { mr.stop() } catch { cleanup(); resolve(chunksRef.current.length ? new Blob(chunksRef.current) : null) }
    })
  }

  useEffect(() => () => { activeRef.current = false; try { recognitionRef.current?.stop() } catch {}; try { mediaRef.current?.stop() } catch {}; streamRef.current?.getTracks().forEach((t) => t.stop()); if (timerRef.current) clearInterval(timerRef.current) }, [])

  async function finish() {
    stopRecognition()
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    setStatus('transcribing')
    setProgress({ stage: 'model', label: 'Préparation' })
    const blob = await stopRecorderGetBlob()

    let text = ''
    if (blob && blob.size > 800) {
      try { text = await transcribeAudio(blob, setProgress) }
      catch (e) { console.error('whisper error', e); toast.error('Transcription auto impossible — on garde l’aperçu.') }
    }
    if (!text) text = previewRef.current.trim()
    if (!text) { toast.error('Rien n’a été capté — reparle un peu avant de terminer.'); setStatus('paused'); setProgress(null); return }

    try {
      await saveTranscript(meetingId, text, elapsed)
      toast.success('Réunion transcrite')
      onDone()
    } catch (e: any) {
      toast.error(e?.message || 'Enregistrement impossible')
      setStatus('paused'); setProgress(null)
    }
  }

  const recording = status === 'recording'
  const transcribing = status === 'transcribing'
  const mmss = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`
  const words = preview.split(/\s+/).filter(Boolean).length

  if (!supported) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
        <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="size-4" /> Enregistrement indisponible</div>
        <p className="mt-1">Ce navigateur ne permet pas l’enregistrement audio. Ouvre cette réunion dans <strong>Google Chrome</strong> (ordinateur ou Android).</p>
      </div>
    )
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(300px,360px)_1fr]">
      {/* Colonne gauche : contrôle + intervenants */}
      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-orange-50/40 p-6 text-center">
          <div className={`mx-auto flex size-24 items-center justify-center rounded-full transition ${recording ? 'animate-pulse bg-red-100 text-red-600 ring-4 ring-red-200' : transcribing ? 'bg-blue-100 text-blue-600' : 'bg-orange-100 text-orange-600'}`}>
            {transcribing ? <Loader2 className="size-10 animate-spin" /> : <Mic className="size-10" />}
          </div>
          <div className="mt-4 font-mono text-3xl font-bold tabular-nums text-slate-900">{mmss}</div>
          <p className={`mt-0.5 inline-flex items-center gap-1.5 text-xs font-medium ${recording ? 'text-red-600' : transcribing ? 'text-blue-600' : 'text-slate-500'}`}>
            {recording && <Radio className="size-3 animate-pulse" />}
            {recording ? 'Enregistrement en cours…' : transcribing ? 'Transcription…' : status === 'paused' ? 'En pause' : 'Prêt à écouter'}
          </p>

          {!transcribing && (
            <div className="mt-5 space-y-2">
              {status === 'idle' || status === 'paused' ? (
                <Button onClick={status === 'paused' ? resume : start} disabled={!consent} size="lg" className="w-full">
                  <Mic className="size-4" /> {status === 'paused' ? 'Reprendre' : 'Démarrer l’écoute'}
                </Button>
              ) : (
                <Button onClick={pause} variant="secondary" size="lg" className="w-full">
                  <Square className="size-4" /> Mettre en pause
                </Button>
              )}
              <Button onClick={finish} size="lg" className="w-full" disabled={status === 'idle' && !preview}>
                Terminer &amp; transcrire
              </Button>
            </div>
          )}
          {!consent && <p className="mt-3 rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] text-amber-700">Consentement non confirmé — enregistrement bloqué.</p>}
        </div>

        <div className="flex items-start gap-2 rounded-xl border border-slate-100 bg-slate-50/60 p-3 text-xs text-slate-500">
          <Mic className="mt-0.5 size-3.5 shrink-0 text-orange-500" />
          <span>L’audio est enregistré en entier, puis transcrit d’un coup à la fin (aucune coupure). Pour un bon résultat, parlez près de l’appareil ; sur chantier bruyant, rapprochez le micro du locuteur.</span>
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

      {/* Colonne droite : aperçu live OU progression de la transcription */}
      <div className="flex min-h-[60vh] flex-col rounded-2xl border border-slate-200 bg-white p-4">
        {transcribing ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
              {progress?.stage === 'model' ? <Download className="size-7" /> : <Sparkles className="size-7" />}
            </div>
            <div className="font-semibold text-slate-800">
              {progress?.stage === 'model' ? 'Téléchargement du modèle de transcription…' : 'Transcription de la réunion…'}
            </div>
            {progress?.stage === 'model' && typeof progress.pct === 'number' && (
              <div className="w-64">
                <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${progress.pct}%` }} /></div>
                <div className="mt-1 text-xs text-slate-400">{progress.pct}% · une seule fois, puis mis en cache</div>
              </div>
            )}
            {progress?.stage === 'transcribe' && <p className="max-w-xs text-xs text-slate-400">Tout est écouté d’un coup, sans coupure. Sur une longue réunion, ça peut prendre un moment — ne fermez pas l’onglet.</p>}
            <Loader2 className="size-5 animate-spin text-blue-500" />
          </div>
        ) : (
          <>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Aperçu en direct <span className="normal-case font-normal text-slate-300">· éditable</span></span>
              <span className="text-xs text-slate-400">{words} mots</span>
            </div>
            <textarea
              value={preview}
              onChange={(e) => { setPreview(e.target.value); previewRef.current = e.target.value }}
              placeholder="L’aperçu s’affiche pendant que vous parlez — vous pouvez corriger ou supprimer du texte. La transcription complète et sans coupure est générée à la fin, à partir de l’audio enregistré."
              className="min-h-0 flex-1 resize-none rounded-xl border border-slate-100 bg-slate-50/40 p-4 text-[15px] leading-relaxed text-slate-700 outline-none focus:border-orange-300"
            />
            {interim && <p className="mt-2 text-[15px] italic text-slate-400">{interim}…</p>}
          </>
        )}
      </div>
    </div>
  )
}
