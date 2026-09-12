'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
// Les API Web Speech (SpeechRecognition) ne sont pas typées dans la lib DOM → `any` assumé,
// comme dans AssistantVoiceMode.

/**
 * Panneau assistant ANCRÉ du tableau de bord — une seule case stable où cohabitent
 * le chat écrit ET le mode vocal, sans plein écran. On écrit, on parle, on voit les
 * prévisualisations (devis, mail, action) au même endroit ; la case ne bouge pas.
 * Réutilise l'API /api/assistant (cerveau Claude tool-use) et /api/assistant/execute.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Sparkles, Send, Loader2, Check, Mail, MessageSquare, ChevronRight, Mic, ArrowRight,
  X, FileText, ReceiptText, Square, Volume2, ExternalLink,
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
type Voice = 'off' | 'listening' | 'thinking' | 'speaking'

const SUGGESTIONS = [
  'Où en sont mes paiements ?',
  'Récap de mes derniers mails',
  'Mes chantiers en cours',
  'Prépare une facture pour…',
]
const AFFIRM = ['oui', 'ouais', 'vas-y', 'vas y', 'envoie', 'envoi', 'confirme', 'confirmer', "d'accord", 'daccord', 'ok', 'okay', 'parfait', 'go']
const isAffirm = (t: string) => { const s = t.toLowerCase().trim().replace(/[.!?]/g, ''); return AFFIRM.some(a => s === a || s.startsWith(a + ' ')) }
const getSR = () => (typeof window === 'undefined' ? null : (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null)

function toPreview(navigateTo?: string | null, reply?: string): Preview | null {
  if (!navigateTo) return null
  if (navigateTo.startsWith('/devis/nouveau')) return { kind: 'devis', title: 'Devis prêt à compléter', desc: reply, href: navigateTo }
  if (navigateTo.startsWith('/factures/nouveau')) return { kind: 'facture', title: 'Facture prête à compléter', desc: reply, href: navigateTo }
  return { kind: 'lien', title: 'Ouvrir', desc: reply, href: navigateTo }
}

export default function DashboardAssistant({ onCollapse, demoSeed }: { onCollapse?: () => void; demoSeed?: ChatMsg[] }) {
  const router = useRouter()
  const [msgs, setMsgs] = useState<ChatMsg[]>(demoSeed || [])
  const [typed, setTyped] = useState('')
  const [loading, setLoading] = useState(false)
  const [sendingIdx, setSendingIdx] = useState<number | null>(null)
  const [voice, setVoice] = useState<Voice>('off')
  const [interim, setInterim] = useState('')

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const msgsRef = useRef<ChatMsg[]>(msgs)
  const voiceRef = useRef<Voice>('off')
  const recRef = useRef<any>(null)
  const runningRef = useRef(false)
  const lastSpokenRef = useRef('')
  const speakEndRef = useRef(0)
  const pendingIdxRef = useRef<number | null>(null)
  useEffect(() => { msgsRef.current = msgs }, [msgs])
  const setVoiceState = (v: Voice) => { voiceRef.current = v; setVoice(v) }

  const scrollToEnd = useCallback(() => requestAnimationFrame(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight }), [])
  useEffect(() => { scrollToEnd() }, [msgs, loading, interim, scrollToEnd])

  // ─── Synthèse vocale (lecture des réponses en mode voix) ───
  const speak = useCallback((text: string) => {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : null
    if (!synth || voiceRef.current === 'off') return
    try {
      synth.cancel()
      lastSpokenRef.current = text
      const u = new SpeechSynthesisUtterance(text)
      u.lang = 'fr-FR'
      let saved = ''
      try { saved = localStorage.getItem('assistantVoiceURI') || '' } catch {}
      const v = saved ? synth.getVoices().find(x => x.voiceURI === saved) : null
      if (v) u.voice = v
      u.onend = () => { speakEndRef.current = Date.now(); if (voiceRef.current === 'speaking') setVoiceState('listening') }
      setVoiceState('speaking')
      synth.speak(u)
    } catch { setVoiceState('listening') }
  }, [])

  // ─── Appel au cerveau ───
  const ask = useCallback(async (question: string) => {
    const q = question.trim()
    if (!q || loading) return
    setTyped(''); setInterim('')
    const base = [...msgsRef.current, { role: 'user' as const, text: q }]
    setMsgs(base)
    setLoading(true)
    if (voiceRef.current !== 'off') setVoiceState('thinking')
    try {
      const history = base.slice(-10).map(m => ({ role: m.role, content: m.text }))
      const res = await fetch('/api/assistant', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, mode: 'chat' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Erreur')
      const reply: string = data.reply || ''
      setMsgs(prev => [...prev, {
        role: 'assistant', text: reply,
        cards: Array.isArray(data.cards) ? data.cards : [],
        pending: data.pendingAction || null,
        preview: toPreview(data.navigateTo, reply),
      }])
      if (voiceRef.current !== 'off') speak(reply || 'C’est prêt.')
    } catch (e) {
      const msg = (e as Error)?.message?.includes('Trop de requêtes')
        ? 'Trop de requêtes d’un coup, patiente un instant.' : 'Désolé, je n’ai pas réussi à répondre.'
      setMsgs(prev => [...prev, { role: 'assistant', text: msg, error: true }])
      if (voiceRef.current !== 'off') speak(msg)
    } finally {
      setLoading(false)
      if (voiceRef.current === 'thinking') setVoiceState('listening')
    }
  }, [loading, speak])

  // ─── Confirmation d'une action (envoi mail / message / facture payée) ───
  const confirmPending = useCallback(async (idx: number) => {
    const p = msgsRef.current[idx]?.pending
    if (!p) return
    setSendingIdx(idx)
    try {
      const res = await fetch('/api/assistant/execute', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: p }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Erreur')
      setMsgs(prev => prev.map((m, i) => i === idx ? { ...m, pending: null, doneText: data.message || 'C’est fait.' } : m))
      if (voiceRef.current !== 'off') speak(data.message || 'C’est envoyé.')
    } catch (e) {
      setMsgs(prev => prev.map((m, i) => i === idx ? { ...m, pending: null, doneText: (e as Error)?.message || 'Échec de l’action.' } : m))
    } finally { setSendingIdx(null) }
  }, [speak])

  const cancelPending = (idx: number) => setMsgs(prev => prev.map((m, i) => i === idx ? { ...m, pending: null } : m))

  // dernière action en attente (pour « oui » vocal)
  useEffect(() => { const i = [...msgs].reverse().findIndex(m => m.pending); pendingIdxRef.current = i < 0 ? null : msgs.length - 1 - i }, [msgs])

  // ─── Micro (reconnaissance continue, inline) ───
  const startRec = useCallback(() => {
    const rec = recRef.current
    if (!rec || runningRef.current) return
    try { rec.start(); runningRef.current = true } catch {}
  }, [])

  const startVoice = useCallback(() => {
    const SR = getSR()
    if (!SR) { inputRef.current?.focus(); return }
    if (recRef.current) return
    const rec = new SR()
    rec.lang = 'fr-FR'; rec.interimResults = true; rec.continuous = true
    rec.onresult = (e: any) => {
      let itm = '', final = ''
      for (let i = e.resultIndex; i < e.results.length; i++) { const r = e.results[i]; if (r.isFinal) final += r[0].transcript; else itm += r[0].transcript }
      if (itm && voiceRef.current === 'listening') setInterim(itm)
      if (!final.trim()) return
      const spoken = lastSpokenRef.current.toLowerCase()
      const f = final.toLowerCase().trim()
      const nearSpeech = voiceRef.current === 'speaking' || (Date.now() - speakEndRef.current) < 900
      if (nearSpeech && f.length > 4 && spoken.includes(f.slice(0, Math.min(20, f.length)))) return
      if (voiceRef.current === 'speaking') { try { window.speechSynthesis?.cancel() } catch {} }
      setInterim('')
      if (pendingIdxRef.current != null && isAffirm(final)) { confirmPending(pendingIdxRef.current); return }
      ask(final)
    }
    rec.onerror = (ev: any) => { if (ev?.error === 'not-allowed' || ev?.error === 'service-not-allowed') stopVoice() }
    rec.onend = () => { runningRef.current = false; if (voiceRef.current !== 'off') setTimeout(startRec, 250) }
    recRef.current = rec
    setVoiceState('listening')
    startRec()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ask, confirmPending, startRec])

  const stopVoice = useCallback(() => {
    setVoiceState('off'); setInterim('')
    try { recRef.current?.abort() } catch {}
    recRef.current = null; runningRef.current = false
    try { window.speechSynthesis?.cancel() } catch {}
  }, [])

  useEffect(() => () => { try { recRef.current?.abort() } catch {}; try { window.speechSynthesis?.cancel() } catch {} }, [])

  const status = voice === 'listening' ? 'Je t’écoute…' : voice === 'thinking' ? 'Je réfléchis…' : voice === 'speaking' ? 'Je te réponds…' : 'Demande-moi tout, agis d’ici'

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-black/10 bg-white shadow-[var(--shadow-md)]">
      {/* En-tête — identique en texte comme en voix */}
      <div className="flex items-center gap-2.5 px-4 py-3 text-white" style={{ background: 'radial-gradient(120% 160% at 100% 0%, #241a10 0%, #17130d 45%, #0c0c0e 100%)' }}>
        <span className={`grid h-9 w-9 place-items-center rounded-xl bg-[#F5A623] text-black ${voice !== 'off' ? 'animate-pulse' : ''}`}><Sparkles className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <div className="font-heading text-[15px] font-bold leading-tight">IA TonPilote</div>
          <div className="truncate text-[11px] text-white/55">{status}</div>
        </div>
        {voice === 'off' ? (
          <button onClick={startVoice} title="Mode vocal" aria-label="Mode vocal" className="grid h-9 w-9 place-items-center rounded-full bg-white/10 hover:bg-white/20"><Mic className="h-[18px] w-[18px]" /></button>
        ) : (
          <button onClick={stopVoice} title="Arrêter la voix" aria-label="Arrêter la voix" className="grid h-9 w-9 place-items-center rounded-full bg-[#F5A623] text-black"><Square className="h-4 w-4 fill-current" /></button>
        )}
        {onCollapse && (
          <button onClick={onCollapse} title="Réduire" aria-label="Réduire l’assistant" className="grid h-9 w-9 place-items-center rounded-full bg-white/10 hover:bg-white/20"><X className="h-[18px] w-[18px]" /></button>
        )}
      </div>

      {/* Conversation — c'est ici que tout s'affiche (texte, voix, prévisualisations) */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#FBF8F6] px-3 py-4">
        {msgs.length === 0 && !loading && (
          <div className="px-1 pt-1">
            <p className="mb-3 text-sm text-gray-500">Pose une question ou demande une action — je lis tes données, prépare un mail, un devis, une facture, pointe des heures… à la voix ou à l’écrit.</p>
            <div className="grid gap-2">
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => ask(s)} className="flex items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-left text-[13px] text-gray-700 transition-colors hover:border-[#E0674C]/50 hover:bg-[#FDF3EF]">
                  <span>{s}</span><ArrowRight className="h-4 w-4 flex-shrink-0 text-gray-300" />
                </button>
              ))}
            </div>
          </div>
        )}

        {msgs.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div className={m.role === 'user' ? 'max-w-[85%]' : 'w-full'}>
              {m.text && (
                <div className={m.role === 'user'
                  ? 'rounded-2xl rounded-br-sm bg-[#E0674C] px-3.5 py-2 text-sm text-white'
                  : m.error ? 'rounded-2xl rounded-bl-sm bg-red-50 px-3.5 py-2 text-sm text-red-700'
                  : 'rounded-2xl rounded-bl-sm bg-white px-3.5 py-2 text-sm text-gray-800 shadow-sm ring-1 ring-black/5'}>
                  <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
                </div>
              )}

              {/* Prévisualisation d'un document préparé (devis / facture) */}
              {m.preview && (
                <div className="mt-2 overflow-hidden rounded-2xl border border-[#E0674C]/25 bg-white shadow-sm">
                  <div className="flex items-center gap-2.5 border-b border-black/5 bg-[#FDF3EF] px-3.5 py-2.5">
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#E0674C] text-white">
                      {m.preview.kind === 'facture' ? <ReceiptText className="h-4 w-4" /> : m.preview.kind === 'devis' ? <FileText className="h-4 w-4" /> : <ExternalLink className="h-4 w-4" />}
                    </span>
                    <span className="text-sm font-semibold text-marine">{m.preview.title}</span>
                  </div>
                  {m.preview.desc && <p className="px-3.5 pt-2.5 text-[13px] leading-relaxed text-gray-600">{m.preview.desc}</p>}
                  <div className="px-3.5 py-2.5">
                    <button onClick={() => router.push(m.preview!.href)} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#2B2B2E] px-4 text-sm font-medium text-white hover:bg-black">
                      Ouvrir <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Action à confirmer (mail / message / facture payée) — prévisualisée */}
              {m.pending && (
                <div className="mt-2 rounded-2xl border border-[#F5A623]/40 bg-[#FFFBF3] p-3">
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-[#B4740B]">
                    {m.pending.canal === 'email_client' ? <Mail className="h-3.5 w-3.5" /> : m.pending.canal === 'message_interne' ? <MessageSquare className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                    {m.pending.canal === 'email_client' ? `Email à ${m.pending.label}` : m.pending.canal === 'message_interne' ? `Message à ${m.pending.label}` : m.pending.label}
                  </div>
                  {m.pending.canal === 'email_client' && m.pending.subject && <p className="mb-1 text-xs font-medium text-gray-500">Objet : {m.pending.subject}</p>}
                  <p className="whitespace-pre-wrap text-sm text-gray-700">{m.pending.message}</p>
                  <div className="mt-3 flex items-center gap-2">
                    <button onClick={() => confirmPending(i)} disabled={sendingIdx === i} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#E0674C] px-4 text-sm font-semibold text-white hover:bg-[#c9563d] disabled:opacity-60">
                      {sendingIdx === i ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      {m.pending.canal === 'marquer_facture_payee' ? 'Confirmer' : 'Envoyer'}
                    </button>
                    <button onClick={() => cancelPending(i)} disabled={sendingIdx === i} className="inline-flex h-9 items-center rounded-full bg-gray-100 px-4 text-sm text-gray-600 hover:bg-gray-200">Annuler</button>
                  </div>
                  {voice !== 'off' && <p className="mt-2 text-[11px] text-gray-400">Tu peux aussi dire « oui » pour confirmer.</p>}
                </div>
              )}

              {m.doneText && <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700"><Check className="h-3.5 w-3.5" /> {m.doneText}</div>}

              {m.cards && m.cards.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {m.cards.map((c, j) => {
                    const inner = (
                      <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-sm transition-colors hover:border-[#E0674C]/50 hover:bg-[#FDF3EF]">
                        <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium text-gray-800">{c.label}</div>{c.sublabel && <div className="truncate text-[11px] text-gray-400">{c.sublabel}</div>}</div>
                        {c.href && <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-300" />}
                      </div>
                    )
                    return c.href ? <button key={j} onClick={() => router.push(c.href!)} className="block w-full text-left">{inner}</button> : <div key={j}>{inner}</div>
                  })}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Transcription live (voix) */}
        {interim && <div className="flex justify-end"><div className="max-w-[85%] rounded-2xl rounded-br-sm bg-[#E0674C]/70 px-3.5 py-2 text-sm italic text-white">« {interim} »</div></div>}

        {loading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm bg-white px-4 py-3 shadow-sm ring-1 ring-black/5">
              {[0, 1, 2].map(i => <span key={i} className="h-2 w-2 rounded-full bg-[#F5A623]" style={{ animation: `apDot 1s ease-in-out ${i * 0.18}s infinite` }} />)}
            </div>
          </div>
        )}
      </div>

      {/* Saisie + micro — barre unique et fixe */}
      <div className="border-t border-black/5 bg-white px-3 py-2.5">
        {voice !== 'off' && (
          <div className="mb-2 flex items-center justify-center gap-3 rounded-xl bg-[#FDF3EF] px-3 py-2">
            <div className="flex items-center gap-1 h-5">
              {[0, 1, 2, 3, 4].map(i => (
                <span key={i} className="w-1 rounded-full bg-[#E0674C]" style={{ height: 18, transformOrigin: 'center', animation: `apWave .9s ease-in-out ${i * 0.12}s infinite` }} />
              ))}
            </div>
            <span className="text-xs font-medium text-[#B4740B]">{status}</span>
            <button onClick={stopVoice} className="ml-1 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800"><Square className="h-3 w-3 fill-current" /> Arrêter</button>
          </div>
        )}
        <form onSubmit={e => { e.preventDefault(); ask(typed) }} className="flex items-end gap-2">
          <textarea
            ref={inputRef} value={typed} onChange={e => setTyped(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(typed) } }}
            rows={1} placeholder="Écris ton message…"
            className="max-h-28 min-h-[42px] flex-1 resize-none rounded-2xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-800 outline-none focus:border-[#E0674C]/60 focus:bg-white"
          />
          {typed.trim() ? (
            <button type="submit" disabled={loading} aria-label="Envoyer" className="grid h-[42px] w-[42px] flex-shrink-0 place-items-center rounded-full bg-[#E0674C] text-white transition-colors hover:bg-[#c9563d] disabled:opacity-40"><Send className="h-[18px] w-[18px]" /></button>
          ) : (
            <button type="button" onClick={voice === 'off' ? startVoice : stopVoice} aria-label="Micro"
              className={`grid h-[42px] w-[42px] flex-shrink-0 place-items-center rounded-full transition-colors ${voice === 'off' ? 'bg-[#F5A623] text-black hover:brightness-105' : 'bg-[#E0674C] text-white'}`}
              style={voice !== 'off' ? { boxShadow: '0 0 0 4px rgba(224,103,76,.18)' } : undefined}>
              {voice === 'thinking' ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : voice === 'speaking' ? <Volume2 className="h-[18px] w-[18px]" /> : <Mic className="h-[18px] w-[18px]" />}
            </button>
          )}
        </form>
      </div>

      <style>{`@keyframes apDot{0%,100%{opacity:.3;transform:translateY(0)}50%{opacity:1;transform:translateY(-3px)}}@keyframes apWave{0%,100%{transform:scaleY(.4)}50%{transform:scaleY(1)}}`}</style>
    </div>
  )
}
