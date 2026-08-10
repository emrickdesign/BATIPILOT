'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import DottedCard from '@/components/charts/DottedCard'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import {
  ShoppingCart, FileText, Truck, ReceiptText, ScanLine, Loader2,
  TrendingUp, TrendingDown, AlertTriangle, ArrowRight, Mail, ChevronRight,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import AchatsScanner from '@/components/achats/AchatsScanner'

export type AchatLine = {
  id: string; designation: string; quantity: number | null; unit: string | null
  unit_price_ht: number | null; total_ht: number | null; quality: string | null; sort_order: number
}
export type AchatDoc = {
  id: string; doc_type: 'devis' | 'bl' | 'facture'; supplier: string | null; doc_number: string | null
  doc_date: string | null; total_ht: number | null; total_ttc: number | null; is_selected: boolean
  consultation_label: string | null; storage_path: string | null; source: string; created_at: string
  lines: AchatLine[]
}

type StepConf = { docType: 'devis' | 'bl' | 'facture'; n: number; title: string; scanLabel: string; empty: string; color: string; icon: typeof FileText }
const STEPS: StepConf[] = [
  { docType: 'devis', n: 1, title: 'Devis fournisseurs', scanLabel: 'Scanner un devis', empty: 'Scannez le(s) devis reçu(s) (Point P, Samsé…).', color: '#2F6BE8', icon: FileText },
  { docType: 'bl', n: 2, title: 'Bons de livraison', scanLabel: 'Scanner un BL', empty: 'Scannez les BL au fil des livraisons.', color: '#B5811E', icon: Truck },
  { docType: 'facture', n: 3, title: 'Factures fin de mois', scanLabel: 'Scanner une facture', empty: 'Scannez la facture de fin de mois.', color: '#8A3FA0', icon: ReceiptText },
]

export default function AchatsSection({
  projectId, projectTitle, docs,
}: { projectId: string; projectTitle: string; docs: AchatDoc[] }) {
  const byType = (t: string) => docs.filter(d => d.doc_type === t)
  const devis = byType('devis'), bls = byType('bl'), factures = byType('facture')
  const countOf = (t: string) => (t === 'devis' ? devis : t === 'bl' ? bls : factures)

  return (
    <DottedCard>
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-[17px] font-bold font-heading text-marine flex items-center gap-2">
          <span className="grid place-items-center w-7 h-7 rounded-lg bg-[#C14E33]/12 text-[#C14E33]"><ShoppingCart className="w-4 h-4" /></span> Achats &amp; fournisseurs
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {/* Pipeline : Devis → BL → Facture → Rapprochement */}
        <div className="grid gap-3 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <div key={s.docType} className="relative">
              <Step conf={s} docs={countOf(s.docType)} projectId={projectId} projectTitle={projectTitle} />
              {i < STEPS.length && (
                <span className="hidden lg:grid place-items-center absolute top-1/2 -right-[11px] -translate-y-1/2 w-5 h-5 rounded-full bg-white border border-[#EBD9CE] text-gray-400 z-10">
                  <ChevronRight className="w-3.5 h-3.5" />
                </span>
              )}
            </div>
          ))}
          <RapprochementStep projectId={projectId} devisCount={devis.length} factureCount={factures.length}
            supplier={factures[0]?.supplier || devis[0]?.supplier || null} />
        </div>
      </CardContent>
    </DottedCard>
  )
}

