'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  ArrowLeft, Reply, Trash2, Archive, AlertOctagon, Star, Paperclip,
  Loader2, Download, UserPlus,
} from 'lucide-react'
import Link from 'next/link'

export type FullMessage = {
  id: string
  threadId: string
  labelIds: string[]
  subject: string
  from: { name: string; email: string }
  to: string
  cc: string
  date: string
  internalDate: string
  bodyHtml: string
  bodyText: string
  messageIdHeader: string
  references: string
  attachments: { attachmentId: string; filename: string; mimeType: string; size: number }[]
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

const CATEGORY_LABEL: Record<string, string> = {
  demande_devis: '📋 Devis', client_a_repondre: '💬 Client', relance_client: '🔔 Relance',
  fournisseur: '📦 Fournisseur', facture_recue: '🧾 Facture', document_admin: '📄 Admin',
  pub_newsletter: '📣 Pub', spam: '🗑️ Spam', personnel: '👤 Perso', a_verifier: '❓ À vérifier',
}

export default function MessageView({
  messageId,
  onBack,
  onReply,
  onAction,
  onCreateProspect,
}: {
  messageId: string
  onBack: () => void
  onReply: (m: FullMessage) => void
  onAction: (ids: string[], action: string) => void
  onCreateProspect: (m: FullMessage) => void
}) {
  const [message, setMessage] = useState<FullMessage | null>(null)
  const [ai, setAi] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const res = await fetch(`/api/gmail/messages/${messageId}`)
        const json = await res.json()
        if (cancelled) return
        if (!res.ok) throw new Error(json.error || 'Erreur')
        setMessage(json.message)
        setAi(json.ai)
      } catch (e: any) {
        if (!cancelled) toast.error(e?.message || 'Impossible d\'ouvrir le message')
      }
      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [messageId])

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-300" />
      </div>
    )
  }
  if (!message) return null

  const starred = message.labelIds.includes('STARRED')
  const date = new Date(Number(message.internalDate) || message.date)

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Barre d'actions */}
      <div className="flex items-center gap-1 border-b px-2 py-1.5">
        <button onClick={onBack} title="Retour" className="rounded-full p-2 text-gray-600 hover:bg-gray-100">
          <ArrowLeft className="h-[18px] w-[18px]" />
        </button>
        <div className="mx-1 h-5 w-px bg-gray-200" />
        <button onClick={() => onAction([message.id], 'archive')} title="Archiver" className="rounded-full p-2 text-gray-600 hover:bg-gray-100">
          <Archive className="h-[18px] w-[18px]" />
        </button>
        <button onClick={() => onAction([message.id], 'spam')} title="Signaler comme spam" className="rounded-full p-2 text-gray-600 hover:bg-gray-100">
          <AlertOctagon className="h-[18px] w-[18px]" />
        </button>
        <button onClick={() => onAction([message.id], 'trash')} title="Supprimer" className="rounded-full p-2 text-gray-600 hover:bg-gray-100">
          <Trash2 className="h-[18px] w-[18px]" />
        </button>
        <button
          onClick={() => onAction([message.id], starred ? 'unstar' : 'star')}
          title={starred ? 'Retirer des suivis' : 'Suivre'}
          className="rounded-full p-2 text-gray-600 hover:bg-gray-100"
        >
          <Star className={`h-[18px] w-[18px] ${starred ? 'fill-[#F4B400] text-[#F4B400]' : ''}`} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-6 py-4">
          <h1 className="mb-3 text-xl font-normal text-gray-900">{message.subject}</h1>

          <div className="mb-4 flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#E0674C] text-sm font-medium text-white">
                {(message.from.name || message.from.email || '?').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900">
                    {message.from.name || message.from.email}
                  </span>
                  <span className="truncate text-xs text-gray-500">&lt;{message.from.email}&gt;</span>
                  {ai?.category && (
                    <span className="text-xs text-gray-400">{CATEGORY_LABEL[ai.category] || ai.category}</span>
                  )}
                  {ai?.importance === 'urgent' && (
                    <Badge className="bg-red-100 text-xs text-red-700">Urgent</Badge>
                  )}
                </div>
                <p className="truncate text-xs text-gray-500">À : {message.to}</p>
                {message.cc && <p className="truncate text-xs text-gray-500">Cc : {message.cc}</p>}
              </div>
            </div>
            <span className="flex-shrink-0 text-xs text-gray-500">
              {date.toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>

          {ai?.ai_summary && (
            <div className="mb-4 rounded-lg border border-[#E0674C]/20 bg-[#FDF6F3] p-3">
              <p className="text-sm text-gray-700">{ai.ai_summary}</p>
              {ai.ai_recommended_action && (
                <p className="mt-1 text-xs text-[#E0674C]">→ {ai.ai_recommended_action}</p>
              )}
            </div>
          )}

          {/* Le HTML vient d'un tiers : iframe en sandbox, sans scripts ni
              accès à la page. C'est la seule façon sûre de l'afficher tel quel. */}
          {message.bodyHtml ? (
            <iframe
              title="Contenu du message"
              sandbox=""
              className="w-full border-0"
              style={{ height: 600 }}
              srcDoc={`<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>body{margin:0;font-family:Arial,sans-serif;font-size:14px;color:#202124;word-wrap:break-word}img{max-width:100%;height:auto}</style></head><body>${message.bodyHtml}</body></html>`}
            />
          ) : (
            <pre className="whitespace-pre-wrap break-words font-sans text-sm text-gray-800">
              {message.bodyText}
            </pre>
          )}

          {/* Pièces jointes */}
          {message.attachments.length > 0 && (
            <div className="mt-6 border-t pt-4">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-gray-600">
                <Paperclip className="h-3.5 w-3.5" />
                {message.attachments.length} pièce{message.attachments.length > 1 ? 's' : ''} jointe{message.attachments.length > 1 ? 's' : ''}
              </p>
              <div className="flex flex-wrap gap-2">
                {message.attachments.map(a => (
                  <a
                    key={a.attachmentId}
                    href={`/api/gmail/messages/${message.id}/attachments/${a.attachmentId}?filename=${encodeURIComponent(a.filename)}&mimeType=${encodeURIComponent(a.mimeType)}`}
                    className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs hover:bg-gray-50"
                  >
                    <Download className="h-4 w-4 flex-shrink-0 text-gray-400" />
                    <span className="max-w-[200px] truncate font-medium">{a.filename}</span>
                    <span className="text-gray-400">{humanSize(a.size)}</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 flex gap-2 border-t pt-4">
            <Button onClick={() => onReply(message)} className="h-9 gap-2 rounded-full bg-[#E0674C] px-5 hover:bg-[#c9563d]">
              <Reply className="h-4 w-4" /> Répondre
            </Button>
            {ai?.linked_client_id ? (
              <Link href={`/clients/${ai.linked_client_id}`}>
                <Button variant="outline" className="h-9 rounded-full px-5">Voir le client</Button>
              </Link>
            ) : (
              <Button
                variant="outline"
                onClick={() => onCreateProspect(message)}
                className="h-9 gap-2 rounded-full border-emerald-200 px-5 text-emerald-700 hover:bg-emerald-50"
              >
                <UserPlus className="h-4 w-4" /> Créer un prospect
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
