'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
// Les API Web Speech (SpeechRecognition) ne sont pas typées dans la lib DOM → `any` assumé.

/**
 * Assistant du tableau de bord : petite case flottante en bas à droite,
 * REDIMENSIONNABLE à la souris (poignée en haut à gauche, taille mémorisée).
 *  - Chat écrit + le micro DICTE le message (parole → texte, sans envoyer).
 *  - Bouton « Mode vocal » : conversation vocale MANUELLE dans la même case —
 *    tu actives / coupes le micro toi-même, puis tu demandes la réponse quand tu
 *    es prêt (rien ne part tout seul). Réponses parlées.
 *  - Prévisualisations inline (devis/facture prêts, mail/message à confirmer).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Sparkles, Send, Loader2, Check, Mail, MessageSquare, ChevronRight, Mic, MicOff, ArrowRight,
  X, FileText, ReceiptText, Volume2, ExternalLink, AudioLines, Keyboard,
} from 'lucide-react'
import type { PendingAction, AssistantCard } from '@/lib/assistant/tools'

type Preview = { kind: 'devis' | 'facture' | 'lien'; title: string; desc?: string; href: string }
type ChatMsg = {
  role: 'user' | 'assistant'
  text: string
  cards?: AssistantCard[]
  pending?: PendingAction | null
  preview?: Preview | null
  doneText?: string
  error?: boolean
}
type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking'

const SUGGESTIONS = ['Où en sont mes paiements ?', 'Récap de mes derniers mails', 'Mes chantiers en cours', 'Prépare une facture pour…']
const getSR = () => (typeof window === 'undefined' ? null : (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null)
const DEFAULT_SIZE = { w: 400, h: 600 }

function toPreview(navigateTo?: string | null, reply?: string): Preview | null {
  if (!navigateTo) return null
  if (navigateTo.startsWith('/devis/nouveau')) return { kind: 'devis', title: 'Devis prêt à compléter', desc: reply, href: navigateTo }
  if (navigateTo.startsWith('/factures/nouveau')) return { kind: 'facture', title: 'Facture prête à compléter', desc: reply, href: navigateTo }
  return { kind: 'lien', title: 'Ouvrir', desc: reply, href: navigateTo }
}

export default function DashboardAssistant({ onClose, demoSeed, initialMode }: { onClose?: () => void; demoSeed?: ChatMsg[]; initialMode?: 'chat' | 'voice' }) {
  const router = useRouter()
  const [msgs, setMsgs] = useState<ChatMsg[]>(demoSeed || [])
  const [typed, setTyped] = useState('')
  const [loading, setLoading] = useState(false)
  const [sendingIdx, setSendingIdx] = useState<number | null>(null)
  const [dictating, setDictating] = useState(false)
  const [mode, setMode] = useState<'chat' | 'voice'>(initialMode || 'chat')
  const [voiceState, setVoiceState] = useState<VoiceState>('idle')
  const [recording, setRecording] = useState(false)
  const [buffer, setBuffer] = useState('')
  const [size, setSize] = useState(DEFAULT_SIZE)

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const msgsRef = useRef<ChatMsg[]>(msgs)
  const modeRef = useRef<'chat' | 'voice'>(initialMode || 'chat')
  const vsRef = useRef<VoiceState>('idle')
  const recRef = useRef<any>(null)          // reconnaissance du mode vocal
  const dictRef = useRef<any>(null)          // reconnaissance de la dictée
  const bufferRef = useRef('')
  const dictBaseRef = useRef('')
  const sizeRef = useRef(DEFAULT_SIZE)
  useEffect(() => { msgsRef.current = msgs }, [msgs])
  useEffect(() => { sizeRef.current = size }, [size])
  const setVS = (v: VoiceState) => { vsRef.current = v; setVoiceState(v) }

  // taille mémorisée
  useEffect(() => {
    try { const s = JSON.parse(localStorage.getItem('tp_assistant_size') || 'null'); if (s?.w && s?.h) { setSize(s); sizeRef.current = s } } catch {}
  }, [])

  const scrollToEnd = useCallback(() => requestAnimationFrame(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight }), [])
  useEffect(() => { scrollToEnd() }, [msgs, loading, scrollToEnd])

  // ─── Redimensionnement (poignée haut-gauche, ancrée en bas-droite) ───
  const onResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    const sx = e.clientX, sy = e.clientY, sw = sizeRef.current.w, sh = sizeRef.current.h
    const move = (ev: PointerEvent) => {
      const w = Math.min(Math.max(320, sw + (sx - ev.clientX)), window.innerWidth - 24)
      const h = Math.min(Math.max(380, sh + (sy - ev.clientY)), window.innerHeight - 32)
      setSize({ w, h })
    }
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
      document.body.style.userSelect = ''
      try { localStorage.setItem('tp_assistant_size', JSON.stringify(sizeRef.current)) } catch {}
    }
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }, [])

  // ─── Synthèse vocale (seulement en mode vocal) ───
  const speak = useCallback((text: string) => {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : null
    if (!synth || modeRef.current !== 'voice') return
    try {
      synth.cancel()
      const u = new SpeechSynthesisUtterance(text)
      u.lang = 'fr-FR'
      let saved = ''
      try { saved = localStorage.getItem('assistantVoiceURI') || '' } catch {}
      const v = saved ? synth.getVoices().find(x => x.voiceURI === saved) : null
      if (v) u.voice = v
      u.onend = () => { if (modeRef.current === 'voice' && vsRef.current === 'speaking') setVS('idle') }
      setVS('speaking')
      synth.speak(u)
    } catch { setVS('idle') }
  }, [])

  // ─── Cerveau ───
  const ask = useCallback(async (question: string) => {
    const q = question.trim()
    if (!q || loading) return
    setTyped('')
    const base = [...msgsRef.current, { role: 'user' as const, text: q }]
    setMsgs(base); setLoading(true)
    if (modeRef.current === 'voice') setVS('thinking')
    try {
      const history = base.slice(-10).map(m => ({ role: m.role, content: m.text }))
      const res = await fetch('/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history, mode: 'chat' }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Erreur')
      const reply: string = data.reply || ''
      setMsgs(prev => [...prev, { role: 'assistant', text: reply, cards: Array.isArray(data.cards) ? data.cards : [], pending: data.pendingAction || null, preview: toPreview(data.navigateTo, reply) }])
      if (modeRef.current === 'voice') speak(reply || 'C’est prêt.')
    } catch (e) {
      const msg = (e as Error)?.message?.includes('Trop de requêtes') ? 'Trop de requêtes d’un coup, patiente un instant.' : 'Désolé, je n’ai pas réussi à répondre.'
      setMsgs(prev => [...prev, { role: 'assistant', text: msg, error: true }])
      if (modeRef.current === 'voice') speak(msg)
    } finally {
      setLoading(false)
      if (modeRef.current === 'voice' && vsRef.current === 'thinking') setVS('idle')
    }
  }, [loading, speak])

  const confirmPending = useCallback(async (idx: number) => {
    const p = msgsRef.current[idx]?.pending
    if (!p) return
    setSendingIdx(idx)
    try {
      const res = await fetch('/api/assistant/execute', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: p }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Erreur')
      setMsgs(prev => prev.map((m, i) => i === idx ? { ...m, pending: null, doneText: data.message || 'C’est fait.' } : m))
      if (modeRef.current === 'voice') speak(data.message || 'C’est envoyé.')
    } catch (e) {
      setMsgs(prev => prev.map((m, i) => i === idx ? { ...m, pending: null, doneText: (e as Error)?.message || 'Échec de l’action.' } : m))
    } finally { setSendingIdx(null) }
  }, [speak])

  const cancelPending = (idx: number) => setMsgs(prev => prev.map((m, i) => i === idx ? { ...m, pending: null } : m))

  // ─── Dictée (micro de la barre d'écriture → remplit le champ) ───
  const stopDictation = useCallback(() => { setDictating(false); try { dictRef.current?.stop() } catch {}; dictRef.current = null }, [])
  const toggleDictation = useCallback(() => {
    if (dictating) { stopDictation(); return }
    const SR = getSR()
    if (!SR) { inputRef.current?.focus(); return }
    const rec = new SR()
    rec.lang = 'fr-FR'; rec.interimResults = true; rec.continuous = true
    dictBaseRef.current = typed ? typed.replace(/\s+$/, '') + ' ' : ''
    let finalAcc = ''
    rec.onresult = (e: any) => {
      let itm = '', fin = ''
      for (let i = e.resultIndex; i < e.results.length; i++) { const r = e.results[i]; if (r.isFinal) fin += r[0].transcript; else itm += r[0].transcript }
      if (fin) finalAcc += fin
      setTyped((dictBaseRef.current + finalAcc + itm).replace(/\s+/g, ' ').trimStart())
    }
    rec.onerror = () => setDictating(false)
    rec.onend = () => { setDictating(false); dictRef.current = null; inputRef.current?.focus() }
    dictRef.current = rec; setDictating(true)
    try { rec.start() } catch { setDictating(false) }
  }, [dictating, typed, stopDictation])

  // ─── Mode vocal MANUEL (on active/coupe le micro soi-même) ───
  const stopListening = useCallback(() => {
    setRecording(false)
    try { recRef.current?.stop() } catch {}
    recRef.current = null
    if (vsRef.current === 'listening') setVS('idle')
  }, [])

  const startListening = useCallback(() => {
    if (recording) { stopListening(); return }
    try { window.speechSynthesis?.cancel() } catch {}
    const SR = getSR()
    if (!SR) return
    const rec = new SR()
    rec.lang = 'fr-FR'; rec.interimResults = true; rec.continuous = true
    let finalAcc = ''
    rec.onresult = (e: any) => {
      let itm = '', fin = ''
      for (let i = e.resultIndex; i < e.results.length; i++) { const r = e.results[i]; if (r.isFinal) fin += r[0].transcript; else itm += r[0].transcript }
      if (fin) finalAcc += fin
      const full = (bufferRef.current + finalAcc + ' ' + itm).replace(/\s+/g, ' ').trim()
      setBuffer(full)
    }
    rec.onerror = () => { setRecording(false); if (vsRef.current === 'listening') setVS('idle') }
    rec.onend = () => {
      // on fige ce qui a été entendu ; on NE relance PAS et on NE répond PAS tout seul
      bufferRef.current = (bufferRef.current + ' ' + finalAcc).replace(/\s+/g, ' ').trim()
      recRef.current = null; setRecording(false)
      if (vsRef.current === 'listening') setVS('idle')
    }
    recRef.current = rec; bufferRef.current = buffer
    setRecording(true); setVS('listening')
    try { rec.start() } catch { setRecording(false); setVS('idle') }
  }, [recording, buffer, stopListening])

  const askVoice = useCallback(() => {
    stopListening()
    const q = (bufferRef.current || buffer).trim()
    if (!q) return
    bufferRef.current = ''; setBuffer('')
    ask(q)
  }, [ask, buffer, stopListening])

  const enterVoice = useCallback(() => { stopDictation(); modeRef.current = 'voice'; setMode('voice'); setVS('idle'); bufferRef.current = ''; setBuffer('') }, [stopDictation])
  const exitVoice = useCallback(() => {
    modeRef.current = 'chat'; setMode('chat'); setRecording(false); bufferRef.current = ''; setBuffer('')
    try { recRef.current?.abort() } catch {}; recRef.current = null
    try { window.speechSynthesis?.cancel() } catch {}
  }, [])

  useEffect(() => () => { try { recRef.current?.abort() } catch {}; try { dictRef.current?.abort() } catch {}; try { window.speechSynthesis?.cancel() } catch {} }, [])

  const send = () => { const t = typed; if (t.trim()) { stopDictation(); ask(t) } }
  const vStatus = voiceState === 'listening' ? 'Je t’écoute…' : voiceState === 'thinking' ? 'Je réfléchis…' : voiceState === 'speaking' ? 'Je te réponds…' : 'Prêt — appuie sur le micro'
  const last = msgs[msgs.length - 1]

  return (
    <div
      className="fixed bottom-4 right-4 z-[70] flex flex-col overflow-hidden rounded-2xl border border-black/10 bg-white shadow-[0_18px_50px_rgba(20,10,0,.28)] sm:bottom-6 sm:right-6"
      style={{ width: `min(${size.w}px, calc(100vw - 2rem))`, height: `min(${size.h}px, calc(100vh - 3rem))` }}
      role="dialog" aria-label="Assistant IA TonPilote"
    >
      {/* Poignée de redimensionnement (ordinateur) */}
      <div onPointerDown={onResizeStart} title="Redimensionner" className="absolute left-0 top-0 z-20 hidden h-7 w-7 cursor-nwse-resize sm:block" aria-label="Redimensionner">
        <svg viewBox="0 0 12 12" className="absolute left-1.5 top-1.5 h-3 w-3 text-white/60"><path d="M11 1L1 11M7 1L1 7M11 5L5 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
      </div>

      {/* En-tête */}
      <div className="flex items-center gap-2.5 px-3.5 py-3 pl-6 text-white" style={{ background: 'radial-gradient(120% 160% at 100% 0%, #241a10 0%, #17130d 45%, #0c0c0e 100%)' }}>
        <span className={`grid h-9 w-9 place-items-center rounded-xl bg-[#F5A623] text-black ${mode === 'voice' && recording ? 'animate-pulse' : ''}`}><Sparkles className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <div className="font-heading text-[15px] font-bold leading-tight">IA TonPilote</div>
          <div className="truncate text-[11px] text-white/55">{mode === 'voice' ? vStatus : 'Écris ou dicte — je peux agir'}</div>
        </div>
        {mode === 'chat' ? (
          <button onClick={enterVoice} className="inline-flex items-center gap-1.5 h-8 rounded-full bg-[#F5A623] pl-2.5 pr-3 text-[13px] font-semibold text-black hover:brightness-105" title="Conversation vocale">
            <AudioLines className="h-4 w-4" /> Mode vocal
          </button>
        ) : (
          <button onClick={exitVoice} className="inline-flex items-center gap-1.5 h-8 rounded-full bg-white/12 px-3 text-[13px] font-medium text-white hover:bg-white/20" title="Revenir au chat">
            <Keyboard className="h-4 w-4" /> Écrire
          </button>
        )}
        {onClose && <button onClick={onClose} aria-label="Fermer" className="grid h-8 w-8 place-items-center rounded-full bg-white/10 hover:bg-white/20"><X className="h-[17px] w-[17px]" /></button>}
      </div>

      {mode === 'voice' ? (
        /* ─── Mode vocal MANUEL ─── */
        <div className="relative flex min-h-0 flex-1 flex-col items-center px-5 py-5 text-center text-white" style={{ background: 'radial-gradient(120% 80% at 50% 0%, #17130d 0%, #0a0a0b 60%, #060607 100%)' }}>
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 w-full overflow-y-auto">
            <div className="flex h-20 items-end justify-center gap-1.5">
              {voiceState === 'speaking' ? Array.from({ length: 9 }).map((_, i) => <span key={i} className="w-1.5 rounded-full bg-[#F59E42]" style={{ height: 48, transformOrigin: 'center', animation: `apBar .9s ease-in-out ${i * 0.08}s infinite` }} />)
                : voiceState === 'thinking' ? <div className="flex gap-2">{[0, 1, 2].map(i => <span key={i} className="h-2.5 w-2.5 rounded-full bg-[#F59E42]" style={{ animation: `apGlow 1s ease-in-out ${i * 0.2}s infinite` }} />)}</div>
                : recording ? <div className="flex items-end gap-1.5 h-16">{[0, 1, 2, 3, 4, 5, 6].map(i => <span key={i} className="w-1.5 rounded-full bg-[#F5A623]" style={{ height: 44, transformOrigin: 'center', animation: `apBar .8s ease-in-out ${i * 0.09}s infinite` }} />)}</div>
                : <div className="h-16 w-16 rounded-full border-2 border-white/15" />}
            </div>
            {/* ce qui est entendu */}
            <div className="min-h-[40px] w-full">
              {buffer ? <p className="text-[15px] leading-snug text-white">« {buffer} »</p>
                : <p className="text-sm text-white/45">{recording ? 'Parle, je t’écoute…' : 'Appuie sur le micro, parle, puis « Demander ».'}</p>}
            </div>
            {/* dernière réponse */}
            {!buffer && last?.role === 'assistant' && last.text && <p className="text-[15px] leading-snug text-white/90">{last.text}</p>}
            {/* action à confirmer */}
            {!buffer && last?.pending && (
              <div className="w-full rounded-2xl border border-[#F59E42]/30 bg-white/[0.05] p-3 text-left">
                <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-[#F5A623]">
                  {last.pending.canal === 'email_client' ? <Mail className="h-3.5 w-3.5" /> : last.pending.canal === 'message_interne' ? <MessageSquare className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                  {last.pending.canal === 'email_client' ? `Email à ${last.pending.label}` : last.pending.canal === 'message_interne' ? `Message à ${last.pending.label}` : last.pending.label}
                </p>
                <p className="whitespace-pre-wrap text-sm text-white/85">{last.pending.message}</p>
                <div className="mt-2.5 flex gap-2">
                  <button onClick={() => confirmPending(msgs.length - 1)} disabled={sendingIdx === msgs.length - 1} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#F5A623] px-4 text-sm font-semibold text-black disabled:opacity-60">{sendingIdx === msgs.length - 1 ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{last.pending.canal === 'marquer_facture_payee' ? 'Confirmer' : 'Envoyer'}</button>
                  <button onClick={() => cancelPending(msgs.length - 1)} className="inline-flex h-9 items-center rounded-full bg-white/10 px-4 text-sm text-white/80">Annuler</button>
                </div>
              </div>
            )}
          </div>

          {/* contrôles bas : micro (activer/couper) + Demander */}
          <div className="mt-3 flex w-full items-center justify-center gap-4">
            <button onClick={exitVoice} className="grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white/80 hover:bg-white/15" title="Écrire au clavier"><Keyboard className="h-5 w-5" /></button>
            <button onClick={startListening} title={recording ? 'Couper le micro' : 'Activer le micro'} className="relative grid h-16 w-16 place-items-center rounded-full">
              {recording && <><span className="absolute inset-0 rounded-full border border-[#F5A623]" style={{ animation: 'apRing 1.8s ease-out infinite' }} /><span className="absolute inset-0 rounded-full border border-[#F5A623]" style={{ animation: 'apRing 1.8s ease-out .9s infinite' }} /></>}
              <span className={`relative grid h-16 w-16 place-items-center rounded-full ${recording ? 'bg-[#E0674C] text-white' : 'bg-[#F5A623] text-black'}`} style={{ boxShadow: recording ? '0 0 34px rgba(224,103,76,.5)' : '0 0 34px rgba(245,166,35,.4)' }}>
                {voiceState === 'thinking' ? <Loader2 className="h-6 w-6 animate-spin" /> : voiceState === 'speaking' ? <Volume2 className="h-6 w-6" /> : recording ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
              </span>
            </button>
            <button onClick={askVoice} disabled={!buffer.trim() || loading} title="Demander la réponse" className="grid h-11 w-11 place-items-center rounded-full bg-[#F5A623] text-black transition-opacity disabled:opacity-30"><Send className="h-5 w-5" /></button>
          </div>
          <p className="mt-2 text-[11px] text-white/40">{recording ? 'Appuie sur le micro pour couper, puis ▸ pour demander.' : buffer ? 'Appuie sur ▸ pour obtenir la réponse.' : 'Rien ne part sans toi.'}</p>
        </div>
      ) : (
        /* ─── Vue chat écrit ─── */
        <>
          <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#FBF8F6] px-3 py-4">
            {msgs.length === 0 && !loading && (
              <div className="px-1 pt-1">
                <p className="mb-3 text-sm text-gray-500">Pose une question ou demande une action — je lis tes données, prépare un mail, un devis, une facture… Écris, ou clique sur le micro pour dicter.</p>
                <div className="grid gap-2">{SUGGESTIONS.map(s => <button key={s} onClick={() => ask(s)} className="flex items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-left text-[13px] text-gray-700 transition-colors hover:border-[#E0674C]/50 hover:bg-[#FDF3EF]"><span>{s}</span><ArrowRight className="h-4 w-4 flex-shrink-0 text-gray-300" /></button>)}</div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div className={m.role === 'user' ? 'max-w-[85%]' : 'w-full'}>
                  {m.text && <div className={m.role === 'user' ? 'rounded-2xl rounded-br-sm bg-[#E0674C] px-3.5 py-2 text-sm text-white' : m.error ? 'rounded-2xl rounded-bl-sm bg-red-50 px-3.5 py-2 text-sm text-red-700' : 'rounded-2xl rounded-bl-sm bg-white px-3.5 py-2 text-sm text-gray-800 shadow-sm ring-1 ring-black/5'}><p className="whitespace-pre-wrap leading-relaxed">{m.text}</p></div>}
                  {m.preview && (
                    <div className="mt-2 overflow-hidden rounded-2xl border border-[#E0674C]/25 bg-white shadow-sm">
                      <div className="flex items-center gap-2.5 border-b border-black/5 bg-[#FDF3EF] px-3.5 py-2.5"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[#E0674C] text-white">{m.preview.kind === 'facture' ? <ReceiptText className="h-4 w-4" /> : m.preview.kind === 'devis' ? <FileText className="h-4 w-4" /> : <ExternalLink className="h-4 w-4" />}</span><span className="text-sm font-semibold text-marine">{m.preview.title}</span></div>
                      {m.preview.desc && <p className="px-3.5 pt-2.5 text-[13px] leading-relaxed text-gray-600">{m.preview.desc}</p>}
                      <div className="px-3.5 py-2.5"><button onClick={() => router.push(m.preview!.href)} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#2B2B2E] px-4 text-sm font-medium text-white hover:bg-black">Ouvrir <ArrowRight className="h-4 w-4" /></button></div>
                    </div>
                  )}
                  {m.pending && (
                    <div className="mt-2 rounded-2xl border border-[#F5A623]/40 bg-[#FFFBF3] p-3">
                      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-[#B4740B]">{m.pending.canal === 'email_client' ? <Mail className="h-3.5 w-3.5" /> : m.pending.canal === 'message_interne' ? <MessageSquare className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}{m.pending.canal === 'email_client' ? `Email à ${m.pending.label}` : m.pending.canal === 'message_interne' ? `Message à ${m.pending.label}` : m.pending.label}</div>
                      {m.pending.canal === 'email_client' && m.pending.subject && <p className="mb-1 text-xs font-medium text-gray-500">Objet : {m.pending.subject}</p>}
                      <p className="whitespace-pre-wrap text-sm text-gray-700">{m.pending.message}</p>
                      <div className="mt-3 flex items-center gap-2">
                        <button onClick={() => confirmPending(i)} disabled={sendingIdx === i} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#E0674C] px-4 text-sm font-semibold text-white hover:bg-[#c9563d] disabled:opacity-60">{sendingIdx === i ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{m.pending.canal === 'marquer_facture_payee' ? 'Confirmer' : 'Envoyer'}</button>
                        <button onClick={() => cancelPending(i)} disabled={sendingIdx === i} className="inline-flex h-9 items-center rounded-full bg-gray-100 px-4 text-sm text-gray-600 hover:bg-gray-200">Annuler</button>
                      </div>
                    </div>
                  )}
                  {m.doneText && <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700"><Check className="h-3.5 w-3.5" /> {m.doneText}</div>}
                  {m.cards && m.cards.length > 0 && <div className="mt-2 space-y-1.5">{m.cards.map((c, j) => { const inner = <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-sm transition-colors hover:border-[#E0674C]/50 hover:bg-[#FDF3EF]"><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium text-gray-800">{c.label}</div>{c.sublabel && <div className="truncate text-[11px] text-gray-400">{c.sublabel}</div>}</div>{c.href && <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-300" />}</div>; return c.href ? <button key={j} onClick={() => router.push(c.href!)} className="block w-full text-left">{inner}</button> : <div key={j}>{inner}</div> })}</div>}
                </div>
              </div>
            ))}
            {loading && <div className="flex justify-start"><div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm bg-white px-4 py-3 shadow-sm ring-1 ring-black/5">{[0, 1, 2].map(i => <span key={i} className="h-2 w-2 rounded-full bg-[#F5A623]" style={{ animation: `apDot 1s ease-in-out ${i * 0.18}s infinite` }} />)}</div></div>}
          </div>

          {/* Barre d'écriture — le micro DICTE */}
          <form onSubmit={e => { e.preventDefault(); send() }} className="flex items-end gap-2 border-t border-black/5 bg-white px-3 py-2.5">
            <button type="button" onClick={toggleDictation} aria-label={dictating ? 'Arrêter la dictée' : 'Dicter'} title={dictating ? 'Arrêter la dictée' : 'Dicter le message'}
              className={`grid h-[42px] w-[42px] flex-shrink-0 place-items-center rounded-full transition-colors ${dictating ? 'bg-[#E0674C] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
              style={dictating ? { boxShadow: '0 0 0 4px rgba(224,103,76,.18)' } : undefined}>
              {dictating ? <MicOff className="h-[18px] w-[18px]" /> : <Mic className="h-[18px] w-[18px]" />}
            </button>
            <textarea ref={inputRef} value={typed} onChange={e => setTyped(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} rows={1}
              placeholder={dictating ? 'Je t’écoute… parle' : 'Écris ton message…'}
              className="max-h-28 min-h-[42px] flex-1 resize-none rounded-2xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-800 outline-none focus:border-[#E0674C]/60 focus:bg-white" />
            <button type="submit" disabled={!typed.trim() || loading} aria-label="Envoyer" className="grid h-[42px] w-[42px] flex-shrink-0 place-items-center rounded-full bg-[#E0674C] text-white transition-colors hover:bg-[#c9563d] disabled:opacity-40"><Send className="h-[18px] w-[18px]" /></button>
          </form>
        </>
      )}

      <style>{`@keyframes apDot{0%,100%{opacity:.3;transform:translateY(0)}50%{opacity:1;transform:translateY(-3px)}}@keyframes apBar{0%,100%{transform:scaleY(.35)}50%{transform:scaleY(1)}}@keyframes apGlow{0%,100%{opacity:.5}50%{opacity:1}}@keyframes apRing{0%{transform:scale(.6);opacity:.55}100%{transform:scale(2.1);opacity:0}}`}</style>
    </div>
  )
}
