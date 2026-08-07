'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import DictationButton from '@/components/DictationButton'
import { StickyNote, Trash2, Send, ArrowLeft, Search } from 'lucide-react'
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

// Palette d'avatars — couleur stable par chantier (pas d'icône qui se répète)
const AVATAR_COLORS: [string, string][] = [
  ['#FCE7DE', '#C14E33'], // orange (marque)
  ['#E0EFDA', '#3F7A2E'], // vert
  ['#DDE9F5', '#2C5F8A'], // bleu
  ['#F3E4F5', '#8A3F8A'], // violet
  ['#FBEAD2', '#B5811E'], // ambre
  ['#E5E7F5', '#4B4F9E'], // indigo
  ['#FADFE3', '#B5334A'], // rose
  ['#D9EFEC', '#1F7A6E'], // sarcelle
]
function avatarFor(id: string): { bg: string; fg: string } {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  const [bg, fg] = AVATAR_COLORS[h % AVATAR_COLORS.length]
  return { bg, fg }
}
const initialsOf = (title: string) =>
  title.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '#'

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

  const filtered = query
    ? projects.filter(p => p.title.toLowerCase().includes(query.toLowerCase()) || (p.clientName || '').toLowerCase().includes(query.toLowerCase()))
    : projects

  // ── Colonne liste (cartes chantiers) ──
  const listPane = (
    <div className={selected ? 'hidden lg:block' : ''}>
      <div className="animate-fade-up">
        <h1 className="text-2xl md:text-[26px] font-bold font-heading text-marine flex items-center gap-2"><StickyNote className="w-6 h-6 text-primary" /> Notes</h1>
        <p className="text-gray-500 mt-1 text-sm">Choisissez un chantier pour voir et ajouter ses notes.</p>
      </div>

      {projects.length > 6 && (
        <div className="relative max-w-sm mt-4 animate-fade-up">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Rechercher un chantier…"
            className="w-full h-10 rounded-lg border border-gray-300 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-10">Aucun chantier{query ? ' trouvé' : ''}.</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-1 gap-3 mt-4 animate-fade-up">
          {filtered.map(p => {
            const list = notesByProject.get(p.id) ?? []
            const count = list.length
            const last = list[0]
            const { bg, fg } = avatarFor(p.id)
            const active = p.id === selectedId
            return (
              <button key={p.id} onClick={() => { setSelectedId(p.id); setBody('') }}
                className={`text-left rounded-2xl border bg-white p-4 transition-all group ${
                  active
                    ? 'border-primary/60 shadow-[var(--shadow-md)] ring-1 ring-primary/20'
                    : 'border-gray-200/80 hover:border-primary/40 hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5'
                }`}>
                <div className="flex items-start gap-3">
                  <span className="grid place-items-center w-11 h-11 rounded-xl font-bold text-sm flex-shrink-0"
                    style={{ backgroundColor: bg, color: fg }}>{initialsOf(p.title)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-bold text-marine leading-snug truncate">{p.title}</div>
                    {p.clientName && <div className="text-xs text-gray-400 truncate mt-0.5">{p.clientName}</div>}
                  </div>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                    count > 0 ? 'bg-primary/10 text-primary' : 'bg-gray-100 text-gray-400'
                  }`}>{count}</span>
                </div>
                {last ? (
                  <p className="mt-3 text-[12px] text-gray-500 line-clamp-2 leading-relaxed">{last.body}</p>
                ) : (
                  <p className="mt-3 text-[12px] text-gray-300 italic">Aucune note</p>
                )}
                {last && <div className="mt-2 text-[11px] text-gray-400">{fmt(last.created_at)}</div>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )

  // ── Panneau détail (saisie + historique) ──
  const detailPane = (() => {
    if (!selected) {
      // Placeholder desktop uniquement (mobile n'affiche jamais ce vide)
      return (
        <div className="hidden lg:flex flex-col items-center justify-center text-center rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 py-20 px-6">
          <span className="grid place-items-center w-14 h-14 rounded-2xl bg-white shadow-[var(--shadow-sm)] text-primary mb-4"><StickyNote className="w-7 h-7" /></span>
          <p className="text-sm font-medium text-gray-500">Sélectionnez un chantier</p>
          <p className="text-xs text-gray-400 mt-1">Ses notes s’affichent ici.</p>
        </div>
      )
    }
    const { bg, fg } = avatarFor(selected.id)
    return (
      <div className={`space-y-5 ${!selected ? 'hidden lg:block' : ''}`}>
        <button onClick={() => { setSelectedId(null); setBody('') }} className="lg:hidden inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-4 h-4" /> Tous les chantiers
        </button>

        <div className="flex items-center gap-3 animate-fade-up">
          <span className="grid place-items-center w-12 h-12 rounded-2xl font-bold flex-shrink-0"
            style={{ backgroundColor: bg, color: fg }}>{initialsOf(selected.title)}</span>
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-bold font-heading text-marine leading-tight truncate">{selected.title}</h1>
            {selected.clientName && <p className="text-sm text-gray-500 truncate">{selected.clientName}</p>}
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
  })()

  return (
    <div className="lg:grid lg:grid-cols-[minmax(320px,400px)_1fr] lg:gap-6 lg:items-start">
      {listPane}
      <div className="lg:sticky lg:top-4">{detailPane}</div>
    </div>
  )
}
