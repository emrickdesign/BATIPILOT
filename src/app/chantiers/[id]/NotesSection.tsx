'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import DottedCard from '@/components/charts/DottedCard'
import { Button } from '@/components/ui/button'
import DictationButton from '@/components/DictationButton'
import { StickyNote, Trash2, Send } from 'lucide-react'
import { toast } from 'sonner'

export type NoteRow = {
  id: string
  body: string
  author_name: string
  author_employee_id: string | null
  created_at: string
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/** Notes du chantier — visibles par l'admin ET les salariés (terrain). Chacun peut en ajouter. */
export default function NotesSection({
  projectId, ownerId, authorName, initial,
}: { projectId: string; ownerId: string; authorName: string; initial: NoteRow[] }) {
  const router = useRouter()
  const [notes, setNotes] = useState<NoteRow[]>(initial)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)

  async function add() {
    const text = body.trim()
    if (!text) return
    setBusy(true)
    const supabase = createClient()
    const { data, error } = await supabase.from('notes')
      .insert({ user_id: ownerId, project_id: projectId, author_employee_id: null, author_name: authorName, body: text })
      .select('id, body, author_name, author_employee_id, created_at').single()
    setBusy(false)
    if (error || !data) { toast.error('Erreur enregistrement'); return }
    setNotes(n => [data as NoteRow, ...n])
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
    <DottedCard>
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-base flex items-center gap-2"><StickyNote className="w-4 h-4 text-gray-400" /> Notes du chantier {notes.length > 0 && <span className="text-sm font-normal text-gray-400">({notes.length})</span>}</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        {/* Ajout */}
        <div className="rounded-xl border border-gray-200 p-2.5">
          <textarea
            value={body} onChange={e => setBody(e.target.value)}
            placeholder="Contraintes, accès, code, où sont les clés, consignes… (écrire ou dicter)"
            rows={2}
            className="w-full resize-none text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none bg-transparent"
          />
          <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-gray-100">
            <DictationButton value={body} onChange={setBody} size="sm" />
            <Button onClick={add} disabled={busy || !body.trim()} size="sm" className="gap-1.5"><Send className="w-3.5 h-3.5" /> Ajouter</Button>
          </div>
        </div>

        {/* Liste */}
        {notes.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-3">Aucune note pour ce chantier.</p>
        ) : (
          <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
            {notes.map(n => (
              <div key={n.id} className="group rounded-xl bg-[#FBF7F0] border border-[#F0E7D8] p-3">
                <p className="text-sm text-gray-800 whitespace-pre-line">{n.body}</p>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-[11px] text-gray-400">
                    <span className={n.author_employee_id ? 'text-[#3F7A2E] font-medium' : 'text-[#C14E33] font-medium'}>{n.author_name || 'Note'}</span> · {fmt(n.created_at)}
                  </span>
                  <button onClick={() => remove(n.id)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-[#C0392B] transition" title="Supprimer">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </DottedCard>
  )
}
