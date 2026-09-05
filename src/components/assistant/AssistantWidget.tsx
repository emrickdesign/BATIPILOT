'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Sparkles, Mic, Loader2, Volume2, Send, ChevronRight } from 'lucide-react'

type Card = { label: string; sublabel?: string; href?: string }
type Turn = { role: 'user' | 'assistant'; content: string }
type Etat = 'idle' | 'listening' | 'thinking' | 'speaking'

// Reconnaissance vocale du navigateur (gratuite). Absente sur certains Safari/iOS.
function getSR(): any {
  if (typeof window === 'undefined') return null
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null
}

export default function AssistantWidget() {
  const router = useRouter()
  const [etat, setEtat] = useState<Etat>('idle')
  const [heard, setHeard] = useState('')            // ce que l'utilisateur a dit
  const [reply, setReply] = useState('')            // réponse de l'IA
  const [cards, setCards] = useState<Card[]>([])
  const [typed, setTyped] = useState('')
  const [srSupported, setSrSupported] = useState(true)
  const recRef = useRef<any>(null)
  const histRef = useRef<Turn[]>([])

  useEffect(() => {
    const SR = getSR()
    if (!SR) { setSrSupported(false); return }
    const rec = new SR()
    rec.lang = 'fr-FR'
    rec.interimResults = true
    rec.continuous = false
    rec.onresult = (e: any) => {
      const txt = Array.from(e.results).map((r: any) => r[0].transcript).join('')
      setHeard(txt)
      if (e.results[e.results.length - 1].isFinal) { rec.stop(); ask(txt) }
    }
    rec.onerror = () => setEtat('idle')
    rec.onend = () => setEtat(s => (s === 'listening' ? 'idle' : s))
    recRef.current = rec
    return () => { try { rec.abort() } catch {} }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function speak(text: string) {
    try {
      const synth = window.speechSynthesis
      if (!synth) return
      synth.cancel()
      const u = new SpeechSynthesisUtterance(text)
      u.lang = 'fr-FR'
      u.onend = () => setEtat('idle')
      setEtat('speaking')
      synth.speak(u)
    } catch { setEtat('idle') }
  }

  function startListen() {
    if (!recRef.current) return
    setHeard(''); setReply(''); setCards([])
    try { window.speechSynthesis?.cancel() } catch {}
    setEtat('listening')
    try { recRef.current.start() } catch {}
  }

  async function ask(question: string) {
    const q = question.trim()
    if (!q) { setEtat('idle'); return }
    setHeard(q); setReply(''); setCards([]); setEtat('thinking')
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
      speak(answer)
      if (data.navigateTo) setTimeout(() => router.push(data.navigateTo), 400)
    } catch (e) {
      const msg = 'Désolé, je n’ai pas réussi à répondre.'
      setReply(msg); speak(msg)
    }
  }

  const busy = etat === 'thinking' || etat === 'speaking'

  return (
    <div className="rounded-2xl border border-marine/15 bg-gradient-to-br from-[#F3F7FE] to-white p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="grid place-items-center w-9 h-9 rounded-xl bg-marine text-white"><Sparkles className="w-5 h-5" /></span>
        <div>
          <div className="font-heading font-bold text-marine leading-tight">IA TonPilote</div>
          <div className="text-[11px] text-gray-400">
            {etat === 'listening' ? 'Je t’écoute…' : etat === 'thinking' ? 'Je réfléchis…' : etat === 'speaking' ? 'Je te réponds…' : 'Pose-moi une question'}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {srSupported ? (
          <button
            onClick={etat === 'listening' ? () => recRef.current?.stop() : startListen}
            disabled={busy}
            className={`relative grid place-items-center w-14 h-14 rounded-full flex-shrink-0 text-white transition-all ${
              etat === 'listening' ? 'bg-rose-500 scale-105' : busy ? 'bg-gray-300' : 'bg-marine hover:bg-marine/90 hover:scale-105'
            }`}
            aria-label="Parler à l’assistant"
          >
            {etat === 'listening' && <span className="absolute inset-0 rounded-full bg-rose-500/40 animate-ping" />}
            {etat === 'thinking' ? <Loader2 className="w-6 h-6 animate-spin" /> : etat === 'speaking' ? <Volume2 className="w-6 h-6" /> : <Mic className="w-6 h-6 relative" />}
          </button>
        ) : null}

        <form
          onSubmit={e => { e.preventDefault(); if (!busy && typed.trim()) { const t = typed; setTyped(''); ask(t) } }}
          className="flex-1 flex items-center gap-2"
        >
          <input
            value={typed}
            onChange={e => setTyped(e.target.value)}
            placeholder={srSupported ? 'ou écris ta question…' : 'Écris ta question (micro indisponible ici)'}
            className="w-full h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-marine/30"
          />
          <button type="submit" disabled={busy || !typed.trim()} className="grid place-items-center w-11 h-11 rounded-xl bg-marine text-white disabled:bg-gray-200 flex-shrink-0" aria-label="Envoyer">
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>

      {(heard || reply || cards.length > 0) && (
        <div className="mt-4 space-y-2">
          {heard && <p className="text-xs text-gray-400">« {heard} »</p>}
          {reply && <p className="text-sm text-marine">{reply}</p>}
          {cards.length > 0 && (
            <div className="space-y-1.5 pt-1">
              {cards.map((c, i) => {
                const inner = (
                  <div className="flex items-center gap-2 rounded-lg border border-gray-200/80 bg-white px-3 py-2 hover:border-marine/30 transition-colors">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-marine truncate">{c.label}</div>
                      {c.sublabel && <div className="text-[11px] text-gray-400 truncate">{c.sublabel}</div>}
                    </div>
                    {c.href && <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />}
                  </div>
                )
                return c.href ? <Link key={i} href={c.href}>{inner}</Link> : <div key={i}>{inner}</div>
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
