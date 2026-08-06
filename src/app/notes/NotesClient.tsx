'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import DictationButton from '@/components/DictationButton'
import { StickyNote, Trash2, Send, HardHat, ArrowLeft, Search, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'

export type AdminNote = {
  id: string
  project_id: string
  body: string
  author_name: string
  author_employee_id: string | null
  created_at: string
}
export type NoteProject = { id: string; title: string; clientName: string | null }

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export default function NotesClient({
  ownerId, authorName, projects, initial,
}: { ownerId: string; authorName: string; projects: NoteProject[]; initial: AdminNote[] }) {
  const router = useRouter()
  const [notes, setNotes] = useState<AdminNote[]>(initial)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)

  // Notes groupées par chantier (déjà triées du plus récent au plus ancien)
  const notesByProject = useMemo(() => {
    const m = new Map<string, AdminNote[]>()
    for (const n of notes) {
      const arr = m.get(n.project_id)
      if (arr) arr.push(n); else m.set(n.project_id, [n])
    }
    return m
  }, [notes])

  const selected = selectedId ? projects.find(p => p.id === selectedId) ?? null : null
  const selectedNotes = selectedId ? notesByProject.get(selectedId) ?? [] : []

  async function add() {
    const text = body.trim()
    if (!selectedId || !text) return
    setBusy(true)
    const supabase = createClient()
    const { data, error } = await supabase.from('notes')
      .insert({ user_id: ownerId, project_id: selectedId, author_employee_id: null, author_name: authorName, body: text })
      .select('id, project_id, body, author_name, author_employee_id, created_at').single()
    setBusy(false)
    if (error || !data) { toast.error('Erreur enregistrement'); return }
    setNotes(n => [data as AdminNote, ...n])
    setBody('')
    toast.success('Note ajoutée')
    router.refresh()
  }

  async function remove(id: string) {
    const supabase = createClient()
    const { error } = await supabase.from('notes').delete().eq('id', id)
    if (error) { toast.error('Erreur suppression'); return }
    setNotes(n => n.filter(x => x.id !== id))
    router.refresh()
  }

  // ── Vue détail d'un chantier : saisie + historique ──
  if (selected) {
    return (
      <div className="space-y-5 max-w-3xl">
        <button onClick={() => { setSelectedId(null); setBody('') }} className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-4 h-4" /> Tous les chantiers
        </button>

        <div className="flex items-center gap-2.5 animate-fade-up">
          <span className="grid place-items-center w-10 h-10 rounded-xl bg-[#FCE7DE] text-[#C14E33] flex-shrink-0"><HardHat className="w-5 h-5" /></span>
          <div>
            <h1 className="text-xl md:text-2xl font-bold font-heading text-marine leading-tight">{selected.title}</h1>
            {selected.clientName && <p className="text-sm text-gray-500">{selected.clientName}</p>}
          </div>
        </div>

        {/* Saisie */}
        <Card className="animate-fade-up">
          <CardContent className="p-4 space-y-3">
            <textarea
              value={body} onChange={e => setBody(e.target.value)}
              placeholder="Contraintes, accès, code, étage, où sont les clés, consignes… (écrire ou dicter)"
              rows={3}
              className="w-full resize-none rounded-lg border border-gray-300 p-3 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <div className="flex items-center justify-between gap-2">
              <DictationButton value={body} onChange={setBody} size="sm" />
              <Button onClick={add} disabled={busy || !body.trim()} className="gap-1.5"><Send className="w-4 h-4" /> Enregistrer</Button>
            </div>
          </CardContent>
        </Card>

        {/* Historique (plus récent en haut) */}
        <div className="space-y-2.5 animate-fade-up">
          {selectedNotes.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Aucune note pour ce chantier. Ajoutez la première ci-dessus.</p>
          ) : selectedNotes.map(n => (
            <Card key={n.id} className="group">
              <CardContent className="p-3.5">
                <p className="text-sm text-gray-800 whitespace-pre-line">{n.body}</p>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[11px] text-gray-400">
                    <span className={n.author_employee_id ? 'text-[#3F7A2E] font-medium' : 'text-[#C14E33] font-medium'}>{n.author_name || 'Note'}</span> · {fmt(n.created_at)}
                  </span>
                  <button onClick={() => remove(n.id)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-[#C0392B] transition" title="Supprimer">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  // ── Vue grille : tous les chantiers ──
  const filtered = query
    ? projects.filter(p => p.title.toLowerCase().includes(query.toLowerCase()) || (p.clientName || '').toLowerCase().includes(query.toLowerCase()))
    : projects

  return (
    <div className="space-y-5">
      <div className="animate-fade-up">
        <h1 className="text-2xl md:text-[26px] font-bold font-heading text-marine flex items-center gap-2"><StickyNote className="w-6 h-6 text-primary" /> Notes</h1>
        <p className="text-gray-500 mt-1 text-sm">Choisissez un chantier pour voir et ajouter ses notes.</p>
      </div>

      {projects.length > 6 && (
        <div className="relative max-w-sm animate-fade-up">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Rechercher un chantier…"
            className="w-full h-10 rounded-lg border border-gray-300 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-10">Aucun chantier{query ? ' trouvé' : ''}.</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 animate-fade-up">
          {filtered.map(p => {
            const list = notesByProject.get(p.id) ?? []
            const count = list.length
            const last = list[0]
            return (
              <button key={p.id} onClick={() => setSelectedId(p.id)}
                className="text-left rounded-2xl border border-gray-200/80 bg-white p-4 hover:border-primary/40 hover:shadow-[var(--shadow-sm)] transition-all group">
                <div className="flex items-center gap-2.5">
                  <span className="grid place-items-center w-9 h-9 rounded-lg bg-[#FCE7DE] text-[#C14E33] flex-shrink-0"><HardHat className="w-4 h-4" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-marine truncate">{p.title}</div>
                    {p.clientName && <div className="text-xs text-gray-400 truncate">{p.clientName}</div>}
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-primary transition-colors flex-shrink-0" />
                </div>
                <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-[11px] font-medium text-gray-500">{count === 0 ? 'Aucune note' : `${count} note${count > 1 ? 's' : ''}`}</span>
                  {last && <span className="text-[11px] text-gray-400">{fmt(last.created_at)}</span>}
                </div>
                {last && <p className="mt-1.5 text-[12px] text-gray-500 line-clamp-2">{last.body}</p>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
