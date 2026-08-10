'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Plus, Camera, Upload, Loader2, ReceiptText } from 'lucide-react'
import { expenseCategoryOptions } from '@/lib/depenses'

type Draft = { storage_path: string; signedUrl?: string; supplier: string; date: string; amount_ttc: string; amount_ht: string; vat_amount: string; category: string }
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))

// Pop-up : scan/import d'un ticket → dépense rattachée au chantier (sans quitter la fiche).
export default function AddTicketDialog({ projectId, pillClassName }: { projectId: string; pillClassName: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const camRef = useRef<HTMLInputElement>(null)
  const impRef = useRef<HTMLInputElement>(null)

  async function scan(file: File) {
    setScanning(true)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch('/api/tickets/scan', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok && !json.storage_path) { toast.error(json.error || 'Lecture impossible'); return }
      const d = json.data || {}
      let signedUrl: string | undefined
      if (json.storage_path) { const { data } = await createClient().storage.from('documents').createSignedUrl(json.storage_path, 3600); signedUrl = data?.signedUrl }
      setDraft({ storage_path: json.storage_path, signedUrl, supplier: str(d.supplier), date: str(d.date), amount_ttc: str(d.amount_ttc), amount_ht: str(d.amount_ht), vat_amount: str(d.vat_amount), category: expenseCategoryOptions.includes(d.category) ? d.category : '' })
      toast[json.error ? 'warning' : 'success'](json.error ? 'Lu partiellement — vérifiez les champs' : 'Ticket lu — vérifiez puis enregistrez')
    } catch { toast.error('Erreur réseau') } finally { setScanning(false); if (camRef.current) camRef.current.value = ''; if (impRef.current) impRef.current.value = '' }
  }

  function set(k: keyof Draft, v: string) { setDraft(d => (d ? { ...d, [k]: v } : d)) }

  async function save() {
    if (!draft) return
    if (!draft.amount_ttc) { toast.error('Indiquez au moins le montant TTC'); return }
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    const numv = (v: string) => (v === '' ? null : Number(v.replace(',', '.')))
    const { error } = await supabase.from('expenses').insert({
      user_id: user.id, project_id: projectId, supplier: draft.supplier || null, expense_date: draft.date || null,
      amount_ttc: numv(draft.amount_ttc) ?? 0, amount_ht: numv(draft.amount_ht) ?? 0, vat_amount: numv(draft.vat_amount) ?? 0,
      category: draft.category || null, storage_path: draft.storage_path || null, source: 'ticket', status: 'a_verifier',
    })
    setSaving(false)
    if (error) { toast.error('Enregistrement impossible'); return }
    toast.success('Ticket enregistré')
    setDraft(null); setOpen(false); router.refresh()
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className={pillClassName}><Plus className="w-3.5 h-3.5" /> Ticket</button>
      <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) setDraft(null) }}>
        <DialogContent className="max-w-lg sm:max-w-lg">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><ReceiptText className="w-5 h-5 text-[#B5811E]" /> Scanner un ticket</DialogTitle></DialogHeader>
          <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) scan(f) }} />
          <input ref={impRef} type="file" accept="image/*,.pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) scan(f) }} />
          {!draft ? (
            <div className="flex gap-2">
              <Button className="flex-1 h-11 gap-2" disabled={scanning} onClick={() => camRef.current?.click()}>{scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />} {scanning ? 'Lecture…' : 'Prendre en photo'}</Button>
              <Button variant="outline" className="flex-1 h-11 gap-2" disabled={scanning} onClick={() => impRef.current?.click()}><Upload className="w-4 h-4" /> Importer</Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1"><Label className="text-xs text-gray-500">Fournisseur</Label><Input value={draft.supplier} onChange={e => set('supplier', e.target.value)} placeholder="Ex : Leroy Merlin" /></div>
                <div className="space-y-1"><Label className="text-xs text-gray-500">Date</Label><Input type="date" value={draft.date} onChange={e => set('date', e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1"><Label className="text-xs text-gray-500">TTC €</Label><Input type="number" step="0.01" value={draft.amount_ttc} onChange={e => set('amount_ttc', e.target.value)} /></div>
                <div className="space-y-1"><Label className="text-xs text-gray-500">HT €</Label><Input type="number" step="0.01" value={draft.amount_ht} onChange={e => set('amount_ht', e.target.value)} /></div>
                <div className="space-y-1"><Label className="text-xs text-gray-500">TVA €</Label><Input type="number" step="0.01" value={draft.vat_amount} onChange={e => set('vat_amount', e.target.value)} /></div>
              </div>
              <div className="space-y-1"><Label className="text-xs text-gray-500">Catégorie</Label>
                <select value={draft.category} onChange={e => set('category', e.target.value)} className="w-full h-10 rounded-md border border-gray-200 bg-white px-3 text-sm">
                  <option value="">— À classer —</option>{expenseCategoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setDraft(null)} disabled={saving}>Rescanner</Button>
                <Button onClick={save} disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer le ticket'}</Button>
              </div>
            </div>
          )}
          <p className="text-xs text-gray-400">Rattaché automatiquement à ce chantier.</p>
        </DialogContent>
      </Dialog>
    </>
  )
}
