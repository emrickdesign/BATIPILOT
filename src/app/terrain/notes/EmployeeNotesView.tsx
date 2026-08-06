'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import DictationButton from '@/components/DictationButton'
import { addTerrainNote, deleteTerrainNote } from './actions'
import { StickyNote, Send, Trash2, HardHat, ArrowLeft, Filter } from 'lucide-react'
import { toast } from 'sonner'

export type TerrainNote = {
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

export default function EmployeeNotesView({
  projects, initial, myEmployeeId,
}: { projects: { id: string; title: string }[]; initial: TerrainNote[]; myEmployeeId: string }) {
  const [notes, setNotes] = useState<TerrainNote[]>(initial)
  const [projectId, setProjectId] = useState('')
  const [body, setBody] = useState('')
  const [filter, setFilter] = useState('')
  const [pending, start] = useTransition()

  const titleById = useMemo(() => new Map(projects.map(p => [p.id, p.title])), [projects])
  const visible = filter ? notes.filter(n => n.project_id === filter) : notes

  function add() {
    const text = body.trim()
    if (!projectId) { toast.error('Choisis un chantier'); return }
    if (!text) return
    start(async () => {
      try {
        await addTerrainNote(projectId, text)
        setNotes(n => [{
          id: `tmp-${Date.now()}`, project_id: projectId, project_title: titleById.get(projectId) || 'Chantier',
          body: text, author_name: 'Moi', author_employee_id: myEmployeeId, created_at: new Date().toISOString(),
        }, ...n])
        setBody('')
        toast.success('Note ajoutée')
      } catch { toast.error('Erreur enregistrement') }
    })
  }

  function remove(id: string) {
    start(async () => {
      try {
        await deleteTerrainNote(id)
        setNotes(n => n.filter(x => x.id !== id))
      } catch { toast.error('Erreur suppression') }
    })
  }

  return (
    <div className="min-h-dvh bg-app-bg">
      <div className="mx-auto max-w-lg px-4 py-5 space-y-4">
        <div className="flex items-center gap-3">
          <Link href="/terrain" className="grid h-9 w-9 place-items-center rounded-xl border border-gray-200 bg-white text-gray-600"><ArrowLeft className="h-4 w-4" /></Link>
          <h1 className="text-xl font-bold text-marine flex items-center gap-2"><StickyNote className="h-5 w-5 text-primary" /> Notes chantier</h1>
        </div>

        {/* Nouvelle note */}
        <div className="rounded-2xl border border-gray-200 bg-white p-3 space-y-2.5">
          <select value={projectId} onChange={e => setProjectId(e.target.value)}
            className="w-full h-11 rounded-xl border border-gray-300 px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30">
            <option value="">— Quel chantier ? —</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
          <textarea value={body} onChange={e => setBody(e.target.value)} rows={3}
            placeholder="Écris ou dicte ta note (ex : j'ai fini le placo, attention au carrelage neuf…)"
            className="w-full resize-none rounded-xl border border-gray-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          <div className="flex items-center justify-between gap-2">
            <DictationButton value={body} onChange={setBody} size="sm" />
            <button onClick={add} disabled={pending || !body.trim() || !projectId}
              className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-primary text-white text-sm font-medium disabled:opacity-50">
              <Send className="h-4 w-4" /> Ajouter
            </button>
          </div>
        </div>

        {/* Filtre */}
        {notes.length > 0 && (
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-400" />
            <select value={filter} onChange={e => setFilter(e.target.value)}
              className="h-9 rounded-lg border border-gray-300 px-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30">
              <option value="">Tous les chantiers</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </div>
        )}

        {/* Liste */}
        <div className="space-y-2.5">
          {visible.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Aucune note pour l&apos;instant.</p>
          ) : visible.map(n => (
            <div key={n.id} className="group rounded-2xl border border-gray-200 bg-white p-3.5">
              <div className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#C14E33] mb-1.5"><HardHat className="h-3.5 w-3.5" /> {n.project_title}</div>
              <p className="text-sm text-gray-800 whitespace-pre-line">{n.body}</p>
              <div className="flex items-center justify-between mt-2">
                <span className="text-[11px] text-gray-400">
                  <span className={n.author_employee_id ? 'text-[#3F7A2E] font-medium' : 'text-[#C14E33] font-medium'}>{n.author_name || 'Note'}</span> · {fmt(n.created_at)}
                </span>
                {n.author_employee_id === myEmployeeId && (
                  <button onClick={() => remove(n.id)} disabled={pending} className="text-gray-300 hover:text-[#C0392B] transition" title="Supprimer"><Trash2 className="h-3.5 w-3.5" /></button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
