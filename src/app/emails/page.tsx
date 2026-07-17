'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import Link from 'next/link'
import ComposeWindow, { type ComposeInit } from '@/components/emails/ComposeWindow'
import MessageView, { type FullMessage } from '@/components/emails/MessageView'
import {
  Mail, Inbox, Star, Clock, Send, FileText, Trash2, AlertOctagon, Tag,
  Pencil, RefreshCw, Search, Archive, ChevronLeft, ChevronRight, Plus,
  Loader2, Paperclip, X, Menu,
} from 'lucide-react'

type MessageRow = {
  id: string
  threadId: string
  labelIds: string[]
  snippet: string
  internalDate: string
  from: { name: string; email: string }
  subject: string
  hasAttachments: boolean
  ai: { category?: string; importance?: string; ai_summary?: string; linked_client_id?: string } | null
}

type GmailLabel = {
  id: string
  name: string
  type: 'system' | 'user'
  messagesUnread?: number
  messagesTotal?: number
}

const SYSTEM_VIEWS = [
  { id: 'INBOX', label: 'Boîte de réception', icon: Inbox },
  { id: 'STARRED', label: 'Messages suivis', icon: Star },
  { id: 'SNOOZED', label: 'En attente', icon: Clock },
  { id: 'SENT', label: 'Messages envoyés', icon: Send },
  { id: 'DRAFT', label: 'Brouillons', icon: FileText },
  { id: 'SPAM', label: 'Spam', icon: AlertOctagon },
  { id: 'TRASH', label: 'Corbeille', icon: Trash2 },
]

const PAGE_SIZE = 30

