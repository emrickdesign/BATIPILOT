'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { MessageSquarePlus, Send, Users2, Search } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { createConversation, sendMessage, getNewMessages } from './actions'
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
  const [newConvOpen, setNewConvOpen] = useState(false)
  const [search, setSearch] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

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

  // Poll léger pour la conversation ouverte (pas de vrai push temps réel)
  useEffect(() => {
    if (!selectedId) return
    const interval = setInterval(async () => {
      const list = messagesByConv.get(selectedId) || []
      const last = list[list.length - 1]
      const after = last ? last.created_at : new Date(0).toISOString()
      const res = await getNewMessages(selectedId, after)
      if (res.messages && res.messages.length) {
        setMessagesByConv(prev => {
          const next = new Map(prev)
          const existing = next.get(selectedId) || []
          const ids = new Set(existing.map(m => m.id))
          const fresh = res.messages!.filter(m => !ids.has(m.id))
          if (fresh.length) next.set(selectedId, [...existing, ...fresh])
          return next
        })
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }, 3000)
    return () => clearInterval(interval)
  }, [selectedId, messagesByConv])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [selectedId, messagesByConv])

  async function handleSend() {
    if (!selectedId || !draft.trim() || sending) return
    setSending(true)
    const body = draft.trim()
    setDraft('')
    const res = await sendMessage(selectedId, body)
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
    }
    setSending(false)
  }

  const selected = sortedConversations.find(c => c.id === selectedId) || null
  const selectedMessages = selectedId ? (messagesByConv.get(selectedId) || []) : []
  const roster = employees.filter(e => viewer.kind === 'admin' || e.id !== viewer.employeeId)

  return (
    <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-4 h-[calc(100vh-11rem)] min-h-[500px]">
      {/* Liste des conversations */}
      <Card className="border-0 shadow-[var(--shadow-sm)] flex flex-col overflow-hidden">
        <div className="p-3 border-b border-gray-100 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher" className="pl-8 h-8" />
          </div>
          <Button size="icon-sm" style={{ backgroundColor: COLOR }} className="text-white flex-shrink-0" onClick={() => setNewConvOpen(true)} title="Nouvelle conversation">
            <MessageSquarePlus className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {sortedConversations.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-400">Aucune conversation pour l&apos;instant.</div>
          ) : (
            sortedConversations
              .filter(c => convName(c).toLowerCase().includes(search.toLowerCase()))
              .map(c => {
                const emps = participantsByConv.get(c.id) || []
                const last = convLastMessage(c.id)
                const active = c.id === selectedId
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className={cn('w-full flex items-center gap-3 p-3 text-left border-b border-gray-50 hover:bg-gray-50 transition-colors', active && 'bg-accent hover:bg-accent')}
                  >
                    {c.type === 'group' ? (
                      <span className="grid place-items-center w-10 h-10 rounded-full flex-shrink-0 text-white" style={{ backgroundColor: COLOR }}>
                        <Users2 className="w-[18px] h-[18px]" />
                      </span>
                    ) : (
                      <span className="grid place-items-center w-10 h-10 rounded-full flex-shrink-0 text-white text-xs font-bold" style={{ backgroundColor: emps[0]?.color || COLOR }}>
                        {emps[0] ? employeeInitials(emps[0].full_name) : 'D'}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-gray-900 truncate">{convName(c)}</p>
                        {last && <span className="text-[11px] text-gray-400 flex-shrink-0">{relativeTime(last.created_at)}</span>}
                      </div>
                      <p className="text-xs text-gray-400 truncate mt-0.5">{last ? last.body : 'Aucun message'}</p>
                    </div>
                  </button>
                )
              })
          )}
        </div>
      </Card>

      {/* Fil de discussion */}
      <Card className="border-0 shadow-[var(--shadow-sm)] flex flex-col overflow-hidden">
        {!selected ? (
          <div className="flex-1 grid place-items-center text-center text-gray-400 p-8">
            <div>
              <MessageSquarePlus className="w-10 h-10 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">Choisis une conversation, ou démarre-en une nouvelle.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="p-3.5 border-b border-gray-100 flex items-center gap-2.5">
              <span className="grid place-items-center w-8 h-8 rounded-lg flex-shrink-0" style={{ backgroundColor: `${COLOR}18`, color: COLOR }}>
                {selected.type === 'group' ? <Users2 className="w-4 h-4" /> : <span className="text-xs font-bold">{employeeInitials(convName(selected))}</span>}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-marine truncate">{convName(selected)}</p>
                {selected.type === 'group' && (
                  <p className="text-xs text-gray-400 truncate">{(participantsByConv.get(selected.id) || []).map(e => e.full_name).join(', ')}</p>
                )}
              </div>
            </div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/40">
              {selectedMessages.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-8">Aucun message. Écris le premier !</p>
              ) : (
                selectedMessages.map(m => {
                  const mine = isMine(m)
                  return (
                    <div key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                      <div className={cn('max-w-[75%] rounded-lg px-3.5 py-2', mine ? 'bg-primary text-primary-foreground' : 'bg-white border border-gray-100 text-gray-800')}>
                        {selected.type === 'group' && !mine && (
                          <p className="text-[11px] font-semibold mb-0.5" style={{ color: COLOR }}>{senderLabel(m)}</p>
                        )}
                        <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>
                        <p className={cn('text-[10px] mt-1', mine ? 'text-white/70' : 'text-gray-400')}>{relativeTime(m.created_at)}</p>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
            <div className="p-3 border-t border-gray-100 flex items-center gap-2">
              <Input
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                placeholder="Écrire un message..."
                className="flex-1 h-10"
              />
              <Button size="icon" onClick={handleSend} disabled={!draft.trim() || sending}><Send className="w-4 h-4" /></Button>
            </div>
          </>
        )}
      </Card>

      <NewConversationDialog open={newConvOpen} onOpenChange={setNewConvOpen} roster={roster} onCreated={setSelectedId} />
    </div>
  )
}

function NewConversationDialog({ open, onOpenChange, roster, onCreated }: {
  open: boolean; onOpenChange: (v: boolean) => void; roster: Employee[]; onCreated: (id: string) => void
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [groupName, setGroupName] = useState('')
  const [busy, setBusy] = useState(false)

  function toggle(id: string) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function handleCreate() {
    setBusy(true)
    const res = await createConversation(selectedIds, groupName || undefined)
    setBusy(false)
    if (res.success && res.conversationId) {
      onCreated(res.conversationId)
      onOpenChange(false)
      setSelectedIds([])
      setGroupName('')
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
