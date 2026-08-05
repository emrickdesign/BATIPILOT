'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'
import { Camera, Upload, Loader2, Plus, Trash2, FileText } from 'lucide-react'
import type { SupplierDocType } from '@/types'
import { supplierDocTypeLabels } from '@/lib/achats'

type ProjectOption = { id: string; title: string }

type LineDraft = {
  designation: string; quantity: string; unit: string
  unit_price_ht: string; total_ht: string; quality: string; reference: string
}
type Draft = {
  storage_path: string; signedUrl?: string
  supplier: string; doc_number: string; doc_date: string
  total_ht: string; total_ttc: string; vat_amount: string
  project_id: string; consultation_label: string; notes: string
  lines: LineDraft[]
}

const selectClass =
  'w-full h-10 rounded-md border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary'
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))
const emptyLine = (): LineDraft => ({ designation: '', quantity: '', unit: '', unit_price_ht: '', total_ht: '', quality: '', reference: '' })

export default function AchatsScanner({
  docType, projects, preselectProject, onSaved,
}: {
  docType: SupplierDocType
  projects: ProjectOption[]
  preselectProject?: string
  onSaved?: () => void
}) {
  const router = useRouter()
  const cameraRef = useRef<HTMLInputElement>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const [scanning, setScanning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)

  async function handleScan(file: File) {
    setScanning(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('doc_type', docType)
      const res = await fetch('/api/achats/scan', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok && !json.storage_path) {
        toast.error(json.error || 'Lecture du document impossible')
        setScanning(false); return
      }
      const d = json.data || {}
      let signedUrl: string | undefined
      if (json.storage_path) {
        const supabase = createClient()
        const { data } = await supabase.storage.from('documents').createSignedUrl(json.storage_path, 3600)
        signedUrl = data?.signedUrl
      }
      const lines: LineDraft[] = Array.isArray(d.lines) && d.lines.length
        ? d.lines.map((l: Record<string, unknown>) => ({
            designation: str(l.designation), quantity: str(l.quantity), unit: str(l.unit),
            unit_price_ht: str(l.unit_price_ht), total_ht: str(l.total_ht), quality: str(l.quality), reference: str(l.reference),
          }))
        : [emptyLine()]
      setDraft({
        storage_path: json.storage_path, signedUrl,
        supplier: str(d.supplier), doc_number: str(d.doc_number), doc_date: str(d.doc_date),
        total_ht: str(d.total_ht), total_ttc: str(d.total_ttc), vat_amount: str(d.vat_amount),
        project_id: preselectProject || '', consultation_label: '', notes: '', lines,
      })
      if (json.error) toast.warning('Document enregistré, lecture partielle — vérifiez les champs')
      else toast.success('Document lu — vérifiez puis enregistrez')
    } catch {
      toast.error('Erreur réseau pendant le scan')
    }
    setScanning(false)
    if (cameraRef.current) cameraRef.current.value = ''
    if (importRef.current) importRef.current.value = ''
  }

  function setField(k: keyof Draft, v: string) { setDraft(d => (d ? { ...d, [k]: v } : d)) }
  function setLine(i: number, k: keyof LineDraft, v: string) {
    setDraft(d => d ? { ...d, lines: d.lines.map((l, j) => j === i ? { ...l, [k]: v } : l) } : d)
  }
  function addLine() { setDraft(d => d ? { ...d, lines: [...d.lines, emptyLine()] } : d) }
  function removeLine(i: number) { setDraft(d => d ? { ...d, lines: d.lines.filter((_, j) => j !== i) } : d) }

  async function handleSave() {
    if (!draft) return
    if (!draft.supplier.trim()) { toast.error('Indiquez le fournisseur'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/achats/save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doc_type: docType, source: 'admin',
          project_id: draft.project_id || null,
          supplier: draft.supplier, doc_number: draft.doc_number, doc_date: draft.doc_date,
          total_ht: draft.total_ht, total_ttc: draft.total_ttc, vat_amount: draft.vat_amount,
          consultation_label: draft.consultation_label, notes: draft.notes,
          storage_path: draft.storage_path,
          lines: draft.lines.filter(l => l.designation.trim()),
        }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Enregistrement impossible'); setSaving(false); return }
      if (json.duplicate) toast.info('Ce document existe déjà (même fournisseur et numéro) — non dupliqué')
      else toast.success(`${supplierDocTypeLabels[docType]} enregistré${docType === 'facture' ? ' · dépense créée' : ''}`)
      setDraft(null)
      onSaved?.()
      router.refresh()
    } catch {
      toast.error('Erreur réseau')
    }
    setSaving(false)
  }

  const showPrices = docType !== 'bl'

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleScan(f) }} />
        <input ref={importRef} type="file" accept="image/*,.pdf,.png,.jpg,.jpeg,.webp" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleScan(f) }} />
        <Button variant="outline" className="h-10 gap-2" disabled={scanning} onClick={() => importRef.current?.click()}>
          <Upload className="w-4 h-4" /> Importer
        </Button>
        <Button className="h-10 gap-2 shadow-sm" disabled={scanning} onClick={() => cameraRef.current?.click()}>
          {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
          {scanning ? 'Lecture...' : 'Scanner'}
        </Button>
      </div>

      {draft && (
        <Card className="border-2 border-primary/30">
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-primary">
              <FileText className="w-4 h-4" /> Vérifiez le {supplierDocTypeLabels[docType].toLowerCase()}, puis enregistrez
            </div>

            <div className="grid md:grid-cols-[1fr_200px] gap-4">
              <div className="space-y-3">
                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="Fournisseur"><Input value={draft.supplier} onChange={e => setField('supplier', e.target.value)} placeholder="Ex : Samsé, Point P" /></Field>
                  <Field label="N° du document"><Input value={draft.doc_number} onChange={e => setField('doc_number', e.target.value)} placeholder="N° devis / BL / facture" /></Field>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="Date"><Input type="date" value={draft.doc_date} onChange={e => setField('doc_date', e.target.value)} /></Field>
                  <Field label="Chantier">
                    <select value={draft.project_id} onChange={e => setField('project_id', e.target.value)} className={selectClass}>
                      <option value="">— Aucun —</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                    </select>
                  </Field>
                </div>
                {docType === 'devis' && (
                  <Field label="Consultation (regrouper les devis concurrents)">
                    <Input value={draft.consultation_label} onChange={e => setField('consultation_label', e.target.value)} placeholder="Ex : Placo + isolation étage" />
                  </Field>
                )}
                {showPrices && (
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="Total HT (€)"><Input type="number" step="0.01" value={draft.total_ht} onChange={e => setField('total_ht', e.target.value)} /></Field>
                    <Field label="Total TTC (€)"><Input type="number" step="0.01" value={draft.total_ttc} onChange={e => setField('total_ttc', e.target.value)} /></Field>
                    <Field label="TVA (€)"><Input type="number" step="0.01" value={draft.vat_amount} onChange={e => setField('vat_amount', e.target.value)} /></Field>
                  </div>
                )}
              </div>
              {draft.signedUrl && (
                <a href={draft.signedUrl} target="_blank" rel="noopener noreferrer"
                  className="block rounded-lg border border-gray-200 overflow-hidden bg-gray-50 hover:border-primary transition-colors self-start">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={draft.signedUrl} alt="Document" className="w-full h-[200px] object-contain" />
                </a>
              )}
            </div>

            {/* Lignes de matériaux */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-gray-500">Lignes ({draft.lines.length})</Label>
                <Button variant="ghost" size="sm" onClick={addLine}><Plus className="w-4 h-4 mr-1" /> Ligne</Button>
              </div>
              <div className="space-y-1.5">
                {draft.lines.map((l, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-1.5 rounded-lg border border-gray-100 p-2">
                    <Input value={l.designation} onChange={e => setLine(i, 'designation', e.target.value)} placeholder="Désignation" className="h-8 text-xs flex-1 min-w-[160px]" />
                    <Input value={l.quantity} onChange={e => setLine(i, 'quantity', e.target.value)} placeholder="Qté" inputMode="decimal" className="h-8 text-xs w-[64px]" />
                    <Input value={l.unit} onChange={e => setLine(i, 'unit', e.target.value)} placeholder="Unité" className="h-8 text-xs w-[70px]" />
                    {showPrices && <Input value={l.unit_price_ht} onChange={e => setLine(i, 'unit_price_ht', e.target.value)} placeholder="PU HT" inputMode="decimal" className="h-8 text-xs w-[80px]" />}
                    <button onClick={() => removeLine(i)} title="Supprimer la ligne"
                      className="grid place-items-center w-8 h-8 rounded-md text-gray-400 hover:text-red-500 hover:bg-gray-50 flex-shrink-0"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="destructive-outline" onClick={() => setDraft(null)} disabled={saving}>Annuler</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? 'Enregistrement...' : 'Enregistrer'}</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs text-gray-500">{label}</Label>{children}</div>
}