/** Format Gmail : heure aujourd'hui, jour+mois cette année, date complète sinon. */
function formatDate(internalDate: string): string {
  const d = new Date(Number(internalDate))
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  if (d.getFullYear() === now.getFullYear())
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function EmailsPage() {
  const [connected, setConnected] = useState<boolean | null>(null)
  const [view, setView] = useState('INBOX')
  const [messages, setMessages] = useState<MessageRow[]>([])
  const [labels, setLabels] = useState<GmailLabel[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [openId, setOpenId] = useState<string | null>(null)
  const [compose, setCompose] = useState<ComposeInit | null>(null)
  const [search, setSearch] = useState('')
  const [activeQuery, setActiveQuery] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Pagination Gmail : jetons opaques, on empile pour pouvoir revenir en arrière.
  const [pageTokens, setPageTokens] = useState<(string | null)[]>([null])
  const [pageIndex, setPageIndex] = useState(0)
  const [nextPageToken, setNextPageToken] = useState<string | null>(null)

  const reqIdRef = useRef(0)

  const loadLabels = useCallback(async () => {
    try {
      const res = await fetch('/api/gmail/labels')
      const json = await res.json()
      if (res.ok) setLabels(json.labels || [])
    } catch {}
  }, [])

  const loadMessages = useCallback(async (opts?: { silent?: boolean }) => {
    // Chaque chargement porte un numéro : une réponse en retard ne doit jamais
    // écraser l'affichage d'une vue plus récente.
    const reqId = ++reqIdRef.current
    if (opts?.silent) setRefreshing(true)
    else setLoading(true)

    const qs = new URLSearchParams()
    qs.set('maxResults', String(PAGE_SIZE))
    if (activeQuery) qs.set('q', activeQuery)
    else qs.append('labelIds', view)
    const token = pageTokens[pageIndex]
    if (token) qs.set('pageToken', token)

    try {
      const res = await fetch(`/api/gmail/messages?${qs}`)
      const json = await res.json()
      if (reqId !== reqIdRef.current) return
      if (!res.ok) {
        if (json.reconnect) setConnected(false)
        else toast.error(json.error || 'Erreur de chargement')
        setMessages([])
      } else {
        setMessages(json.messages || [])
        setNextPageToken(json.nextPageToken || null)
      }
    } catch {
      if (reqId === reqIdRef.current) toast.error('Erreur réseau')
    }
    if (reqId === reqIdRef.current) {
      setLoading(false)
      setRefreshing(false)
    }
  }, [view, activeQuery, pageTokens, pageIndex])

  useEffect(() => {
    ;(async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('gmail_connections')
        .select('gmail_email')
        .eq('user_id', user.id)
        .maybeSingle()
      const ok = !!data?.gmail_email
      setConnected(ok)
      if (!ok) setLoading(false)
    })()
  }, [])

  useEffect(() => {
    if (connected) {
      loadMessages()
      loadLabels()
    }
  }, [connected, loadMessages, loadLabels])

  function changeView(next: string) {
    setView(next)
    setActiveQuery('')
    setSearch('')
    setOpenId(null)
    setSelected(new Set())
    setPageTokens([null])
    setPageIndex(0)
    setSidebarOpen(false)
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault()
    setActiveQuery(search.trim())
    setOpenId(null)
    setSelected(new Set())
    setPageTokens([null])
    setPageIndex(0)
  }

  /**
   * Applique une action dans Gmail puis retire localement les messages qui ne
   * sont plus dans la vue courante, sans attendre un rechargement complet.
   */
  async function runAction(ids: string[], action: string) {
    if (!ids.length) return
    const snapshot = messages
    const leavesView =
      (action === 'archive' && view === 'INBOX') ||
      (action === 'trash') ||
      (action === 'spam' && view !== 'SPAM') ||
      (action === 'unspam' && view === 'SPAM') ||
      (action === 'unstar' && view === 'STARRED')

    if (leavesView) setMessages(prev => prev.filter(m => !ids.includes(m.id)))
    else {
      const patch: Record<string, { add?: string; remove?: string }> = {
        star: { add: 'STARRED' }, unstar: { remove: 'STARRED' },
        read: { remove: 'UNREAD' }, unread: { add: 'UNREAD' },
      }
      const p = patch[action]
      if (p) {
        setMessages(prev => prev.map(m => !ids.includes(m.id) ? m : {
          ...m,
          labelIds: p.add
            ? [...new Set([...m.labelIds, p.add])]
            : m.labelIds.filter(l => l !== p.remove),
        }))
      }
    }
    setSelected(new Set())
    if (ids.includes(openId || '')) setOpenId(null)

    try {
      const res = await fetch('/api/gmail/modify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur')
      const verb: Record<string, string> = {
        archive: 'archivé', trash: 'supprimé', spam: 'signalé comme spam',
        unspam: 'retiré des spams', read: 'marqué comme lu', unread: 'marqué comme non lu',
      }
      if (verb[action]) {
        toast.success(`${ids.length} message${ids.length > 1 ? 's' : ''} ${verb[action]}${ids.length > 1 && verb[action].endsWith('é') ? 's' : ''}`)
      }
      loadLabels()
    } catch (e: any) {
      // Gmail a refusé : on remet la liste telle qu'elle était.
      setMessages(snapshot)
      toast.error(e?.message || 'Action impossible')
    }
  }

  async function createLabel() {
    const name = window.prompt('Nom du nouveau libellé')
    if (!name?.trim()) return
    try {
      const res = await fetch('/api/gmail/labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur')
      toast.success(`Libellé « ${name.trim()} » créé dans Gmail`)
      loadLabels()
    } catch (e: any) {
      toast.error(e?.message || 'Création impossible')
    }
  }

  async function applyLabel(labelId: string) {
    const ids = [...selected]
    if (!ids.length) return
    try {
      const res = await fetch('/api/gmail/modify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action: 'label', addLabelIds: [labelId] }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur')
      toast.success('Libellé appliqué')
      setSelected(new Set())
      loadLabels()
    } catch (e: any) {
      toast.error(e?.message || 'Erreur')
    }
  }

  function openReply(m: FullMessage) {
    setCompose({
      mode: 'reply',
      to: m.from.email,
      recipientName: m.from.name || m.from.email,
      subject: /^re\s*:/i.test(m.subject) ? m.subject : `Re: ${m.subject}`,
      threadId: m.threadId,
      inReplyTo: m.messageIdHeader,
      references: m.references,
      emailId: undefined,
    })
    // L'assistant IA a besoin de l'id du miroir Supabase, pas de celui de Gmail.
    ;(async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('emails')
        .select('id')
        .eq('user_id', user.id)
        .eq('gmail_message_id', m.id)
        .maybeSingle()
      if (data?.id) setCompose(prev => (prev ? { ...prev, emailId: data.id } : prev))
    })()
  }

  async function createProspect(m: FullMessage) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [first, ...rest] = (m.from.name || '').trim().split(' ')
    const { data: client, error } = await supabase
      .from('clients')
      .insert({
        user_id: user.id,
        type: 'particulier',
        first_name: first || null,
        last_name: rest.join(' ') || null,
        email: m.from.email || null,
        status: 'nouveau',
      })
      .select()
      .single()
    if (error || !client) {
      toast.error('Erreur création prospect')
      return
    }
    await supabase.from('emails').update({ linked_client_id: client.id }).eq('gmail_message_id', m.id)
    window.location.href = `/clients/${client.id}`
  }

  const userLabels = labels.filter(l => l.type === 'user')
  const inboxUnread = labels.find(l => l.id === 'INBOX')?.messagesUnread || 0
  const allSelected = messages.length > 0 && selected.size === messages.length

  if (connected === false) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Mes mails</h1>
        <div className="rounded-xl border bg-white py-12 text-center">
          <Mail className="mx-auto mb-3 h-12 w-12 text-gray-300" />
          <p className="mb-4 font-medium text-gray-700">Gmail non connecté</p>
          <Link href="/parametres/gmail">
            <Button className="rounded-full bg-[#E0674C] hover:bg-[#c9563d]">Connecter Gmail</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-7rem)] overflow-hidden rounded-xl border bg-white">
      {/* Sidebar Gmail */}
      <aside
        className={cn(
          'absolute inset-y-0 left-0 z-30 w-60 flex-shrink-0 overflow-y-auto border-r bg-white p-3 transition-transform md:relative md:translate-x-0',
          sidebarOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full'
        )}
      >
        <Button
          onClick={() => setCompose({ mode: 'new' })}
          className="mb-4 h-12 w-full justify-start gap-3 rounded-2xl bg-[#E0674C] px-5 text-sm shadow-sm hover:bg-[#c9563d]"
        >
          <Pencil className="h-4 w-4" />
          Nouveau message
        </Button>

        <nav className="space-y-0.5">
          {SYSTEM_VIEWS.map(v => {
            const label = labels.find(l => l.id === v.id)
            const unread = v.id === 'DRAFT' ? label?.messagesTotal : label?.messagesUnread
            const active = view === v.id && !activeQuery
            return (
              <button
                key={v.id}
                onClick={() => changeView(v.id)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-r-full py-1.5 pl-4 pr-3 text-sm transition-colors',
                  active
                    ? 'bg-[#FDE7E0] font-semibold text-[#8C2F17]'
                    : 'text-gray-700 hover:bg-gray-100'
                )}
              >
                <v.icon className="h-4 w-4 flex-shrink-0" />
                <span className="flex-1 truncate text-left">{v.label}</span>
                {!!unread && <span className="flex-shrink-0 text-xs font-semibold">{unread}</span>}
              </button>
            )
          })}
        </nav>

        <div className="mt-4 border-t pt-3">
          <div className="mb-1 flex items-center justify-between px-4">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Libellés</span>
            <button
              onClick={createLabel}
              title="Créer un libellé"
              className="rounded-full p-1 text-gray-500 hover:bg-gray-100"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          {userLabels.length === 0 ? (
            <p className="px-4 py-2 text-xs text-gray-400">Aucun libellé</p>
          ) : (
            <nav className="space-y-0.5">
              {userLabels.map(l => (
                <button
                  key={l.id}
                  onClick={() => changeView(l.id)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-r-full py-1.5 pl-4 pr-3 text-sm transition-colors',
                    view === l.id && !activeQuery
                      ? 'bg-[#FDE7E0] font-semibold text-[#8C2F17]'
                      : 'text-gray-700 hover:bg-gray-100'
                  )}
                >
                  <Tag className="h-4 w-4 flex-shrink-0" />
                  <span className="flex-1 truncate text-left">{l.name}</span>
                  {!!l.messagesUnread && (
                    <span className="flex-shrink-0 text-xs font-semibold">{l.messagesUnread}</span>
                  )}
                </button>
              ))}
            </nav>
          )}
        </div>
      </aside>

      {sidebarOpen && (
        <div className="absolute inset-0 z-20 bg-black/20 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Colonne principale */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Recherche */}
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-full p-2 text-gray-600 hover:bg-gray-100 md:hidden"
            aria-label="Menu"
          >
            <Menu className="h-[18px] w-[18px]" />
          </button>
          <form onSubmit={submitSearch} className="flex flex-1 items-center gap-2 rounded-full bg-gray-100 px-4 py-2">
            <Search className="h-4 w-4 flex-shrink-0 text-gray-500" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher dans les messages"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
            {activeQuery && (
              <button
                type="button"
                onClick={() => { setSearch(''); setActiveQuery(''); setPageTokens([null]); setPageIndex(0) }}
                className="flex-shrink-0 rounded-full p-0.5 hover:bg-gray-200"
                aria-label="Effacer la recherche"
              >
                <X className="h-4 w-4 text-gray-500" />
              </button>
            )}
          </form>
        </div>

        {openId ? (
          <MessageView
            messageId={openId}
            onBack={() => setOpenId(null)}
            onReply={openReply}
            onAction={runAction}
            onCreateProspect={createProspect}
          />
        ) : (
          <>
            {/* Barre d'outils */}
            <div className="flex items-center gap-1 border-b px-3 py-1.5">
              <input
                type="checkbox"
                aria-label="Tout sélectionner"
                checked={allSelected}
                onChange={e =>
                  setSelected(e.target.checked ? new Set(messages.map(m => m.id)) : new Set())
                }
                className="mx-2 h-4 w-4 accent-[#E0674C]"
              />
              <button
                onClick={() => loadMessages({ silent: true })}
                title="Actualiser"
                className="rounded-full p-2 text-gray-600 hover:bg-gray-100"
              >
                <RefreshCw className={cn('h-[18px] w-[18px]', refreshing && 'animate-spin')} />
              </button>

              {selected.size > 0 && (
                <>
                  <div className="mx-1 h-5 w-px bg-gray-200" />
                  <button onClick={() => runAction([...selected], 'archive')} title="Archiver" className="rounded-full p-2 text-gray-600 hover:bg-gray-100">
                    <Archive className="h-[18px] w-[18px]" />
                  </button>
                  <button onClick={() => runAction([...selected], view === 'SPAM' ? 'unspam' : 'spam')} title={view === 'SPAM' ? 'Non spam' : 'Signaler comme spam'} className="rounded-full p-2 text-gray-600 hover:bg-gray-100">
                    <AlertOctagon className="h-[18px] w-[18px]" />
                  </button>
                  <button onClick={() => runAction([...selected], 'trash')} title="Supprimer" className="rounded-full p-2 text-gray-600 hover:bg-gray-100">
                    <Trash2 className="h-[18px] w-[18px]" />
                  </button>
                  <button onClick={() => runAction([...selected], 'read')} title="Marquer comme lu" className="rounded-full p-2 text-gray-600 hover:bg-gray-100">
                    <Mail className="h-[18px] w-[18px]" />
                  </button>
                  {userLabels.length > 0 && (
                    <select
                      onChange={e => { if (e.target.value) applyLabel(e.target.value); e.target.value = '' }}
                      className="ml-1 rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600"
                      defaultValue=""
                      aria-label="Appliquer un libellé"
                    >
                      <option value="">Libellé…</option>
                      {userLabels.map(l => (
                        <option key={l.id} value={l.id}>{l.name}</option>
                      ))}
                    </select>
                  )}
                  <span className="ml-2 text-xs text-gray-500">{selected.size} sélectionné{selected.size > 1 ? 's' : ''}</span>
                </>
              )}

              <div className="flex-1" />

              <button
                onClick={() => { setPageIndex(i => Math.max(0, i - 1)); setSelected(new Set()) }}
                disabled={pageIndex === 0 || loading}
                title="Page précédente"
                className="rounded-full p-2 text-gray-600 hover:bg-gray-100 disabled:opacity-30"
              >
                <ChevronLeft className="h-[18px] w-[18px]" />
              </button>
              <button
                onClick={() => {
                  if (!nextPageToken) return
                  setPageTokens(prev => {
                    const next = [...prev]
                    next[pageIndex + 1] = nextPageToken
                    return next
                  })
                  setPageIndex(i => i + 1)
                  setSelected(new Set())
                }}
                disabled={!nextPageToken || loading}
                title="Page suivante"
                className="rounded-full p-2 text-gray-600 hover:bg-gray-100 disabled:opacity-30"
              >
                <ChevronRight className="h-[18px] w-[18px]" />
              </button>
            </div>

            {/* Liste */}
            <div className="min-h-0 flex-1 overflow-y-auto">
              {loading ? (
                <div className="divide-y">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="h-4 w-4 animate-pulse rounded bg-gray-100" />
                      <div className="h-3 w-40 animate-pulse rounded bg-gray-100" />
                      <div className="h-3 flex-1 animate-pulse rounded bg-gray-100" />
                    </div>
                  ))}
                </div>
              ) : messages.length === 0 ? (
                <div className="py-20 text-center text-gray-500">
                  <Mail className="mx-auto mb-2 h-10 w-10 text-gray-300" />
                  <p className="font-medium">
                    {activeQuery ? 'Aucun résultat' : 'Aucun message ici'}
                  </p>
                </div>
              ) : (
                <div className="divide-y">
                  {messages.map(m => {
                    const unread = m.labelIds.includes('UNREAD')
                    const starred = m.labelIds.includes('STARRED')
                    const isSelected = selected.has(m.id)
                    return (
                      <div
                        key={m.id}
                        onClick={() => {
                          setOpenId(m.id)
                          if (unread) runAction([m.id], 'read')
                        }}
                        className={cn(
                          'group flex cursor-pointer items-center gap-2 px-3 py-[7px] text-sm transition-colors',
                          isSelected ? 'bg-[#FDE7E0]' : unread ? 'bg-white hover:shadow-md' : 'bg-gray-50/60 hover:shadow-md'
                        )}
                      >
                        <input
                          type="checkbox"
                          aria-label={`Sélectionner : ${m.subject}`}
                          checked={isSelected}
                          onClick={e => e.stopPropagation()}
                          onChange={e => {
                            const checked = e.target.checked
                            setSelected(prev => {
                              const next = new Set(prev)
                              if (checked) next.add(m.id)
                              else next.delete(m.id)
                              return next
                            })
                          }}
                          className="h-4 w-4 flex-shrink-0 accent-[#E0674C]"
                        />
                        <button
                          onClick={e => { e.stopPropagation(); runAction([m.id], starred ? 'unstar' : 'star') }}
                          aria-label={starred ? 'Retirer des suivis' : 'Suivre'}
                          className="flex-shrink-0 p-0.5"
                        >
                          <Star className={cn('h-4 w-4', starred ? 'fill-[#F4B400] text-[#F4B400]' : 'text-gray-300 hover:text-gray-500')} />
                        </button>

                        <span className={cn('w-40 flex-shrink-0 truncate', unread ? 'font-bold text-gray-900' : 'text-gray-700')}>
                          {m.from.name || m.from.email}
                        </span>

                        <span className="min-w-0 flex-1 truncate">
                          <span className={cn(unread ? 'font-bold text-gray-900' : 'text-gray-700')}>
                            {m.subject}
                          </span>
                          <span className="text-gray-500"> — {m.snippet}</span>
                        </span>

                        {m.ai?.importance === 'urgent' && (
                          <span className="flex-shrink-0 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
                            Urgent
                          </span>
                        )}
                        {m.hasAttachments && <Paperclip className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />}

                        {/* Comme dans Gmail, les actions prennent la place de la
                            date au survol : largeur figée pour que rien ne bouge. */}
                        <span className="flex w-[72px] flex-shrink-0 justify-end">
                          <span className={cn('text-xs group-hover:hidden', unread ? 'font-bold text-gray-900' : 'text-gray-500')}>
                            {formatDate(m.internalDate)}
                          </span>
                          <span className="hidden items-center gap-0.5 group-hover:flex">
                            <button
                              onClick={e => { e.stopPropagation(); runAction([m.id], 'archive') }}
                              title="Archiver"
                              className="rounded-full p-1 text-gray-500 hover:bg-gray-200"
                            >
                              <Archive className="h-4 w-4" />
                            </button>
                            <button
                              onClick={e => { e.stopPropagation(); runAction([m.id], 'trash') }}
                              title="Supprimer"
                              className="rounded-full p-1 text-gray-500 hover:bg-gray-200"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </span>
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {compose && (
        <ComposeWindow
          init={compose}
          onClose={() => setCompose(null)}
          onSent={() => { loadMessages({ silent: true }); loadLabels() }}
        />
      )}
    </div>
  )
}
