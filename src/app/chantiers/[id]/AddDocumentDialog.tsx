'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Plus, Upload, Loader2, FolderOpen } from 'lucide-react'

// Pop-up d'import de documents, rattachés au chantier (sans quitter la fiche).
export default function AddDocumentDialog({ projectId, pillClassName }: { projectId: string; pillClassName: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function upload(files: FileList) {
    setBusy(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setBusy(false); toast.error('Non connecté'); return }
    let ok = 0
    for (const f of Array.from(files)) {
      const safe = f.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')
      const path = `docs/${user.id}/${Date.now()}-${safe}`
      const { error: upErr } = await supabase.storage.from('documents').upload(path, f, { contentType: f.type || undefined, upsert: false })
      if (upErr) continue
      const { error } = await supabase.from('documents').insert({
        user_id: user.id, project_id: projectId, name: f.name, storage_path: path, file_type: f.type || null, file_size: f.size,
      })
      if (error) { await supabase.storage.from('documents').remove([path]); continue }
      ok++
    }
    setBusy(false)
    if (fileRef.current) fileRef.current.value = ''
    if (ok) { toast.success(`${ok} document${ok > 1 ? 's' : ''} ajouté${ok > 1 ? 's' : ''}`); setOpen(false); router.refresh() }
    else toast.error('Envoi impossible')
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className={pillClassName}><Plus className="w-3.5 h-3.5" /> Document</button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md sm:max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><FolderOpen className="w-5 h-5 text-[#1F7A6E]" /> Ajouter un document</DialogTitle></DialogHeader>
          <input ref={fileRef} type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" className="hidden"
            onChange={e => e.target.files?.length && upload(e.target.files)} />
          <button onClick={() => fileRef.current?.click()} disabled={busy}
            className="w-full rounded-xl border-2 border-dashed border-gray-300 py-10 grid place-items-center text-gray-400 hover:border-primary hover:text-primary transition-colors disabled:opacity-60">
            {busy ? <Loader2 className="w-8 h-8 animate-spin" /> : (
              <div className="text-center"><Upload className="w-8 h-8 mx-auto mb-2" /><span className="text-sm font-medium">Choisir un ou plusieurs fichiers</span><p className="text-xs text-gray-400 mt-1">Photos, PDF, Word, Excel</p></div>
            )}
          </button>
          <p className="text-xs text-gray-400">Le document sera rattaché à ce chantier.</p>
        </DialogContent>
      </Dialog>
    </>
  )
}