/* ── Étapes 1-3 : liste + scan inline (pop-up) ── */
function Step({ conf, docs, projectId, projectTitle }: { conf: StepConf; docs: AchatDoc[]; projectId: string; projectTitle: string }) {
  const [open, setOpen] = useState(false)
  const Icon = conf.icon
  return (
    <div className="rounded-xl border border-[#EBD9CE] bg-white/60 p-3 flex flex-col h-full">
      <div className="flex items-center gap-2 mb-2">
        <span className="grid place-items-center w-6 h-6 rounded-full text-white text-[11px] font-bold flex-shrink-0" style={{ backgroundColor: conf.color }}>{conf.n}</span>
        <h4 className="text-[13px] font-bold text-marine flex items-center gap-1.5 min-w-0"><Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: conf.color }} /><span className="truncate">{conf.title}</span></h4>
      </div>
      <div className="flex-1 space-y-1.5 min-h-[72px]">
        {docs.length === 0 ? (
          <p className="text-[11px] text-gray-400">{conf.empty}</p>
        ) : docs.map(d => (
          <div key={d.id} className="rounded-lg bg-white border border-gray-100 px-2 py-1.5">
            <div className="flex items-center justify-between gap-1">
              <span className="text-xs font-medium text-marine truncate">{d.supplier || 'Fournisseur'}</span>
              <span className="text-xs font-semibold text-gray-700 tabular-nums flex-shrink-0">{d.total_ttc != null ? formatCurrency(d.total_ttc) : d.total_ht != null ? formatCurrency(d.total_ht) : '—'}</span>
            </div>
            <div className="text-[10px] text-gray-400 truncate">{d.doc_number || '—'}{d.doc_date ? ` · ${formatDate(d.doc_date)}` : ''}</div>
          </div>
        ))}
      </div>
      <button onClick={() => setOpen(true)}
        className="mt-2 inline-flex items-center justify-center gap-1.5 h-8 rounded-full text-white text-[12px] font-semibold transition-opacity hover:opacity-90"
        style={{ backgroundColor: conf.color }}>
        <ScanLine className="w-3.5 h-3.5" /> {conf.scanLabel}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg sm:max-w-lg max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Icon className="w-5 h-5" style={{ color: conf.color }} /> {conf.title}</DialogTitle></DialogHeader>
          <AchatsScanner docType={conf.docType} projects={[{ id: projectId, title: projectTitle }]} preselectProject={projectId} onSaved={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ── Étape 4 : rapprochement + contacter le fournisseur ── */
type RappRow = {
  designation: string; devis_pu: number | null; facture_pu: number | null; livre_qty: number | null
  facture_qty: number | null; ecart_montant: number | null; flag: string
}
type RappResult = { rows: RappRow[]; summary: { total_surcout: number; total_economie: number; anomalies: number } }

const flagMeta: Record<string, { label: string; cls: string }> = {
  ok: { label: 'OK', cls: 'text-emerald-600' },
  surfacture: { label: 'Surfacturé', cls: 'text-rose-600' },
  sous_facture: { label: 'Sous-facturé', cls: 'text-sky-600' },
  facture_non_devise: { label: 'Hors devis', cls: 'text-amber-600' },
  non_facture: { label: 'Non facturé', cls: 'text-gray-400' },
  ecart_quantite: { label: 'Écart quantité', cls: 'text-amber-600' },
}

function RapprochementStep({ projectId, devisCount, factureCount, supplier }: {
  projectId: string; devisCount: number; factureCount: number; supplier: string | null
}) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<RappResult | null>(null)
  const [open, setOpen] = useState(false)
  const canRun = devisCount > 0 && factureCount > 0

  async function run() {
    setLoading(true); setOpen(true)
    try {
      const res = await fetch('/api/achats/rapprochement', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_id: projectId }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Rapprochement impossible'); setLoading(false); return }
      setResult(json)
    } catch { toast.error('Erreur réseau') } finally { setLoading(false) }
  }

  function contactSupplier() {
    if (!result) return
    const flagged = result.rows.filter(r => r.flag === 'surfacture' || r.flag === 'facture_non_devise')
    const lignes = flagged.map(r => `- ${r.designation} : devisé ${r.devis_pu != null ? formatCurrency(r.devis_pu) : '—'} → facturé ${r.facture_pu != null ? formatCurrency(r.facture_pu) : '—'}`).join('\n')
    const subject = `Écart facture / devis${supplier ? ` — ${supplier}` : ''}`
    const body = `Bonjour,\n\nEn rapprochant votre facture avec le devis initial, je constate un écart de ${formatCurrency(result.summary.total_surcout)} en votre faveur.\n\n${lignes ? `Lignes concernées :\n${lignes}\n\n` : ''}Merci de vérifier et de me transmettre un avoir ou une facture corrigée.\n\nCordialement,`
    window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank')
  }

  return (
    <div className="rounded-xl border border-[#EBD9CE] bg-white/60 p-3 flex flex-col h-full">
      <div className="flex items-center gap-2 mb-2">
        <span className="grid place-items-center w-6 h-6 rounded-full bg-[#3F7A2E] text-white text-[11px] font-bold flex-shrink-0">4</span>
        <h4 className="text-[13px] font-bold text-marine flex items-center gap-1.5"><ScanLine className="w-3.5 h-3.5 text-[#3F7A2E]" /> Rapprochement</h4>
      </div>
      <div className="flex-1 min-h-[72px] text-[11px] text-gray-400">
        {!canRun ? 'Ajoutez au moins un devis et une facture pour comparer.' : 'Comparez devis ↔ BL ↔ facture et repérez les écarts.'}
        {result && (
          <div className="mt-2 space-y-1 text-marine">
            <div className="flex items-center gap-1.5"><AlertTriangle className={`w-3.5 h-3.5 ${result.summary.anomalies > 0 ? 'text-rose-500' : 'text-emerald-500'}`} /> <span className="font-semibold">{result.summary.anomalies}</span> écart(s)</div>
            {result.summary.total_surcout > 0 && <div className="text-rose-600 font-semibold">Surcoût : {formatCurrency(result.summary.total_surcout)}</div>}
          </div>
        )}
      </div>
      <button onClick={run} disabled={!canRun || loading}
        className="mt-2 inline-flex items-center justify-center gap-1.5 h-8 rounded-full bg-[#3F7A2E] text-white text-[12px] font-semibold hover:opacity-90 transition-opacity disabled:opacity-40">
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />} Rapprocher
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl sm:max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><ScanLine className="w-5 h-5 text-[#3F7A2E]" /> Rapprochement Devis ↔ BL ↔ Facture</DialogTitle></DialogHeader>
          {loading ? (
            <div className="py-10 text-center text-sm text-gray-400"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" /> Analyse en cours…</div>
          ) : result ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-3">
                <Stat label="Surcoût détecté" value={formatCurrency(result.summary.total_surcout)} tone={result.summary.total_surcout > 0 ? 'rose' : 'gray'} icon={<TrendingUp className="w-4 h-4" />} />
                {result.summary.total_economie < 0 && <Stat label="À votre avantage" value={formatCurrency(Math.abs(result.summary.total_economie))} tone="emerald" icon={<TrendingDown className="w-4 h-4" />} />}
                <Stat label="Écarts" value={String(result.summary.anomalies)} tone={result.summary.anomalies > 0 ? 'amber' : 'emerald'} icon={<AlertTriangle className="w-4 h-4" />} />
              </div>

              {result.summary.total_surcout > 0 && (
                <div className="rounded-lg bg-rose-50 border border-rose-100 p-2.5 text-sm text-rose-700 flex items-center justify-between gap-2 flex-wrap">
                  <span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 flex-shrink-0" /> Le fournisseur a facturé <strong>{formatCurrency(result.summary.total_surcout)}</strong> de plus que le devis.</span>
                  <Button size="sm" className="gap-1.5 flex-shrink-0" onClick={contactSupplier}><Mail className="w-4 h-4" /> Contacter le fournisseur</Button>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="text-left text-xs text-gray-400">
                      <th className="py-1.5 pr-3 font-medium">Matériau</th>
                      <th className="py-1.5 px-2 font-medium text-right">PU devis</th>
                      <th className="py-1.5 px-2 font-medium text-right">PU facturé</th>
                      <th className="py-1.5 px-2 font-medium text-right">Écart</th>
                      <th className="py-1.5 pl-2 font-medium">État</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((r, i) => {
                      const m = flagMeta[r.flag] || flagMeta.ok
                      return (
                        <tr key={i} className={`border-t border-gray-100 ${r.flag === 'surfacture' ? 'bg-rose-50/40' : ''}`}>
                          <td className="py-1.5 pr-3 text-gray-700">{r.designation}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums text-gray-600">{r.devis_pu != null ? formatCurrency(r.devis_pu) : '—'}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums text-gray-600">{r.facture_pu != null ? formatCurrency(r.facture_pu) : '—'}</td>
                          <td className={`py-1.5 px-2 text-right tabular-nums font-medium ${r.ecart_montant && r.ecart_montant > 0 ? 'text-rose-600' : r.ecart_montant && r.ecart_montant < 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                            {r.ecart_montant != null && r.ecart_montant !== 0 ? `${r.ecart_montant > 0 ? '+' : ''}${formatCurrency(r.ecart_montant)}` : '—'}
                          </td>
                          <td className={`py-1.5 pl-2 text-xs font-medium ${m.cls}`}>{m.label}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-gray-400">Analyse assistée par IA à partir des documents scannés — vérifiez les lignes signalées avant toute réclamation.</p>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-gray-400">Aucun résultat.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Stat({ label, value, tone, icon }: { label: string; value: string; tone: 'rose' | 'emerald' | 'amber' | 'gray'; icon: React.ReactNode }) {
  const cls = tone === 'rose' ? 'bg-rose-50 text-rose-600' : tone === 'emerald' ? 'bg-emerald-50 text-emerald-600' : tone === 'amber' ? 'bg-amber-50 text-amber-600' : 'bg-gray-50 text-gray-500'
  return (
    <div className="flex items-center gap-2 rounded-lg px-3 py-2 border border-gray-100">
      <span className={`grid place-items-center w-7 h-7 rounded-md ${cls}`}>{icon}</span>
      <span><span className="block text-sm font-semibold text-gray-800 tabular-nums">{value}</span><span className="block text-[11px] text-gray-400">{label}</span></span>
    </div>
  )
}
