'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  ShoppingCart, FileText, Truck, ReceiptText, Check, Star, Loader2, ScanLine,
  TrendingUp, TrendingDown, AlertTriangle, Award,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { matchKey } from '@/lib/achats'

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

const num = (v: number | null) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const sourceLabel: Record<string, string> = { admin: 'Bureau', terrain: 'Terrain', email: 'Email' }

export default function AchatsSection({
  projectId, docs,
}: { projectId: string; docs: AchatDoc[] }) {
  const router = useRouter()
  const devis = docs.filter(d => d.doc_type === 'devis')
  const bls = docs.filter(d => d.doc_type === 'bl')
  const factures = docs.filter(d => d.doc_type === 'facture')
  const selected = devis.find(d => d.is_selected) || null

  const [busy, setBusy] = useState(false)

  async function chooseReference(docId: string) {
    setBusy(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setBusy(false); return }
    // Un seul devis de référence par chantier.
    await supabase.from('supplier_documents').update({ is_selected: false })
      .eq('user_id', user.id).eq('project_id', projectId).eq('doc_type', 'devis')
    const { error } = await supabase.from('supplier_documents').update({ is_selected: true }).eq('id', docId).eq('user_id', user.id)
    setBusy(false)
    if (error) { toast.error('Impossible de choisir ce devis'); return }
    toast.success('Devis de référence choisi')
    router.refresh()
  }

  const scanLink = (type: string) => `/tickets?project=${projectId}&type=${type}`

  return (
    <Card className="border-0 shadow-[var(--shadow-sm)]">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 pt-4 px-4">
        <CardTitle className="text-base flex items-center gap-2">
          <ShoppingCart className="w-4 h-4 text-gray-400" /> Achats &amp; fournisseurs
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-6">

        {/* ── BLOC 1 : Consultation / comparatif des devis fournisseurs ── */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5"><FileText className="w-4 h-4 text-sky-500" /> Consultation — devis fournisseurs ({devis.length})</h3>
            <Link href={scanLink('devis')}><Button variant="outline" size="sm"><ScanLine className="w-4 h-4 mr-1" /> Scanner un devis</Button></Link>
          </div>

          {devis.length === 0 ? (
            <p className="text-sm text-gray-400 py-1">Aucun devis fournisseur. Scanne les devis reçus (Samsé, Point P…) pour les comparer et choisir le moins cher.</p>
          ) : (
            <>
              <DevisComparison devis={devis} selectedId={selected?.id ?? null} busy={busy} onChoose={chooseReference} />
              {!selected && <p className="text-xs text-amber-600 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Choisis le devis retenu : il devient la référence de prix pour le rapprochement de fin de mois.</p>}
            </>
          )}
        </section>

        <div className="border-t border-gray-100" />

        {/* ── BLOC 2 : Suivi & contrôle (BL + facture + rapprochement) ── */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5"><Award className="w-4 h-4 text-violet-500" /> Suivi &amp; contrôle de fin de mois</h3>

          <div className="grid sm:grid-cols-2 gap-3">
            {/* Bons de livraison */}
            <div className="rounded-lg border border-gray-100 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700 flex items-center gap-1.5"><Truck className="w-4 h-4 text-amber-500" /> Bons de livraison ({bls.length})</span>
                <Link href={scanLink('bl')}><Button variant="ghost" size="sm">+ BL</Button></Link>
              </div>
              {bls.length === 0 ? (
                <p className="text-xs text-gray-400">Aucun BL. Scannés au fil du mois (terrain, bureau ou email).</p>
              ) : (
                <div className="space-y-1.5">
                  {bls.map(b => (
                    <div key={b.id} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700 truncate">{b.supplier || 'Fournisseur'} {b.doc_number && <span className="text-gray-400">· {b.doc_number}</span>}</span>
                      <span className="flex items-center gap-1.5 flex-shrink-0">
                        {b.doc_date && <span className="text-xs text-gray-400">{formatDate(b.doc_date)}</span>}
                        <Badge variant="outline" className="text-[10px]">{sourceLabel[b.source] || b.source}</Badge>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Factures fournisseurs */}
            <div className="rounded-lg border border-gray-100 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700 flex items-center gap-1.5"><ReceiptText className="w-4 h-4 text-violet-500" /> Factures fournisseurs ({factures.length})</span>
                <Link href={scanLink('facture')}><Button variant="ghost" size="sm">+ Facture</Button></Link>
              </div>
              {factures.length === 0 ? (
                <p className="text-xs text-gray-400">Aucune facture. Scanne la facture de fin de mois pour la comparer au devis.</p>
              ) : (
                <div className="space-y-1.5">
                  {factures.map(f => (
                    <div key={f.id} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700 truncate">{f.supplier || 'Fournisseur'} {f.doc_number && <span className="text-gray-400">· {f.doc_number}</span>}</span>
                      <span className="font-semibold text-gray-800 flex-shrink-0">{f.total_ttc != null ? formatCurrency(f.total_ttc) : f.total_ht != null ? formatCurrency(f.total_ht) : '—'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <Rapprochement projectId={projectId} canRun={!!selected && factures.length > 0} hasSelected={!!selected} hasFactures={factures.length > 0} />
        </section>
      </CardContent>
    </Card>
  )
}

/* ── Comparatif des devis : grille prix unitaire par fournisseur, moins cher surligné ── */
function DevisComparison({ devis, selectedId, busy, onChoose }: {
  devis: AchatDoc[]; selectedId: string | null; busy: boolean; onChoose: (id: string) => void
}) {
  const cheapestTotalId = useMemo(() => {
    const withTotal = devis.filter(d => num(d.total_ht) !== null)
    if (!withTotal.length) return null
    return withTotal.reduce((a, b) => (num(a.total_ht)! <= num(b.total_ht)! ? a : b)).id
  }, [devis])

  // Lignes agrégées : une par matériau (matchKey), colonne = fournisseur.
  const grid = useMemo(() => {
    const map = new Map<string, { label: string; prices: Map<string, { pu: number | null; quality: string | null }> }>()
    for (const d of devis) {
      for (const l of d.lines) {
        const k = matchKey(l.designation)
        if (!k) continue
        if (!map.has(k)) map.set(k, { label: l.designation, prices: new Map() })
        const row = map.get(k)!
        if (!row.prices.has(d.id)) row.prices.set(d.id, { pu: num(l.unit_price_ht), quality: l.quality })
      }
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, 'fr'))
  }, [devis])

  return (
    <div className="space-y-2">
      {/* En-têtes fournisseurs + totaux */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-xs text-gray-400">
              <th className="py-1.5 pr-3 font-medium">Matériau</th>
              {devis.map(d => (
                <th key={d.id} className="py-1.5 px-2 font-medium whitespace-nowrap">
                  <div className="flex items-center gap-1">
                    {d.supplier || 'Fournisseur'}
                    {d.id === selectedId && <Star className="w-3 h-3 fill-amber-400 text-amber-400" />}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map((row, i) => {
              const vals = devis.map(d => row.prices.get(d.id)?.pu ?? null)
              const min = Math.min(...vals.filter((v): v is number => v !== null))
              return (
                <tr key={i} className="border-t border-gray-100">
                  <td className="py-1.5 pr-3 text-gray-700">{row.label}</td>
                  {devis.map(d => {
                    const cell = row.prices.get(d.id)
                    const isMin = cell?.pu != null && cell.pu === min && vals.filter(v => v !== null).length > 1
                    return (
                      <td key={d.id} className={`py-1.5 px-2 tabular-nums ${isMin ? 'text-emerald-600 font-semibold' : 'text-gray-600'}`}>
                        {cell?.pu != null ? formatCurrency(cell.pu) : <span className="text-gray-300">—</span>}
                        {cell?.quality && <span className="block text-[10px] text-gray-400 font-normal">{cell.quality}</span>}
                        {isMin && <Check className="inline w-3 h-3 ml-0.5" />}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
            {/* Ligne total */}
            <tr className="border-t-2 border-gray-200 font-semibold">
              <td className="py-1.5 pr-3 text-gray-700">Total HT</td>
              {devis.map(d => (
                <td key={d.id} className={`py-1.5 px-2 tabular-nums ${d.id === cheapestTotalId ? 'text-emerald-600' : 'text-gray-700'}`}>
                  {d.total_ht != null ? formatCurrency(d.total_ht) : '—'}
                  {d.id === cheapestTotalId && <span className="block text-[10px] font-normal text-emerald-500">le moins cher</span>}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Choix de la référence */}
      <div className="flex flex-wrap gap-2 pt-1">
        {devis.map(d => (
          <Button key={d.id} size="sm" variant={d.id === selectedId ? 'default' : 'outline'} disabled={busy}
            onClick={() => onChoose(d.id)}>
            {d.id === selectedId ? <><Star className="w-3.5 h-3.5 mr-1 fill-white" /> Référence : {d.supplier || 'ce devis'}</> : <>Choisir {d.supplier || 'ce devis'}</>}
          </Button>
        ))}
      </div>
    </div>
  )
}

/* ── Rapprochement 3 points ── */
type RappRow = {
  designation: string; devis_pu: number | null; devis_qty: number | null; livre_qty: number | null
  facture_pu: number | null; facture_qty: number | null; ecart_pu: number | null; ecart_pct: number | null
  ecart_montant: number | null; flag: string
}
type RappResult = { rows: RappRow[]; summary: { total_surcout: number; total_economie: number; anomalies: number }; counts: { bl: number; facture: number } }

const flagMeta: Record<string, { label: string; cls: string }> = {
  ok: { label: 'OK', cls: 'text-emerald-600' },
  surfacture: { label: 'Surfacturé', cls: 'text-rose-600' },
  sous_facture: { label: 'Sous-facturé', cls: 'text-sky-600' },
  facture_non_devise: { label: 'Hors devis', cls: 'text-amber-600' },
  non_facture: { label: 'Non facturé', cls: 'text-gray-400' },
  ecart_quantite: { label: 'Écart quantité', cls: 'text-amber-600' },
}

function Rapprochement({ projectId, canRun, hasSelected, hasFactures }: {
  projectId: string; canRun: boolean; hasSelected: boolean; hasFactures: boolean
}) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<RappResult | null>(null)

  async function run() {
    setLoading(true)
    try {
      const res = await fetch('/api/achats/rapprochement', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Rapprochement impossible'); setLoading(false); return }
      setResult(json)
      if (json.summary.anomalies === 0) toast.success('Rapprochement terminé — aucun écart détecté')
      else toast.warning(`${json.summary.anomalies} écart(s) détecté(s)`)
    } catch { toast.error('Erreur réseau') }
    setLoading(false)
  }

  return (
    <div className="rounded-lg border border-gray-100 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-gray-700 flex items-center gap-1.5"><ScanLine className="w-4 h-4 text-marine" /> Rapprochement Devis ↔ BL ↔ Facture</span>
        <Button size="sm" disabled={!canRun || loading} onClick={run}>
          {loading ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Analyse…</> : 'Lancer le rapprochement'}
        </Button>
      </div>

      {!canRun && (
        <p className="text-xs text-gray-400">
          {!hasSelected && 'Choisis un devis de référence'} {!hasSelected && !hasFactures && ' et '} {!hasFactures && 'ajoute au moins une facture fournisseur'} pour lancer le contrôle.
        </p>
      )}

      {result && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <Stat label="Surcoût détecté" value={formatCurrency(result.summary.total_surcout)} tone={result.summary.total_surcout > 0 ? 'rose' : 'gray'} icon={<TrendingUp className="w-4 h-4" />} />
            {result.summary.total_economie < 0 && <Stat label="À votre avantage" value={formatCurrency(Math.abs(result.summary.total_economie))} tone="emerald" icon={<TrendingDown className="w-4 h-4" />} />}
            <Stat label="Écarts" value={String(result.summary.anomalies)} tone={result.summary.anomalies > 0 ? 'amber' : 'emerald'} icon={<AlertTriangle className="w-4 h-4" />} />
          </div>

          {result.summary.total_surcout > 0 && (
            <div className="rounded-lg bg-rose-50 border border-rose-100 p-2.5 text-sm text-rose-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              Le fournisseur a facturé <strong>{formatCurrency(result.summary.total_surcout)}</strong> de plus que le devis. À réclamer.
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-xs text-gray-400">
                  <th className="py-1.5 pr-3 font-medium">Matériau</th>
                  <th className="py-1.5 px-2 font-medium text-right">PU devis</th>
                  <th className="py-1.5 px-2 font-medium text-right">PU facturé</th>
                  <th className="py-1.5 px-2 font-medium text-right">Livré</th>
                  <th className="py-1.5 px-2 font-medium text-right">Facturé</th>
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
                      <td className="py-1.5 px-2 text-right tabular-nums text-gray-500">{r.livre_qty != null ? r.livre_qty : '—'}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums text-gray-500">{r.facture_qty != null ? r.facture_qty : '—'}</td>
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
          <p className="text-[11px] text-gray-400">Analyse assistée par IA à partir des documents scannés — vérifie les lignes signalées avant toute réclamation.</p>
        </div>
      )}
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
