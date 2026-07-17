'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useDictation } from '@/hooks/useDictation'
import { toast } from 'sonner'
import {
  X, Minus, Maximize2, Minimize2, Paperclip, Send, Trash2,
  Mic, Square, Sparkles, Loader2, FileText,
} from 'lucide-react'

export type ComposeInit = {
  mode: 'new' | 'reply'
  to?: string
  cc?: string
  subject?: string
  body?: string
  /** Fil Gmail auquel rattacher la réponse. */
  threadId?: string
  inReplyTo?: string
  references?: string
  /** Id du miroir Supabase, requis pour le brouillon IA. */
  emailId?: string
  recipientName?: string
}

const MAX_TOTAL_BYTES = 4 * 1024 * 1024

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

/** Le corps est saisi en texte brut ; Gmail attend du HTML. */
function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return `<div style="font-family:Arial,sans-serif;font-size:14px;color:#202124;white-space:pre-wrap">${escaped.replace(/\n/g, '<br>')}</div>`
}

export default function ComposeWindow({
  init,
  onClose,
  onSent,
}: {
  init: ComposeInit
  onClose: () => void
  onSent?: () => void
}) {
  const [to, setTo] = useState(init.to || '')
  const [cc, setCc] = useState(init.cc || '')
  const [bcc, setBcc] = useState('')
  const [showCc, setShowCc] = useState(!!init.cc)
  const [subject, setSubject] = useState(init.subject || '')
  const [body, setBody] = useState(init.body || '')
  const [files, setFiles] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const [view, setView] = useState<'normal' | 'minimized' | 'maximized'>('normal')

  // Assistant IA — réponse uniquement
  const [intent, setIntent] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [showAi, setShowAi] = useState(init.mode === 'reply')

  const fileRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  const dictation = useDictation(chunk =>
    setIntent(prev => (prev ? `${prev} ${chunk}` : chunk))
  )

  // Le brouillon IA se génère à l'ouverture d'une réponse : c'est le comportement
  // attendu de l'ancienne popup, qu'on conserve.
  useEffect(() => {
    if (init.mode === 'reply' && init.emailId && !init.body) generateDraft('')
    // Volontairement au montage seulement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (init.mode === 'new') setTimeout(() => bodyRef.current?.focus(), 50)
  }, [init.mode])

  async function generateDraft(userIntent: string) {
    if (!init.emailId) return
    setAiLoading(true)
    try {
      const res = await fetch('/api/gmail/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailId: init.emailId, userIntent: userIntent || undefined }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur')
      setBody(json.draft || '')
    } catch (e: any) {
      toast.error(e?.message || 'Erreur génération du brouillon')
    }
    setAiLoading(false)
  }

  function addFiles(list: FileList | null) {
    if (!list?.length) return
    const incoming = Array.from(list)
    const total = [...files, ...incoming].reduce((s, f) => s + f.size, 0)
    if (total > MAX_TOTAL_BYTES) {
      toast.error(`Pièces jointes trop lourdes (${humanSize(MAX_TOTAL_BYTES)} maximum au total)`)
      return
    }
    setFiles(prev => [...prev, ...incoming])
  }

  async function handleSend(asDraft = false) {
    if (!asDraft && !to.trim()) {
      toast.error('Indiquez au moins un destinataire')
      return
    }
    setSending(true)
    dictation.stop()

    const form = new FormData()
    form.set('to', to.trim())
    if (cc.trim()) form.set('cc', cc.trim())
    if (bcc.trim()) form.set('bcc', bcc.trim())
    form.set('subject', subject.trim())
    form.set('html', textToHtml(body))
    if (init.threadId) form.set('threadId', init.threadId)
    if (init.inReplyTo) form.set('inReplyTo', init.inReplyTo)
    if (init.references) form.set('references', init.references)
    if (asDraft) form.set('draft', 'true')
    for (const f of files) form.append('attachments', f)

    try {
      const res = await fetch('/api/gmail/compose', { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur envoi')
      toast.success(asDraft ? 'Brouillon enregistré' : 'Message envoyé')
      onSent?.()
      onClose()
    } catch (e: any) {
      toast.error(e?.message || 'Erreur envoi')
      setSending(false)
    }
  }

  const title =
    view === 'minimized' && init.mode === 'reply'
      ? `Réponse à ${init.recipientName || init.to || ''}`
      : init.mode === 'reply'
        ? 'Répondre'
        : 'Nouveau message'

  return (
    <div
      className={cn(
        'fixed z-50 flex flex-col overflow-hidden rounded-t-lg border border-gray-300 bg-white shadow-2xl',
        view === 'maximized'
          ? 'inset-4 rounded-lg md:inset-8'
          : view === 'minimized'
            ? 'bottom-0 right-4 w-72 md:right-8'
            : 'bottom-0 right-0 h-[min(640px,calc(100vh-2rem))] w-full md:right-8 md:w-[640px]'
      )}
    >
      {/* Barre de titre */}
      <div
        className="flex cursor-pointer items-center justify-between bg-[#404040] px-4 py-2.5 text-white"
        onClick={() => view === 'minimized' && setView('normal')}
      >
        <span className="truncate text-sm font-medium">{title}</span>
        <div className="flex flex-shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label="Réduire"
            className="rounded p-1 hover:bg-white/20"
            onClick={e => {
              e.stopPropagation()
              setView(view === 'minimized' ? 'normal' : 'minimized')
            }}
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label={view === 'maximized' ? 'Réduire la fenêtre' : 'Plein écran'}
            className="rounded p-1 hover:bg-white/20"
            onClick={e => {
              e.stopPropagation()
              setView(view === 'maximized' ? 'normal' : 'maximized')
            }}
          >
            {view === 'maximized' ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button
            type="button"
            aria-label="Fermer"
            className="rounded p-1 hover:bg-white/20"
            onClick={e => {
              e.stopPropagation()
              dictation.stop()
              onClose()
            }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {view !== 'minimized' && (
        <>
          {/* Destinataires */}
          <div className="border-b px-4">
            <div className="flex items-center gap-2 border-b py-2">
              <span className="w-10 flex-shrink-0 text-sm text-gray-500">À</span>
              <input
                value={to}
                onChange={e => setTo(e.target.value)}
                placeholder="destinataire@exemple.fr"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
              {!showCc && (
                <button
                  type="button"
                  onClick={() => setShowCc(true)}
                  className="flex-shrink-0 text-xs text-gray-500 hover:text-gray-800"
                >
                  Cc Cci
                </button>
              )}
            </div>
            {showCc && (
              <>
                <div className="flex items-center gap-2 border-b py-2">
                  <span className="w-10 flex-shrink-0 text-sm text-gray-500">Cc</span>
                  <input
                    value={cc}
                    onChange={e => setCc(e.target.value)}
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                  />
                </div>
                <div className="flex items-center gap-2 border-b py-2">
                  <span className="w-10 flex-shrink-0 text-sm text-gray-500">Cci</span>
                  <input
                    value={bcc}
                    onChange={e => setBcc(e.target.value)}
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                  />
                </div>
              </>
            )}
            <div className="py-2">
              <input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Objet"
                className="w-full bg-transparent text-sm outline-none"
              />
            </div>
          </div>

          {/* Assistant IA (réponse) */}
          {showAi && init.emailId && (
            <div className="border-b bg-[#FDF6F3] px-4 py-3">
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-medium text-gray-700">
                  Que voulez-vous dire ?
                </label>
                <button
                  type="button"
                  onClick={() => setShowAi(false)}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Masquer
                </button>
              </div>
              <div className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <textarea
                    value={intent + (dictation.interim ? ` ${dictation.interim}` : '')}
                    onChange={e => setIntent(e.target.value)}
                    rows={2}
                    placeholder="Ex : dire que je passe lundi matin pour le métré…"
                    className="w-full resize-none rounded-md border border-gray-200 bg-white p-2 text-sm outline-none focus:border-[#E0674C]"
                  />
                  {dictation.recording && (
                    <span className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-600">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
                      À l'écoute
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={dictation.toggle}
                  title={dictation.supported ? 'Dicter' : 'Dictée non supportée par ce navigateur'}
                  disabled={!dictation.supported}
                  className={cn(
                    'flex h-auto w-10 flex-shrink-0 items-center justify-center rounded-md border transition-colors disabled:opacity-40',
                    dictation.recording
                      ? 'border-red-300 bg-red-500 text-white'
                      : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                  )}
                >
                  {dictation.recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </button>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => generateDraft(intent)}
                disabled={aiLoading}
                className="mt-2 h-7 gap-1.5 border-[#E0674C]/30 bg-white text-xs text-[#E0674C] hover:bg-[#E0674C]/5"
              >
                {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {aiLoading ? 'Rédaction…' : body ? 'Regénérer' : 'Générer'}
              </Button>
            </div>
          )}

          {/* Corps */}
          <div className="relative min-h-0 flex-1">
            {aiLoading && !body ? (
              <div className="flex h-full items-center justify-center gap-2 text-sm text-gray-400">
                <Loader2 className="h-5 w-5 animate-spin" />
                L'IA rédige la réponse…
              </div>
            ) : (
              <textarea
                ref={bodyRef}
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder="Écrivez votre message…"
                className="h-full w-full resize-none px-4 py-3 text-sm outline-none"
              />
            )}
          </div>

          {/* Pièces jointes */}
          {files.length > 0 && (
            <div className="flex flex-wrap gap-2 border-t bg-gray-50 px-4 py-2">
              {files.map((f, i) => (
                <span
                  key={`${f.name}-${i}`}
                  className="flex max-w-full items-center gap-1.5 rounded border border-gray-200 bg-white py-1 pl-2 pr-1 text-xs"
                >
                  <FileText className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
                  <span className="truncate">{f.name}</span>
                  <span className="flex-shrink-0 text-gray-400">{humanSize(f.size)}</span>
                  <button
                    type="button"
                    aria-label={`Retirer ${f.name}`}
                    onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                    className="flex-shrink-0 rounded p-0.5 hover:bg-gray-100"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Barre d'action */}
          <div className="flex items-center gap-1 border-t px-4 py-2.5">
            <Button
              onClick={() => handleSend(false)}
              disabled={sending}
              className="h-9 gap-2 rounded-full bg-[#E0674C] px-5 text-sm hover:bg-[#c9563d]"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {sending ? 'Envoi…' : 'Envoyer'}
            </Button>

            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              onChange={e => {
                addFiles(e.target.files)
                e.target.value = ''
              }}
            />
            <button
              type="button"
              aria-label="Joindre un fichier"
              title="Joindre un fichier"
              onClick={() => fileRef.current?.click()}
              className="rounded-full p-2 text-gray-600 hover:bg-gray-100"
            >
              <Paperclip className="h-[18px] w-[18px]" />
            </button>

            {init.emailId && !showAi && (
              <button
                type="button"
                title="Assistant IA"
                onClick={() => setShowAi(true)}
                className="rounded-full p-2 text-[#E0674C] hover:bg-[#E0674C]/10"
              >
                <Sparkles className="h-[18px] w-[18px]" />
              </button>
            )}

            <div className="flex-1" />

            <button
              type="button"
              title="Enregistrer comme brouillon"
              onClick={() => handleSend(true)}
              disabled={sending}
              className="rounded-full p-2 text-gray-600 hover:bg-gray-100 disabled:opacity-40"
            >
              <FileText className="h-[18px] w-[18px]" />
            </button>
            <button
              type="button"
              title="Supprimer le message"
              onClick={() => {
                dictation.stop()
                onClose()
              }}
              className="rounded-full p-2 text-gray-600 hover:bg-gray-100"
            >
              <Trash2 className="h-[18px] w-[18px]" />
            </button>
          </div>
        </>
      )}
    </div>
  )
}
