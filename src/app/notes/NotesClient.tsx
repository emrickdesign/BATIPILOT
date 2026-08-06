'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import DictationButton from '@/components/DictationButton'
import { StickyNote, Trash2, Send, HardHat, Filter } from 'lucide-react'
import { toast } from 'sonner'

export type AdminNote = {
  id: string
  project_id: string
  project_title: string
  body: string
  author_name: string
  author_employee_id: string | null
  created_at: string
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export default function NotesClient({
  ownerId, authorName, projects, initial,
}: { ownerId: string; authorName: string; projects: { id: string; title: string }[]; initial: AdminNote[] }) {
  const router = useRouter()
  const [notes, setNotes] = useState<AdminNote[]>(initial)
  const [projectId, setProjectId] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState('')

  const titleById = useMemo(() => new Map(projects.map(p => [p.id, p.title])), [projects])
  const visible = filter ? notes.filter(n => n.project_id === filter) : notes

  async function add() {
    const text = body.trim()
    if (!projectId) { toast.error('Choisis un chantier'); return }
    if (!text) return
    setBusy(true)
    const supabase = createClient()
    const { data, error } = await supabase.from('notes')
      .insert({ user_id: ownerId, project_id: projectId, author_employee_id: null, author_name: authorName, body: text })
      .select('id, project_id, body, author_name, author_employee_id, created_at').single()
    setBusy(false)
    if (error || !data) { toast.error('Erreur enregistrement'); return }
    setNotes(n => [{ ...(data as Omit<AdminNote, 'project_title'>), project_title: titleById.get(projectId) || 'Chantier' }, ...n])
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

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="animate-fade-up">
        <h1 className="text-2xl md:text-[26px] font-bold font-heading text-marine flex items-center gap-2"><StickyNote className="w-6 h-6 text-primary" /> Notes</h1>
        <p className="text-gray-500 mt-1 text-sm">Prises de notes par chantier — visibles par vous et vos salariés sur la fiche chantier.</p>
      </div>

      {/* Nouvelle note */}
      <Card className="animate-fade-up">
        <CardContent className="p-4 space-y-3">
          <select value={projectId} onChange={e => setProjectId(e.target.value)}
            className="w-full h-10 rounded-lg border border-gray-300 px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30">
            <option value="">— Choisir le chantier concerné —</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
          <textarea
            value={body} onChange={e => setBody(e.target.value)}
            placeholder="Contraintes, accès, code, étage, où sont les clés, consignes… (écrire ou dicter)"
            rows={3}
            className="w-full resize-none rounded-lg border border-gray-300 p-3 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <div className="flex items-center justify-between gap-2">
            <DictationButton value={body} onChange={setBody} size="sm" />
            <Button onClick={add} disabled={busy || !body.trim() || !projectId} className="gap-1.5"><Send className="w-4 h-4" /> Enregistrer</Button>
          </div>
        </CardContent>
      </Card>

      {/* Filtre + liste */}
      {projects.length > 0 && notes.length > 0 && (
        <div className="flex items-center gap-2 animate-fade-up">
          <Filter className="w-4 h-4 text-gray-400" />
          <select value={filter} onChange={e => setFilter(e.target.value)}
            className="h-9 rounded-lg border border-gray-300 px-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30">
            <option value="">Tous les chantiers</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </div>
      )}

      <div className="space-y-2.5 animate-fade-up">
        {visible.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">Aucune note{filter ? ' pour ce chantier' : ''}.</p>
        ) : visible.map(n => (
          <Card key={n.id} className="group">
            <CardContent className="p-3.5">
              <div className="flex items-center gap-2 mb-1.5">
                <Link href={`/chantiers/${n.project_id}`} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#C14E33] hover:underline">
                  <HardHat className="w-3.5 h-3.5" /> {n.project_title}
                </Link>
              </div>
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
