'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Tag, Pencil, Trash2, Check, X, Plus, Loader2 } from 'lucide-react'
import type { GmailLabel } from '@/app/emails/page'

export default function ManageLabelsDialog({
  labels,
  onClose,
  onChanged,
}: {
  labels: GmailLabel[]
  onClose: () => void
  onChanged: () => void
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  async function rename(id: string) {
    const name = draftName.trim()
    if (!name) return
    setBusy(id)
    try {
      const res = await fetch('/api/gmail/labels', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur')
      toast.success('Libellé renommé')
      setEditing(null)
      onChanged()
    } catch (e: any) {
      toast.error(e?.message || 'Renommage impossible')
    }
    setBusy(null)
  }

  async function remove(label: GmailLabel) {
    // Gmail supprime le libellé, pas les messages — mais l'utilisateur ne le
    // sait pas forcément, donc on le dit dans la question.
    const ok = window.confirm(
      `Supprimer le libellé « ${label.name} » ?\n\nIl disparaîtra aussi de Gmail. Les messages qui le portent ne sont pas supprimés.`
    )
    if (!ok) return
    setBusy(label.id)
    try {
      const res = await fetch(`/api/gmail/labels?id=${encodeURIComponent(label.id)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur')
      toast.success('Libellé supprimé')
      onChanged()
    } catch (e: any) {
      toast.error(e?.message || 'Suppression impossible')
    }
    setBusy(null)
  }

  async function create() {
    const name = window.prompt('Nom du nouveau libellé')
    if (!name?.trim()) return
    try {
      const res = await fetch('/api/gmail/labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur')
      toast.success('Libellé créé dans Gmail')
      onChanged()
    } catch (e: any) {
      toast.error(e?.message || 'Création impossible')
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Gérer les libellés</DialogTitle>
          <p className="text-sm text-gray-500">
            Ces libellés sont ceux de votre Gmail. Toute modification ici s'y applique.
          </p>
        </DialogHeader>

        <div className="max-h-[50vh] space-y-1 overflow-y-auto py-1">
          {labels.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">Aucun libellé pour l'instant</p>
          ) : (
            labels.map(l => (
              <div key={l.id} className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-gray-50">
                <Tag className="h-4 w-4 flex-shrink-0 text-gray-400" />
                {editing === l.id ? (
                  <>
                    <input
                      autoFocus
                      value={draftName}
                      onChange={e => setDraftName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') rename(l.id)
                        if (e.key === 'Escape') setEditing(null)
                      }}
                      className="min-w-0 flex-1 rounded border border-gray-200 px-2 py-1 text-sm outline-none focus:border-[#E0674C]"
                    />
                    <button
                      onClick={() => rename(l.id)}
                      disabled={busy === l.id}
                      aria-label="Valider"
                      className="flex-shrink-0 rounded-full p-1.5 text-emerald-600 hover:bg-emerald-50"
                    >
                      {busy === l.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    </button>
                    <button
                      onClick={() => setEditing(null)}
                      aria-label="Annuler"
                      className="flex-shrink-0 rounded-full p-1.5 text-gray-500 hover:bg-gray-100"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate text-sm">{l.name}</span>
                    {!!l.messagesTotal && (
                      <span className="flex-shrink-0 text-xs text-gray-400">{l.messagesTotal}</span>
                    )}
                    <button
                      onClick={() => { setEditing(l.id); setDraftName(l.name) }}
                      aria-label={`Renommer ${l.name}`}
                      className="flex-shrink-0 rounded-full p-1.5 text-gray-500 hover:bg-gray-100"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => remove(l)}
                      disabled={busy === l.id}
                      aria-label={`Supprimer ${l.name}`}
                      className="flex-shrink-0 rounded-full p-1.5 text-red-500 hover:bg-red-50"
                    >
                      {busy === l.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </button>
                  </>
                )}
              </div>
            ))
          )}
        </div>

        <div className="flex gap-2 border-t pt-3">
          <Button onClick={create} className="h-9 gap-2 rounded-full bg-[#E0674C] px-5 hover:bg-[#c9563d]">
            <Plus className="h-4 w-4" /> Créer un libellé
          </Button>
          <Button variant="outline" onClick={onClose} className="h-9 rounded-full px-5">
            Fermer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
