'use client'

import { useRef, useState } from 'react'
import { Camera, Loader2, Check, Truck, X } from 'lucide-react'
import { toast } from 'sonner'

type ProjectOption = { id: string; title: string }
type Scanned = {
  storage_path: string
  supplier: string | null
  doc_number: string | null
  doc_date: string | null
  nbLines: number
  lines: unknown[]
}

/**
 * Scan d'un bon de livraison côté salarié (terrain).
 * Aucune donnée financière : le salarié capte, l'admin contrôle les prix ensuite.
 */
export default function TerrainBlScanner({
  employeeId, projects, defaultProjectId,
}: { employeeId: string; projects: ProjectOption[]; defaultProjectId?: string }) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const [scanning, setScanning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [scanned, setScanned] = useState<Scanned | null>(null)
  const [projectId, setProjectId] = useState(defaultProjectId || (projects.length === 1 ? projects[0].id : ''))

  async function handleScan(file: File) {
    setScanning(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('doc_type', 'bl')
      const res = await fetch('/api/achats/scan', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok && !json.storage_path) { toast.error(json.error || 'Lecture impossible'); setScanning(false); return }
      const d = json.data || {}
      setScanned({
        storage_path: json.storage_path,
        supplier: d.supplier ?? null,
        doc_number: d.doc_number ?? null,
        doc_date: d.doc_date ?? null,
        nbLines: Array.isArray(d.lines) ? d.lines.length : 0,
        lines: Array.isArray(d.lines) ? d.lines : [],
      })
    } catch { toast.error('Erreur réseau pendant le scan') }
    setScanning(false)
    if (cameraRef.current) cameraRef.current.value = ''
  }

  async function handleSave() {
    if (!scanned) return
    if (!projectId) { toast.error('Choisis le chantier'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/achats/save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doc_type: 'bl', source: 'terrain', employee_id: employeeId, project_id: projectId,
          supplier: scanned.supplier, doc_number: scanned.doc_number, doc_date: scanned.doc_date,
          storage_path: scanned.storage_path, lines: scanned.lines,
        }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Enregistrement impossible'); setSaving(false); return }
      if (json.duplicate) toast.info('Ce bon de livraison a déjà été enregistré')
      else toast.success('Bon de livraison enregistré ✓')
      setScanned(null)
    } catch { toast.error('Erreur réseau') }
    setSaving(false)
  }

  return (
    <section>
      <input ref={cameraRef} type="file" accept="image/*,.pdf" capture="environment" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleScan(f) }} />

      {!scanned ? (
        <button onClick={() => cameraRef.current?.click()} disabled={scanning}
          className="w-full flex items-center gap-3 rounded-2xl border border-amber-100 bg-amber-50/60 p-4 transition hover:bg-amber-50 disabled:opacity-60">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500 text-white">
            {scanning ? <Loader2 className="h-5 w-5 animate-spin" /> : <Truck className="h-5 w-5" />}
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className="block font-semibold text-marine">{scanning ? 'Lecture du bon…' : 'Scanner un bon de livraison'}</span>
            <span className="block text-xs text-gray-500">Photographie le BL au dépôt — rien ne se perd</span>
          </span>
          <Camera className="h-5 w-5 text-amber-400" />
        </button>
      ) : (
        <div className="rounded-2xl border border-amber-200 bg-white p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-marine flex items-center gap-1.5"><Truck className="h-4 w-4 text-amber-500" /> Bon de livraison lu</span>
            <button onClick={() => setScanned(null)} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
          </div>
          <div className="text-sm text-gray-600 space-y-1">
            <div>Fournisseur : <span className="font-medium text-gray-800">{scanned.supplier || 'à préciser'}</span></div>
            {scanned.doc_number && <div>N° : <span className="font-medium text-gray-800">{scanned.doc_number}</span></div>}
            <div>{scanned.nbLines} article{scanned.nbLines > 1 ? 's' : ''} lu{scanned.nbLines > 1 ? 's' : ''}</div>
          </div>
          <div>
            <label className="text-xs text-gray-500">Chantier</label>
            <select value={projectId} onChange={e => setProjectId(e.target.value)}
              className="mt-1 w-full h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="">— Choisir le chantier —</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </div>
          <button onClick={handleSave} disabled={saving}
            className="w-full flex items-center justify-center gap-2 h-12 rounded-xl bg-primary text-white font-semibold disabled:opacity-60">
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
            {saving ? 'Enregistrement…' : 'Enregistrer le BL'}
          </button>
        </div>
      )}
    </section>
  )
}
