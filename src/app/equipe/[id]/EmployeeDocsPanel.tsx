'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { FileText, Upload, Trash2, Download, Loader2, AlertTriangle } from 'lucide-react'

export type EmpDoc = {
  id: string; name: string; category: string | null; expiry_date: string | null; storage_path: string
}

const CATS: Record<string, string> = {
  contrat: 'Contrat', habilitation: 'Habilitation', caces: 'CACES',
  visite_medicale: 'Visite médicale', diplome: 'Diplôme / certif.', autre: 'Autre',
}

export default function EmployeeDocsPanel({ employeeId, initial }: { employeeId: string; initial: EmpDoc[] }) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<EmpDoc[]>(initial)
  const [category, setCategory] = useState('contrat')
  const [expiry, setExpiry] = useState('')
  const [busy, setBusy] = useState(false)

  const today = new Date().toISOString().split('T')[0]
  const in30 = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]

  async function onFile(f: File) {
    setBusy(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { toast.error('Non connecté'); return }
      const safe = f.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')
      const path = `docs/${user.id}/${Date.now()}-${safe}`
      const { error: upErr } = await supabase.storage.from('documents').upload(path, f, { contentType: f.type || undefined, upsert: false })
      if (upErr) { toast.error("Erreur lors de l'envoi"); return }
      const { data, error } = await supabase.from('documents').insert({
        user_id: user.id, employee_id: employeeId, name: f.name, category,
        expiry_date: expiry || null, storage_path: path, file_type: f.type || null, file_size: f.size,
      }).select('id,name,category,expiry_date,storage_path').single()
      if (error || !data) { await supabase.storage.from('documents').remove([path]); toast.error('Erreur'); return }
      setRows(prev => [data as EmpDoc, ...prev])
      setExpiry('')
      toast.success('Document ajouté')
      router.refresh()
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function download(doc: EmpDoc) {
    const supabase = createClient()
    const { data } = await supabase.storage.from('documents').createSignedUrl(doc.storage_path, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
    else toast.error('Lien indisponible')
  }

  async function remove(doc: EmpDoc) {
    setRows(prev => prev.filter(r => r.id !== doc.id))
    const supabase = createClient()
    await supabase.from('documents').delete().eq('id', doc.id)
    await supabase.storage.from('documents').remove([doc.storage_path])
    router.refresh()
  }

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-base flex items-center gap-2"><FileText className="w-4 h-4 text-gray-400" /> Documents & habilitations</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="text-xs text-gray-500">Type</label>
            <select value={category} onChange={e => setCategory(e.target.value)} className="w-full h-8 border border-gray-200 rounded-md px-2 text-sm bg-white">
              {Object.entries(CATS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500">Échéance (optionnel)</label>
            <Input type="date" value={expiry} onChange={e => setExpiry(e.target.value)} className="h-8 text-sm w-40" />
          </div>
          <input ref={fileRef} type="file" className="hidden" onChange={e => e.target.files?.[0] && onFile(e.target.files[0])} />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={busy} className="gap-1">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Ajouter
          </Button>
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-gray-400 py-1">Aucun document. Ajoutez contrat, CACES, visite médicale…</p>
        ) : rows.map(d => {
          const expired = d.expiry_date && d.expiry_date < today
          const soon = d.expiry_date && !expired && d.expiry_date <= in30
          return (
            <div key={d.id} className="flex items-center gap-2 text-sm border border-gray-100 rounded-lg px-3 py-2">
              <FileText className="w-4 h-4 text-gray-300 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-800 truncate">{d.name}</p>
                <p className="text-[11px] text-gray-400">
                  {CATS[d.category || ''] || d.category || 'Document'}
                  {d.expiry_date && <> · échéance {new Date(d.expiry_date).toLocaleDateString('fr-FR')}</>}
                </p>
              </div>
              {expired && <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600"><AlertTriangle className="w-3.5 h-3.5" /> expiré</span>}
              {soon && <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600"><AlertTriangle className="w-3.5 h-3.5" /> bientôt</span>}
              <button onClick={() => download(d)} className="text-gray-300 hover:text-primary"><Download className="w-4 h-4" /></button>
              <button onClick={() => remove(d)} className="text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
