'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Mic, X, Keyboard, Send, Loader2, Check, Mail, MessageSquare, ChevronRight, Volume2 } from 'lucide-react'
import type { PendingAction } from '@/lib/assistant/tools'

type Card = { label: string; sublabel?: string; href?: string }
type Turn = { role: 'user' | 'assistant'; content: string }
type Etat = 'listening' | 'thinking' | 'speaking' | 'idle'

function getSR(): any {
  if (typeof window === 'undefined') return null
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null
}

const AFFIRM = ['oui', 'ouais', 'vas-y', 'vas y', 'envoie', 'envoi', 'confirme', 'confirmer', "d'accord", 'daccord', 'ok', 'okay', 'parfait', 'go']
const isAffirm = (t: string) => { const s = t.toLowerCase().trim().replace(/[.!?]/g, ''); return AFFIRM.some(a => s === a || s.startsWith(a + ' ')) }

export default function AssistantVoiceMode({ onClose, initial }: { onClose: () => void; initial?: string }) {
  const router = useRouter()
  const [etat, setEtat] = useState<Etat>('idle')
  const [heard, setHeard] = useState('')
  const [reply, setReply] = useState('')
  const [cards, setCards] = useState<Card[]>([])
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [sending, setSending] = useState(false)
  const [showKeyboard, setShowKeyboard] = useState(false)
  const [typed, setTyped] = useState('')
  const [srSupported, setSrSupported] = useState(true)

  const recRef = useRef<any>(null)
  const histRef = useRef<Turn[]>([])
  const etatRef = useRef<Etat>('idle')
  const pendingRef = useRef<PendingAction | null>(null)
  const lastSpokenRef = useRef('')
  const runningRef = useRef(false)
  const closedRef = useRef(false)

  const setState = (e: Etat) => { etatRef.current = e; setEtat(e) }
  useEffect(() => { pendingRef.current = pending }, [pending])

  // ---- Micro (reconnaissance continue + relance auto) ----
  const startRec = useCallback(() => {
    const rec = recRef.current
    if (!rec || runningRef.current || closedRef.current) return
    try { rec.start(); runningRef.current = true } catch {}
  }, [])

  const speak = useCallback((text: string) => {
    try {
      const synth = window.speechSynthesis
      if (!synth) { setState('listening'); return }
      synth.cancel()
      lastSpokenRef.current = text
      const u = new SpeechSynthesisUtterance(text)
      u.lang = 'fr-FR'
      u.onend = () => { if (!closedRef.current) setState('listening') }
      setState('speaking')
      synth.speak(u)
    } catch { setState('listening') }
  }, [])

  const ask = useCallback(async (question: string) => {
    const q = question.trim()
    if (!q) return
    try { window.speechSynthesis?.cancel() } catch {}
    setHeard(q); setReply(''); setCards([]); setPending(null); setState('thinking')
    const history = [...histRef.current, { role: 'user' as const, content: q }]
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Erreur')
      const answer: string = data.reply || ''
      histRef.current = [...history, { role: 'assistant' as const, content: answer }].slice(-8)
      setReply(answer)
      setCards(Array.isArray(data.cards) ? data.cards : [])
      setPending(data.pendingAction || null)
      speak(answer)
      if (data.navigateTo) setTimeout(() => { onClose(); router.push(data.navigateTo) }, 600)
    } catch {
      const msg = 'Désolé, je n’ai pas réussi à répondre.'
      setReply(msg); speak(msg)
    }
  }, [speak, onClose, router])

  const confirmSend = useCallback(async () => {
    const p = pendingRef.current
    if (!p) return
    setSending(true)
    try {
      const res = await fetch('/api/assistant/execute', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: p }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Erreur')
      setPending(null); setReply(data.message || 'C’est fait.'); speak(data.message || 'C’est fait.')
    } catch {
      setReply('Échec de l’envoi.'); speak('Je n’ai pas réussi.')
    } finally { setSending(false) }
  }, [speak])

  useEffect(() => {
    closedRef.current = false
    const SR = getSR()
    if (!SR) { setSrSupported(false); setShowKeyboard(true); setState('idle'); return }
    const rec = new SR()
    rec.lang = 'fr-FR'
    rec.interimResults = true
    rec.continuous = true
    rec.onstart = () => { runningRef.current = true; if (etatRef.current === 'idle') setState('listening') }
    rec.onresult = (e: any) => {
      let interim = '', final = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) final += r[0].transcript
        else interim += r[0].transcript
      }
      if (interim && etatRef.current === 'listening') setHeard(interim)
      if (!final.trim()) return

      // Anti-écho : ignore ce qui ressemble à ce que l'IA vient de dire.
      const spoken = lastSpokenRef.current.toLowerCase()
      const f = final.toLowerCase().trim()
      if (etatRef.current === 'speaking' && f.length > 4 && spoken.includes(f.slice(0, Math.min(20, f.length)))) return

      // Barge-in : couper la parole de l'IA.
      if (etatRef.current === 'speaking') { try { window.speechSynthesis?.cancel() } catch {} }

      // Pendant une confirmation, « oui » valide directement.
      if (pendingRef.current && isAffirm(final)) { setHeard(final); confirmSend(); return }

      ask(final)
    }
    rec.onerror = (e: any) => { if (e?.error === 'not-allowed' || e?.error === 'service-not-allowed') { setSrSupported(false); setShowKeyboard(true) } }
    rec.onend = () => { runningRef.current = false; if (!closedRef.current) setTimeout(startRec, 250) }
    recRef.current = rec
    startRec()
    if (initial?.trim()) ask(initial)

    return () => {
      closedRef.current = true
      try { rec.abort() } catch {}
      try { window.speechSynthesis?.cancel() } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function close() {
    closedRef.current = true
    try { recRef.current?.abort() } catch {}
    try { window.speechSynthesis?.cancel() } catch {}
    onClose()
  }

  const statusText = etat === 'listening' ? 'Je t’écoute…' : etat === 'thinking' ? 'Je réfléchis…' : etat === 'speaking' ? 'Je te réponds…' : 'Appuie pour parler'

  return (
    <div className="fixed inset-0 z-[100] flex flex-col text-white" style={{ background: 'radial-gradient(120% 80% at 50% 0%, #17130d 0%, #0a0a0b 55%, #060607 100%)' }}>
      <style>{`
        @keyframes finnyRing { 0% { transform: scale(.6); opacity:.55 } 100% { transform: scale(2.2); opacity:0 } }
        @keyframes finnyBar { 0%,100% { transform: scaleY(.35) } 50% { transform: scaleY(1) } }
        @keyframes finnyGlow { 0%,100% { opacity:.5 } 50% { opacity:1 } }
        .finny-bar { animation: finnyBar 1s ease-in-out infinite; transform-origin: center; }
      `}</style>

      {/* Top */}
      <div className="flex items-center justify-between px-5 pt-6">
        <button onClick={close} className="grid place-items-center w-10 h-10 rounded-full bg-white/10 hover:bg-white/15" aria-label="Fermer"><X className="w-5 h-5" /></button>
        <div className="text-center">
          <div className="font-heading font-bold text-lg">Let’s Talk</div>
          <div className="text-xs text-white/50">{statusText}</div>
        </div>
        <div className="w-10" />
      </div>

      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6 overflow-y-auto">
        <p className="text-center text-2xl font-heading font-semibold leading-snug max-w-xs">
          Demande-moi tout sur ton activité.
        </p>

        {/* Onde / animation d'état */}
        <div className="h-28 flex items-end justify-center gap-1.5">
          {etat === 'speaking' ? (
            Array.from({ length: 9 }).map((_, i) => (
              <span key={i} className="finny-bar w-1.5 rounded-full bg-[#F59E42]" style={{ height: 64, animationDelay: `${i * 0.08}s` }} />
            ))
          ) : etat === 'thinking' ? (
            <div className="flex items-center gap-2">
              {[0, 1, 2].map(i => <span key={i} className="w-2.5 h-2.5 rounded-full bg-[#F59E42]" style={{ animation: `finnyGlow 1s ease-in-out ${i * 0.2}s infinite` }} />)}
            </div>
          ) : (
            <div className="w-24 h-24 rounded-full border-2 border-[#F59E42]/40" style={{ animation: 'finnyGlow 2s ease-in-out infinite' }} />
          )}
        </div>

        {/* Transcript */}
        <div className="w-full max-w-sm space-y-2 text-center">
          {heard && <p className="text-sm text-white/45">« {heard} »</p>}
          {reply && <p className="text-[15px] text-white">{reply}</p>}
        </div>

        {/* Confirmation */}
        {pending && (
          <div className="w-full max-w-sm rounded-2xl border border-[#F59E42]/30 bg-white/[0.04] p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-[#F5A623] mb-1.5">
              {pending.canal === 'email_client' ? <Mail className="w-3.5 h-3.5" /> : pending.canal === 'message_interne' ? <MessageSquare className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
              {pending.canal === 'email_client' ? `Email à ${pending.label}` : pending.canal === 'message_interne' ? `Message à ${pending.label}` : pending.label}
            </div>
            <p className="text-sm text-white/85 whitespace-pre-wrap">{pending.message}</p>
            <div className="flex items-center gap-2 mt-3">
              <button onClick={confirmSend} disabled={sending} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-[#F5A623] text-black text-sm font-semibold disabled:opacity-60">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} {pending.canal === 'marquer_facture_payee' ? 'Confirmer' : 'Envoyer'}
              </button>
              <button onClick={() => setPending(null)} disabled={sending} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-white/10 text-white/80 text-sm">Annuler</button>
            </div>
            <p className="text-[11px] text-white/40 mt-2">Tu peux aussi dire « oui » pour confirmer.</p>
          </div>
        )}

        {/* Cartes */}
        {cards.length > 0 && !pending && (
          <div className="w-full max-w-sm space-y-1.5">
            {cards.map((c, i) => {
              const inner = (
                <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 hover:bg-white/[0.08] transition-colors">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-white truncate">{c.label}</div>
                    {c.sublabel && <div className="text-[11px] text-white/40 truncate">{c.sublabel}</div>}
                  </div>
                  {c.href && <ChevronRight className="w-4 h-4 text-white/30" />}
                </div>
              )
              return c.href ? <Link key={i} href={c.href} onClick={close}>{inner}</Link> : <div key={i}>{inner}</div>
            })}
          </div>
        )}

        {showKeyboard && (
          <form onSubmit={e => { e.preventDefault(); if (typed.trim()) { const t = typed; setTyped(''); ask(t) } }} className="w-full max-w-sm flex items-center gap-2">
            <input value={typed} onChange={e => setTyped(e.target.value)} autoFocus placeholder="Écris ta question…" className="flex-1 h-11 rounded-full bg-white/10 border border-white/15 px-4 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-[#F5A623]/60" />
            <button type="submit" className="grid place-items-center w-11 h-11 rounded-full bg-[#F5A623] text-black flex-shrink-0"><Send className="w-4 h-4" /></button>
          </form>
        )}
      </div>

      {/* Bottom controls */}
      <div className="flex items-center justify-center gap-8 pb-10 pt-4">
        <button onClick={() => setShowKeyboard(s => !s)} className="grid place-items-center w-12 h-12 rounded-full bg-white/10 hover:bg-white/15 text-white/80" aria-label="Clavier"><Keyboard className="w-5 h-5" /></button>

        {/* Bouton micro central avec anneaux pulsants */}
        <button
          onClick={() => { if (etatRef.current === 'speaking') { try { window.speechSynthesis?.cancel() } catch {}; setState('listening') } else { startRec(); setState('listening') } }}
          className="relative grid place-items-center w-20 h-20 rounded-full flex-shrink-0"
          aria-label="Micro"
        >
          {(etat === 'listening' || etat === 'speaking') && (
            <>
              <span className="absolute inset-0 rounded-full border border-[#F5A623]" style={{ animation: 'finnyRing 1.8s ease-out infinite' }} />
              <span className="absolute inset-0 rounded-full border border-[#F5A623]" style={{ animation: 'finnyRing 1.8s ease-out .9s infinite' }} />
            </>
          )}
          <span className="relative grid place-items-center w-20 h-20 rounded-full bg-[#F5A623] text-black" style={{ boxShadow: '0 0 40px rgba(245,166,35,.45)' }}>
            {etat === 'thinking' ? <Loader2 className="w-7 h-7 animate-spin" /> : etat === 'speaking' ? <Volume2 className="w-7 h-7" /> : <Mic className="w-7 h-7" />}
          </span>
        </button>

        <button onClick={close} className="grid place-items-center w-12 h-12 rounded-full bg-white/10 hover:bg-white/15 text-white/80" aria-label="Terminer"><X className="w-5 h-5" /></button>
      </div>

      {!srSupported && <p className="text-center text-xs text-white/40 pb-4">Micro indisponible sur ce navigateur — utilise le clavier.</p>}
    </div>
  )
}
