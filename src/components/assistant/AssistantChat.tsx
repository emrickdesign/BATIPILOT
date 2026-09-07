'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Sparkles, X, Send, Loader2, Check, Mail, MessageSquare, ChevronRight,
  Mic, ArrowRight,
} from 'lucide-react'
import type { PendingAction, AssistantCard } from '@/lib/assistant/tools'

/** Un tour de conversation affiché. Le texte seul part vers l'API ; cartes,
 *  action à confirmer et navigation sont rattachés au tour pour l'affichage. */
type ChatMsg = {
  role: 'user' | 'assistant'
  text: string
  cards?: AssistantCard[]
  pending?: PendingAction | null
  navigateTo?: string | null
  /** Action à confirmer déjà exécutée : on remplace la carte par le résultat. */
  doneText?: string
  error?: boolean
}

const SUGGESTIONS = [
  'Où en sont mes paiements ?',
  'Récap de mes derniers mails',
  'Mes chantiers en cours',
  'Prépare une facture pour…',
]

const PENDING_VERB = (p: PendingAction) =>
  p.canal === 'marquer_facture_payee' ? 'Confirmer' : 'Envoyer'

export default function AssistantChat({
  onClose,
  onVoice,
  initial,
}: {
  onClose: () => void
  onVoice: () => void
  initial?: string
}) {
  const router = useRouter()
  const [msgs, setMsgs] = useState<ChatMsg[]>([])
  const [typed, setTyped] = useState('')
  const [loading, setLoading] = useState(false)
  const [sendingIdx, setSendingIdx] = useState<number | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const initRan = useRef(false)

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => {
      const el = scrollRef.current
      if (el) el.scrollTop = el.scrollHeight
    })
  }, [])

  useEffect(() => { scrollToEnd() }, [msgs, loading, scrollToEnd])

  const ask = useCallback(async (question: string) => {
    const q = question.trim()
    if (!q || loading) return
    setTyped('')
    const base = [...msgs, { role: 'user' as const, text: q }]
    setMsgs(base)
    setLoading(true)
    try {
      // On n'envoie que le fil texte (l'API rejoue la boucle d'outils côté serveur).
      const history = base.slice(-10).map(m => ({ role: m.role, content: m.text }))
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, mode: 'chat' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Erreur')
      setMsgs(prev => [...prev, {
        role: 'assistant',
        text: data.reply || '',
        cards: Array.isArray(data.cards) ? data.cards : [],
        pending: data.pendingAction || null,
        navigateTo: data.navigateTo || null,
      }])
    } catch (e) {
      setMsgs(prev => [...prev, {
        role: 'assistant',
        text: (e as Error)?.message?.includes('Trop de requêtes')
          ? 'Trop de requêtes d’un coup, patiente un instant.'
          : 'Désolé, je n’ai pas réussi à répondre.',
        error: true,
      }])
    } finally {
      setLoading(false)
    }
  }, [msgs, loading])

  // Question initiale (depuis une suggestion de la carte du tableau de bord, etc.).
  useEffect(() => {
    if (initRan.current) return
    initRan.current = true
    if (initial?.trim()) ask(initial)
    else inputRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function confirmPending(idx: number) {
    const p = msgs[idx]?.pending
    if (!p) return
    setSendingIdx(idx)
    try {
      const res = await fetch('/api/assistant/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: p }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Erreur')
      setMsgs(prev => prev.map((m, i) => i === idx ? { ...m, pending: null, doneText: data.message || 'C’est fait.' } : m))
    } catch (e) {
      setMsgs(prev => prev.map((m, i) => i === idx ? { ...m, pending: null, doneText: (e as Error)?.message || 'Échec de l’action.' } : m))
    } finally {
      setSendingIdx(null)
    }
  }

  function cancelPending(idx: number) {
    setMsgs(prev => prev.map((m, i) => i === idx ? { ...m, pending: null } : m))
  }

  function goTo(href: string) {
    onClose()
    router.push(href)
  }

  return (
    <div
      className="fixed bottom-4 right-4 z-[70] flex w-[calc(100vw-2rem)] max-w-[400px] flex-col overflow-hidden rounded-2xl border border-black/10 bg-white shadow-[0_18px_50px_rgba(20,10,0,.28)] sm:bottom-6 sm:right-6"
      style={{ height: 'min(620px, calc(100vh - 6rem))' }}
      role="dialog"
      aria-label="Assistant IA TonPilote"
    >
      {/* En-tête */}
      <div
        className="flex items-center gap-2.5 px-4 py-3 text-white"
        style={{ background: 'radial-gradient(120% 140% at 100% 0%, #241a10 0%, #121013 55%, #0c0c0e 100%)' }}
      >
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#F5A623] text-black">
          <Sparkles className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-heading text-[15px] font-bold leading-tight">IA TonPilote</div>
          <div className="truncate text-[11px] text-white/50">Demande-moi tout, agis d’ici</div>
        </div>
        <button onClick={onVoice} title="Mode vocal" aria-label="Mode vocal" className="grid h-9 w-9 place-items-center rounded-full bg-white/10 hover:bg-white/20">
          <Mic className="h-[18px] w-[18px]" />
        </button>
        <button onClick={onClose} title="Fermer" aria-label="Fermer" className="grid h-9 w-9 place-items-center rounded-full bg-white/10 hover:bg-white/20">
          <X className="h-[18px] w-[18px]" />
        </button>
      </div>

      {/* Fil de conversation */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#FBF8F6] px-3 py-4">
        {msgs.length === 0 && !loading && (
          <div className="px-1 pt-2">
            <p className="mb-3 text-sm text-gray-500">
              Pose une question ou demande une action — je peux lire tes données, préparer un mail, une facture, pointer des heures…
            </p>
            <div className="grid gap-2">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => ask(s)}
                  className="flex items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-left text-[13px] text-gray-700 transition-colors hover:border-[#E0674C]/50 hover:bg-[#FDF3EF]"
                >
                  <span>{s}</span>
                  <ArrowRight className="h-4 w-4 flex-shrink-0 text-gray-300" />
                </button>
              ))}
            </div>
          </div>
        )}

        {msgs.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div className={m.role === 'user' ? 'max-w-[85%]' : 'w-full'}>
              {/* Bulle */}
              {m.text && (
                <div
                  className={
                    m.role === 'user'
                      ? 'rounded-2xl rounded-br-sm bg-[#E0674C] px-3.5 py-2 text-sm text-white'
                      : m.error
                        ? 'rounded-2xl rounded-bl-sm bg-red-50 px-3.5 py-2 text-sm text-red-700'
                        : 'rounded-2xl rounded-bl-sm bg-white px-3.5 py-2 text-sm text-gray-800 shadow-sm ring-1 ring-black/5'
                  }
                >
                  <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
                </div>
              )}

              {/* Action à confirmer */}
              {m.pending && (
                <div className="mt-2 rounded-2xl border border-[#F5A623]/40 bg-[#FFFBF3] p-3">
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-[#B4740B]">
                    {m.pending.canal === 'email_client' ? <Mail className="h-3.5 w-3.5" /> : m.pending.canal === 'message_interne' ? <MessageSquare className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                    {m.pending.canal === 'email_client' ? `Email à ${m.pending.label}` : m.pending.canal === 'message_interne' ? `Message à ${m.pending.label}` : m.pending.label}
                  </div>
                  {'subject' in m.pending && m.pending.subject && (
                    <p className="mb-1 text-xs font-medium text-gray-500">Objet : {m.pending.subject}</p>
                  )}
                  <p className="whitespace-pre-wrap text-sm text-gray-700">{m.pending.message}</p>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      onClick={() => confirmPending(i)}
                      disabled={sendingIdx === i}
                      className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#E0674C] px-4 text-sm font-semibold text-white hover:bg-[#c9563d] disabled:opacity-60"
                    >
                      {sendingIdx === i ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      {PENDING_VERB(m.pending)}
                    </button>
                    <button
                      onClick={() => cancelPending(i)}
                      disabled={sendingIdx === i}
                      className="inline-flex h-9 items-center rounded-full bg-gray-100 px-4 text-sm text-gray-600 hover:bg-gray-200"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              )}

              {/* Résultat d'une action confirmée */}
              {m.doneText && (
                <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
                  <Check className="h-3.5 w-3.5" /> {m.doneText}
                </div>
              )}

              {/* Bouton d'ouverture (navigation proposée, jamais automatique) */}
              {m.navigateTo && (
                <button
                  onClick={() => goTo(m.navigateTo!)}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#2B2B2E] px-4 py-2 text-sm font-medium text-white hover:bg-black"
                >
                  Ouvrir <ArrowRight className="h-4 w-4" />
                </button>
              )}

              {/* Cartes cliquables */}
              {m.cards && m.cards.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {m.cards.map((c, j) => {
                    const inner = (
                      <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-sm transition-colors hover:border-[#E0674C]/50 hover:bg-[#FDF3EF]">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-gray-800">{c.label}</div>
                          {c.sublabel && <div className="truncate text-[11px] text-gray-400">{c.sublabel}</div>}
                        </div>
                        {c.href && <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-300" />}
                      </div>
                    )
                    return c.href
                      ? <button key={j} onClick={() => goTo(c.href!)} className="block w-full text-left">{inner}</button>
                      : <div key={j}>{inner}</div>
                  })}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm bg-white px-4 py-3 shadow-sm ring-1 ring-black/5">
              {[0, 1, 2].map(i => (
                <span key={i} className="h-2 w-2 rounded-full bg-[#F5A623]" style={{ animation: `apChatDot 1s ease-in-out ${i * 0.18}s infinite` }} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Saisie */}
      <form
        onSubmit={e => { e.preventDefault(); ask(typed) }}
        className="flex items-end gap-2 border-t border-black/5 bg-white px-3 py-2.5"
      >
        <textarea
          ref={inputRef}
          value={typed}
          onChange={e => setTyped(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(typed) } }}
          rows={1}
          placeholder="Écris ton message…"
          className="max-h-28 min-h-[42px] flex-1 resize-none rounded-2xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-800 outline-none focus:border-[#E0674C]/60 focus:bg-white"
        />
        <button
          type="submit"
          disabled={!typed.trim() || loading}
          aria-label="Envoyer"
          className="grid h-[42px] w-[42px] flex-shrink-0 place-items-center rounded-full bg-[#E0674C] text-white transition-colors hover:bg-[#c9563d] disabled:opacity-40"
        >
          <Send className="h-[18px] w-[18px]" />
        </button>
      </form>

      <style>{`@keyframes apChatDot { 0%,100% { opacity:.3; transform: translateY(0) } 50% { opacity:1; transform: translateY(-3px) } }`}</style>
    </div>
  )
}
