'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { MessageSquarePlus, Send, Users2, Search, Mic, Square, Trash2, Video, Play, Pause, Phone, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { createConversation, sendMessage, sendVoiceMessage, createCalendarMeeting, getNewMessages } from './actions'
import { createClient } from '@/lib/supabase/client'
import { employeeInitials } from '@/lib/equipe'
import { entityColors } from '@/lib/entityColors'
import type { Conversation, ConversationParticipant, Employee, Message } from '@/types'
import { cn } from '@/lib/utils'

type Viewer = { kind: 'admin' } | { kind: 'employee'; employeeId: string }

type Props = {
  currentAdminName: string
  conversations: Conversation[]
  participants: (ConversationParticipant & { employees: Employee })[]
  employees: Employee[]
  initialMessages: Message[]
  viewer: Viewer
}

const COLOR = entityColors.salarie

function relativeTime(iso: string) {
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (diffMin < 1) return 'à l\'instant'
  if (diffMin < 60) return `${diffMin} min`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH} h`
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

function VoiceBubble({ src, seconds, mine }: { src: string; seconds?: number; mine: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const bars = useMemo(() => Array.from({ length: 26 }, (_, i) => 0.28 + Math.abs(Math.sin(i * 1.7)) * 0.72), [])
  const dur = typeof seconds === 'number' ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : ''
  const toggle = () => { const a = audioRef.current; if (!a) return; if (a.paused) a.play(); else a.pause() }
  return (
    <div className="flex items-center gap-2.5 min-w-[180px]">
      <button type="button" onClick={toggle} className={cn('grid place-items-center w-8 h-8 rounded-full flex-shrink-0', mine ? 'bg-white/25 text-white' : 'bg-[#E0674C] text-white')}>
        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
      </button>
      <div className="flex items-center gap-[2px] h-6 flex-1">
        {bars.map((b, i) => (
          <span key={i} className="w-[2.5px] rounded-full" style={{ height: `${b * 100}%`, backgroundColor: mine ? 'rgba(255,255,255,.85)' : '#E0674C', opacity: i / bars.length <= progress ? 1 : 0.35 }} />
        ))}
      </div>
      {dur && <span className={cn('text-[10px] tabular-nums flex-shrink-0', mine ? 'text-white/80' : 'text-gray-400')}>{dur}</span>}
      <audio ref={audioRef} src={src} className="hidden" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setProgress(0) }} onTimeUpdate={e => { const a = e.currentTarget; setProgress(a.duration ? a.currentTime / a.duration : 0) }} />
    </div>
  )
}

export default function MessagesView({ conversations, participants, employees, initialMessages, viewer }: Props) {
  const participantsByConv = useMemo(() => {
    const m = new Map<string, Employee[]>()
    for (const p of participants) {
      if (!m.has(p.conversation_id)) m.set(p.conversation_id, [])
      if (p.employees) m.get(p.conversation_id)!.push(p.employees)
    }
    return m
  }, [participants])

  const myConversations = useMemo(() => {
    if (viewer.kind === 'admin') return conversations
    return conversations.filter(c => (participantsByConv.get(c.id) || []).some(e => e.id === viewer.employeeId))
  }, [conversations, participantsByConv, viewer])

  const [messagesByConv, setMessagesByConv] = useState(() => {
    const m = new Map<string, Message[]>()
    for (const msg of initialMessages) {
      if (!m.has(msg.conversation_id)) m.set(msg.conversation_id, [])
      m.get(msg.conversation_id)!.push(msg)
    }
    return m
  })

  const convLastMessage = (id: string) => {
    const list = messagesByConv.get(id)
    return list && list.length ? list[list.length - 1] : null
  }

  const sortedConversations = useMemo(() => {
    return [...myConversations].sort((a, b) => {
      const la = convLastMessage(a.id)?.created_at || a.created_at
      const lb = convLastMessage(b.id)?.created_at || b.created_at
      return new Date(lb).getTime() - new Date(la).getTime()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myConversations, messagesByConv])

  const [selectedId, setSelectedId] = useState<string | null>(sortedConversations[0]?.id || null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [newConvOpen, setNewConvOpen] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'all' | 'direct' | 'group'>('all')
  const [mobileThread, setMobileThread] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recSeconds, setRecSeconds] = useState(0)
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  const [recordedSeconds, setRecordedSeconds] = useState(0)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recSecondsRef = useRef(0)
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const cancelledRef = useRef(false)
  const [prevSelectedId, setPrevSelectedId] = useState(selectedId)
  if (selectedId !== prevSelectedId) {
    setPrevSelectedId(selectedId)
    setSendError(null)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setRecordedBlob(null)
    setRecordedSeconds(0)
    setPreviewUrl(null)
  }

  useEffect(() => {
    return () => {
      if (recTimerRef.current) clearInterval(recTimerRef.current)
      mediaRecorderRef.current?.stream?.getTracks().forEach(t => t.stop())
    }
  }, [])

  const convName = (c: Conversation) => {
    const emps = participantsByConv.get(c.id) || []
    if (c.type === 'group') return c.name || `Groupe (${emps.length})`
    if (viewer.kind === 'admin') return emps[0]?.full_name || 'Salarié'
    return 'Direction'
  }

  const senderLabel = (m: Message) => {
    if (m.sender_type === 'admin') return 'Direction'
    const emp = employees.find(e => e.id === m.sender_employee_id)
      || (participantsByConv.get(m.conversation_id) || []).find(e => e.id === m.sender_employee_id)
    return emp?.full_name || 'Salarié'
  }

  const isMine = (m: Message) =>
    viewer.kind === 'admin' ? m.sender_type === 'admin' : m.sender_type === 'employee' && m.sender_employee_id === viewer.employeeId

  const supabase = useMemo(() => createClient(), [])

  function addFreshMessages(convId: string, incoming: Message[]) {
    if (!incoming.length) return
    setMessagesByConv(prev => {
      const next = new Map(prev)
      const existing = next.get(convId) || []
      const ids = new Set(existing.map(m => m.id))
      const fresh = incoming.filter(m => !ids.has(m.id))
      if (fresh.length) next.set(convId, [...existing, ...fresh])
      return next
    })
  }

  // Temps réel : diffusion Supabase (broadcast, pas Postgres Changes — un salarié n'a pas de
  // session auth.uid() donc ne passerait jamais les policies RLS). Voir broadcastNewMessage
  // dans actions.ts pour le détail du choix et de son compromis de sécurité.
  useEffect(() => {
    if (!selectedId) return
    const channel = supabase.channel(`conversation:${selectedId}`)
    channel.on('broadcast', { event: 'new_message' }, ({ payload }) => {
      addFreshMessages(selectedId, [payload as Message])
    }).subscribe()
    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  // Poll de secours (rattrape un événement broadcast manqué — coupure réseau, onglet en veille...)
  useEffect(() => {
    if (!selectedId) return
    const interval = setInterval(async () => {
      const list = messagesByConv.get(selectedId) || []
      const last = list[list.length - 1]
      const after = last ? last.created_at : new Date(0).toISOString()
      const res = await getNewMessages(selectedId, after, viewer)
      if (res.messages) addFreshMessages(selectedId, res.messages)
    }, 15000)
    return () => clearInterval(interval)
  }, [selectedId, messagesByConv])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [selectedId, messagesByConv])

  async function handleSend() {
    if (!selectedId || !draft.trim() || sending) return
    setSending(true)
    setSendError(null)
    const body = draft.trim()
    setDraft('')
    try {
      const res = await sendMessage(selectedId, body, viewer)
      if (res.success) {
        setMessagesByConv(prev => {
          const next = new Map(prev)
          const existing = next.get(selectedId) || []
          next.set(selectedId, [...existing, {
            id: `tmp-${Date.now()}`, conversation_id: selectedId, user_id: '', created_at: new Date().toISOString(),
            sender_type: viewer.kind, sender_employee_id: viewer.kind === 'employee' ? viewer.employeeId : undefined, body,
          }])
          return next
        })
      } else {
        setDraft(body)
        setSendError(res.error || 'Erreur lors de l\'envoi.')
      }
    } catch {
      setDraft(body)
      setSendError('Erreur lors de l\'envoi.')
    } finally {
      setSending(false)
    }
  }

  async function sendVoiceRecording(blob: Blob, seconds: number) {
    if (!selectedId) return
    const convId = selectedId
    setSending(true)
    setSendError(null)
    try {
      const ext = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm'
      const formData = new FormData()
      formData.set('conversationId', convId)
      formData.set('duration', String(seconds))
      formData.set('audio', blob, `voice.${ext}`)
      const res = await sendVoiceMessage(formData, viewer)
      if (!res.success) {
        setSendError(res.error || 'Erreur lors de l\'envoi du message vocal.')
      }
      // Pas de mise à jour optimiste ici : l'upload prend un temps non négligeable,
      // le poll (3s) risquerait de récupérer le vrai message avant qu'on ajoute la copie
      // locale (id différent => doublon). Le poll suffit à l'afficher sous 3s.
    } catch {
      setSendError('Erreur lors de l\'envoi du message vocal.')
    } finally {
      setSending(false)
    }
  }

  function pickAudioMimeType() {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
    return candidates.find(t => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) || ''
  }

  async function startRecording() {
    if (recording || sending) return
    setSendError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = pickAudioMimeType()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      chunksRef.current = []
      cancelledRef.current = false
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        if (recTimerRef.current) clearInterval(recTimerRef.current)
        const seconds = recSecondsRef.current
        setRecording(false)
        setRecSeconds(0)
        if (cancelledRef.current) { cancelledRef.current = false; return }
        const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' })
        if (blob.size > 0) {
          setRecordedBlob(blob)
          setRecordedSeconds(seconds)
          setPreviewUrl(URL.createObjectURL(blob))
        }
      }
      mediaRecorderRef.current = recorder
      recSecondsRef.current = 0
      recorder.start()
      setRecording(true)
      setRecSeconds(0)
      recTimerRef.current = setInterval(() => {
        recSecondsRef.current += 1
        setRecSeconds(recSecondsRef.current)
      }, 1000)
    } catch {
      setSendError('Micro indisponible ou permission refusée.')
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop()
  }

  function cancelRecording() {
    cancelledRef.current = true
    mediaRecorderRef.current?.stop()
  }

  function discardRecordedVoice() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setRecordedBlob(null)
    setRecordedSeconds(0)
    setPreviewUrl(null)
  }

  function confirmSendRecordedVoice() {
    if (!recordedBlob) return
    const blob = recordedBlob
    const seconds = recordedSeconds
    discardRecordedVoice()
    sendVoiceRecording(blob, seconds)
  }

  const selected = sortedConversations.find(c => c.id === selectedId) || null
  const selectedMessages = selectedId ? (messagesByConv.get(selectedId) || []) : []
  const roster = employees.filter(e => viewer.kind === 'admin' || e.id !== viewer.employeeId)

  return (
    <div className="flex gap-4 h-[calc(100vh-9rem)] min-h-[540px]">
      {/* ── Liste des conversations ── */}
      <div className={cn('w-full md:w-[300px] xl:w-[336px] flex-shrink-0 flex-col overflow-hidden rounded-2xl bg-white border border-[#EFE8DF] shadow-[var(--shadow-md)]', mobileThread ? 'hidden md:flex' : 'flex')}>
        <div className="p-4 pb-3">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-marine">Messages</h2>
            <button onClick={() => setNewConvOpen(true)} title="Nouvelle conversation" className="grid place-items-center w-9 h-9 rounded-full text-white shadow-[0_6px_14px_-4px_rgba(208,92,67,.5)]" style={{ background: 'linear-gradient(135deg,#F09A80,#D05C43)' }}>
              <MessageSquarePlus className="w-[18px] h-[18px]" />
            </button>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher" className="w-full h-10 pl-9 pr-3 rounded-full bg-[#F5F1EA] border border-transparent focus:border-[#E7C7B8] focus:bg-white text-sm outline-none transition-colors" />
          </div>
          {sortedConversations.length > 0 && (
            <div className="flex gap-3 overflow-x-auto pt-3.5 pb-1 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {sortedConversations.slice(0, 12).map(c => {
                const emps = participantsByConv.get(c.id) || []
                return (
                  <button key={c.id} onClick={() => { setSelectedId(c.id); setMobileThread(true) }} className="flex flex-col items-center gap-1 flex-shrink-0 w-[52px]">
                    <span className={cn('grid place-items-center w-12 h-12 rounded-full text-white text-xs font-bold ring-2 ring-offset-2 ring-offset-white', c.id === selectedId ? 'ring-[#E0674C]' : 'ring-transparent')} style={{ backgroundColor: c.type === 'group' ? COLOR : (emps[0]?.color || COLOR) }}>
                      {c.type === 'group' ? <Users2 className="w-5 h-5" /> : (emps[0] ? employeeInitials(emps[0].full_name) : 'D')}
                    </span>
                    <span className="text-[10px] text-gray-500 truncate w-full text-center">{convName(c).split(' ')[0]}</span>
                  </button>
                )
              })}
            </div>
          )}
          <div className="flex gap-1 mt-3 p-1 rounded-full bg-[#F4F0E9]">
            {([['all', 'Tous'], ['direct', 'Directs'], ['group', 'Groupes']] as const).map(([k, lbl]) => (
              <button key={k} onClick={() => setTab(k)} className={cn('flex-1 py-1.5 rounded-full text-xs font-medium transition-colors', tab === k ? 'bg-white text-[#C14E33] shadow-sm' : 'text-gray-500 hover:text-gray-700')}>{lbl}</button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {sortedConversations.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-400">Aucune conversation.</div>
          ) : (
            sortedConversations
              .filter(c => tab === 'all' ? true : tab === 'group' ? c.type === 'group' : c.type !== 'group')
              .filter(c => convName(c).toLowerCase().includes(search.toLowerCase()))
              .map(c => {
                const emps = participantsByConv.get(c.id) || []
                const last = convLastMessage(c.id)
                const active = c.id === selectedId
                return (
                  <button key={c.id} onClick={() => { setSelectedId(c.id); setMobileThread(true) }} className={cn('w-full flex items-center gap-3 p-2.5 rounded-xl text-left transition-colors mb-0.5', active ? 'bg-[#FCE7DE]' : 'hover:bg-black/[0.03]')}>
                    <span className="grid place-items-center w-11 h-11 rounded-full flex-shrink-0 text-white text-[13px] font-bold" style={{ backgroundColor: c.type === 'group' ? COLOR : (emps[0]?.color || COLOR) }}>
                      {c.type === 'group' ? <Users2 className="w-5 h-5" /> : (emps[0] ? employeeInitials(emps[0].full_name) : 'D')}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className={cn('text-sm font-semibold truncate', active ? 'text-[#C14E33]' : 'text-gray-900')}>{convName(c)}</p>
                        {last && <span className="text-[10px] text-gray-400 flex-shrink-0">{relativeTime(last.created_at)}</span>}
                      </div>
                      <p className="text-xs text-gray-400 truncate mt-0.5">{last ? (last.audio_url ? '🎤 Message vocal' : last.body) : 'Aucun message'}</p>
                    </div>
                  </button>
                )
              })
          )}
        </div>
      </div>

      {/* ── Fil de discussion ── */}
      <div className={cn('flex-1 flex-col overflow-hidden rounded-2xl bg-white border border-[#EFE8DF] shadow-[var(--shadow-md)]', mobileThread ? 'flex' : 'hidden md:flex')}>
        {!selected ? (
          <div className="flex-1 grid place-items-center text-center text-gray-400 p-8">
            <div>
              <div className="w-14 h-14 rounded-2xl mx-auto mb-3 grid place-items-center bg-[#FCE7DE] text-[#C14E33]"><MessageSquarePlus className="w-7 h-7" /></div>
              <p className="text-sm">Choisis une conversation, ou démarre-en une nouvelle.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="px-4 py-3 border-b border-[#F0EAE1] flex items-center gap-3 bg-gradient-to-r from-white to-[#FBF2EC]">
              <button onClick={() => setMobileThread(false)} className="md:hidden grid place-items-center w-8 h-8 rounded-full hover:bg-black/5 text-gray-500 flex-shrink-0"><ArrowLeft className="w-5 h-5" /></button>
              <span className="grid place-items-center w-10 h-10 rounded-full flex-shrink-0 text-white text-xs font-bold" style={{ backgroundColor: selected.type === 'group' ? COLOR : ((participantsByConv.get(selected.id) || [])[0]?.color || COLOR) }}>
                {selected.type === 'group' ? <Users2 className="w-5 h-5" /> : employeeInitials(convName(selected))}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-marine truncate">{convName(selected)}</p>
                {selected.type === 'group'
                  ? <p className="text-[11px] text-gray-400 truncate">{(participantsByConv.get(selected.id) || []).length} participants</p>
                  : <p className="text-[11px] text-[#3F7A2E] flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#3F7A2E]" /> En ligne</p>}
              </div>
              <button onClick={() => setScheduleOpen(true)} title="Planifier un appel" className="grid place-items-center w-9 h-9 rounded-full bg-[#F5F1EA] hover:bg-[#EFE8DF] text-[#C14E33]"><Phone className="w-[18px] h-[18px]" /></button>
              <button onClick={() => setScheduleOpen(true)} title="Planifier une visio" className="grid place-items-center w-9 h-9 rounded-full bg-[#F5F1EA] hover:bg-[#EFE8DF] text-[#C14E33]"><Video className="w-[18px] h-[18px]" /></button>
            </div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-2.5 bg-[#FBF9F6]">
              {selectedMessages.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-8">Aucun message. Écris le premier !</p>
              ) : (
                selectedMessages.map(m => {
                  const mine = isMine(m)
                  return (
                    <div key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                      <div className={cn('max-w-[78%] px-3.5 py-2 shadow-sm', mine ? 'rounded-2xl rounded-br-md bg-gradient-to-br from-[#F09A80] to-[#D05C43] text-white' : 'rounded-2xl rounded-bl-md bg-white border border-[#EFE8DF] text-gray-800')}>
                        {selected.type === 'group' && !mine && <p className="text-[11px] font-semibold mb-0.5" style={{ color: COLOR }}>{senderLabel(m)}</p>}
                        {m.audio_url ? (
                          <VoiceBubble src={m.audio_url} seconds={typeof m.duration_sec === 'number' ? m.duration_sec : undefined} mine={mine} />
                        ) : (
                          <p className="text-[14px] whitespace-pre-wrap break-words leading-snug">{m.body}</p>
                        )}
                        <p className={cn('text-[10px] mt-1 text-right', mine ? 'text-white/70' : 'text-gray-400')}>{relativeTime(m.created_at)}</p>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
            {sendError && <p className="px-4 pt-2 text-xs text-red-600">{sendError}</p>}
            <div className="p-3 border-t border-[#F0EAE1]">
              {recording ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-11 rounded-full border border-red-200 bg-red-50 flex items-center gap-2 px-4 text-sm text-red-600">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    Enregistrement... {Math.floor(recSeconds / 60)}:{String(recSeconds % 60).padStart(2, '0')}
                  </div>
                  <button onClick={cancelRecording} title="Annuler" className="grid place-items-center w-11 h-11 rounded-full bg-[#F5F1EA] text-gray-500 hover:bg-[#EFE8DF]"><Trash2 className="w-5 h-5" /></button>
                  <button onClick={stopRecording} title="Arrêter" className="grid place-items-center w-11 h-11 rounded-full text-white" style={{ background: 'linear-gradient(135deg,#F09A80,#D05C43)' }}><Square className="w-5 h-5" /></button>
                </div>
              ) : previewUrl ? (
                <div className="flex items-center gap-2">
                  <audio controls src={previewUrl} className="flex-1 h-11 min-w-0" />
                  <button onClick={discardRecordedVoice} disabled={sending} title="Supprimer" className="grid place-items-center w-11 h-11 rounded-full bg-[#F5F1EA] text-gray-500 hover:bg-[#EFE8DF] disabled:opacity-50"><Trash2 className="w-5 h-5" /></button>
                  <button onClick={confirmSendRecordedVoice} disabled={sending} title="Envoyer" className="grid place-items-center w-11 h-11 rounded-full text-white disabled:opacity-50" style={{ background: 'linear-gradient(135deg,#F09A80,#D05C43)' }}><Send className="w-5 h-5" /></button>
                </div>
              ) : (
                <div className="flex items-center gap-2 bg-[#F5F1EA] rounded-full pl-4 pr-1.5 py-1.5">
                  <input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }} placeholder="Écris ton message..." className="flex-1 bg-transparent text-sm outline-none h-8" />
                  {draft.trim() ? (
                    <button onClick={handleSend} disabled={sending} className="grid place-items-center w-9 h-9 rounded-full text-white flex-shrink-0 disabled:opacity-50" style={{ background: 'linear-gradient(135deg,#F09A80,#D05C43)' }}><Send className="w-[18px] h-[18px]" /></button>
                  ) : (
                    <button onClick={startRecording} disabled={sending} title="Message vocal" className="grid place-items-center w-9 h-9 rounded-full bg-white text-[#C14E33] flex-shrink-0 shadow-sm disabled:opacity-50"><Mic className="w-[18px] h-[18px]" /></button>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Panneau infos (desktop large) ── */}
      <div className="hidden xl:flex w-[300px] flex-shrink-0 flex-col overflow-hidden rounded-2xl bg-white border border-[#EFE8DF] shadow-[var(--shadow-md)]">
        {!selected ? (
          <div className="flex-1 grid place-items-center text-center text-gray-400 p-6"><p className="text-xs">Sélectionne une conversation pour voir les détails.</p></div>
        ) : (
          <div className="flex-1 overflow-y-auto p-5">
            <div className="flex flex-col items-center text-center">
              <span className="grid place-items-center w-20 h-20 rounded-3xl text-white text-2xl font-bold shadow-[0_12px_26px_-8px_rgba(208,92,67,.5)]" style={{ backgroundColor: selected.type === 'group' ? COLOR : ((participantsByConv.get(selected.id) || [])[0]?.color || COLOR) }}>
                {selected.type === 'group' ? <Users2 className="w-9 h-9" /> : employeeInitials(convName(selected))}
              </span>
              <p className="mt-3 text-base font-bold text-marine">{convName(selected)}</p>
              <span className="mt-1 text-[11px] px-2 py-0.5 rounded-full bg-[#F4F0E9] text-gray-500">{selected.type === 'group' ? 'Groupe' : 'Conversation directe'}</span>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button onClick={() => setScheduleOpen(true)} className="flex flex-col items-center gap-1 py-3 rounded-xl bg-[#F5F1EA] hover:bg-[#EFE8DF] text-[#C14E33] transition-colors"><Phone className="w-5 h-5" /><span className="text-[11px] font-medium">Appeler</span></button>
              <button onClick={() => setScheduleOpen(true)} className="flex flex-col items-center gap-1 py-3 rounded-xl bg-[#F5F1EA] hover:bg-[#EFE8DF] text-[#C14E33] transition-colors"><Video className="w-5 h-5" /><span className="text-[11px] font-medium">Visio</span></button>
            </div>
            <div className="mt-6">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Participants</h4>
              <div className="space-y-1.5">
                {(participantsByConv.get(selected.id) || []).length === 0 ? (
                  <p className="text-xs text-gray-400">Direction</p>
                ) : (participantsByConv.get(selected.id) || []).map(e => (
                  <div key={e.id} className="flex items-center gap-2.5">
                    <span className="grid place-items-center w-8 h-8 rounded-full text-white text-[10px] font-bold flex-shrink-0" style={{ backgroundColor: e.color || COLOR }}>{employeeInitials(e.full_name)}</span>
                    <span className="text-sm text-gray-700 truncate">{e.full_name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <NewConversationDialog open={newConvOpen} onOpenChange={setNewConvOpen} roster={roster} onCreated={(id) => { setSelectedId(id); setMobileThread(true) }} viewer={viewer} />
      {selected && (
        <ScheduleCallDialog open={scheduleOpen} onOpenChange={setScheduleOpen} conversationId={selected.id} viewer={viewer} />
      )}
    </div>
  )
}

function defaultMeetingStart() {
  const d = new Date(Date.now() + 60 * 60 * 1000)
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function ScheduleCallDialog({ open, onOpenChange, conversationId, viewer }: {
  open: boolean; onOpenChange: (v: boolean) => void; conversationId: string; viewer: Viewer
}) {
  const [start, setStart] = useState(defaultMeetingStart)
  const [duration, setDuration] = useState(30)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) { setError(null); setStart(defaultMeetingStart()) }
  }

  async function handleCreate() {
    setBusy(true)
    setError(null)
    try {
      const startIso = new Date(start).toISOString()
      const res = await createCalendarMeeting(conversationId, startIso, duration, title || undefined, viewer)
      if (res.success) {
        onOpenChange(false)
        setTitle('')
      } else {
        setError(res.error || 'Erreur lors de la création.')
      }
    } catch {
      setError('Erreur lors de la création.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Planifier un appel</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Titre (optionnel)" />
          <div className="flex gap-2">
            <Input
              type="datetime-local"
              value={start}
              onChange={e => setStart(e.target.value)}
              className="flex-1"
            />
            <select
              value={duration}
              onChange={e => setDuration(Number(e.target.value))}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value={15}>15 min</option>
              <option value={30}>30 min</option>
              <option value={60}>1 h</option>
            </select>
          </div>
          <p className="text-xs text-gray-400">
            Crée un événement Google Calendar avec lien Meet et envoie une invitation email aux participants (accepter/refuser géré par Google).
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button disabled={busy} onClick={handleCreate}>{busy ? 'Création...' : 'Planifier'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function NewConversationDialog({ open, onOpenChange, roster, onCreated, viewer }: {
  open: boolean; onOpenChange: (v: boolean) => void; roster: Employee[]; onCreated: (id: string) => void; viewer: Viewer
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [groupName, setGroupName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setError(null)
  }

  function toggle(id: string) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function handleCreate() {
    setBusy(true)
    setError(null)
    try {
      const res = await createConversation(selectedIds, groupName || undefined, viewer)
      if (res.success && res.conversationId) {
        onCreated(res.conversationId)
        onOpenChange(false)
        setSelectedIds([])
        setGroupName('')
      } else {
        setError(res.error || 'Erreur lors de la création.')
      }
    } catch {
      setError('Erreur lors de la création.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nouvelle conversation</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="max-h-64 overflow-y-auto space-y-1 rounded-lg border border-gray-100 p-2">
            {roster.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Aucun salarié disponible.</p>
            ) : roster.map(e => (
              <label key={e.id} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" checked={selectedIds.includes(e.id)} onChange={() => toggle(e.id)} className="accent-primary" />
                <span className="grid place-items-center w-7 h-7 rounded-full text-white text-[10px] font-bold flex-shrink-0" style={{ backgroundColor: e.color }}>
                  {employeeInitials(e.full_name)}
                </span>
                <span className="text-sm text-gray-800">{e.full_name}</span>
              </label>
            ))}
          </div>
          {selectedIds.length > 1 && (
            <Input value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="Nom du groupe (optionnel)" />
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button disabled={selectedIds.length === 0 || busy} onClick={handleCreate}>
            {busy ? 'Création...' : selectedIds.length > 1 ? 'Créer le groupe' : 'Démarrer la conversation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
