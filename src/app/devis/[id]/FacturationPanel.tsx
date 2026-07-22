'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils'
import { FileText, Loader2 } from 'lucide-react'

type Mode = 'complete' | 'acompte' | 'situation' | 'solde'

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: 'complete', label: 'Facture complète', hint: '100 % du marché en une fois' },
  { id: 'acompte', label: 'Acompte', hint: 'un pourcentage à la commande' },
  { id: 'situation', label: 'Situation (avancement)', hint: 'facturer selon l’avancement cumulé' },
  { id: 'solde', label: 'Solde', hint: 'le reste à facturer' },
]

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100

export default function FacturationPanel({ quoteId, marketHt, marketTtc }: { quoteId: string; marketHt: number; marketTtc: number }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('complete')
  const [percent, setPercent] = useState('30')
  const [retention, setRetention] = useState('0')
  const [previousPct, setPreviousPct] = useState(0)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    const supabase = createClient()
    supabase.from('invoices').select('billed_percent, type, status').eq('quote_id', quoteId).neq('status', 'annulee')
      .then(({ data }) => {
        const p = (data || []).reduce((s, inv: { billed_percent: number | null; type: string }) =>
          s + (inv.billed_percent != null ? Number(inv.billed_percent) : inv.type === 'complete' ? 100 : 0), 0)
        setPreviousPct(r2(p))
        if (p > 0 && mode === 'complete') setMode('situation')
      })
  }, [open, quoteId]) // eslint-disable-line react-hooks/exhaustive-deps

  const preview = useMemo(() => {
    let delta: number
    if (mode === 'acompte') delta = Number(percent) || 0
    else if (mode === 'situation') delta = (Number(percent) || 0) - previousPct
    else if (mode === 'solde') delta = 100 - previousPct
    else delta = 100 - previousPct
    delta = r2(delta)
    const ttc = r2(marketTtc * delta / 100)
    const ret = r2(ttc * (Number(retention) || 0) / 100)
    return { delta, ht: r2(marketHt * delta / 100), ttc, retention: ret, net: r2(ttc - ret), cumul: r2(previousPct + delta) }
  }, [mode, percent, retention, previousPct, marketHt, marketTtc])

  async function create() {
    if (preview.delta <= 0) { toast.error(`Rien à facturer (déjà facturé : ${previousPct} %)`); return }
    setSaving(true)
    const res = await fetch(`/api/devis/${quoteId}/facturer`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, percent: Number(percent) || 0, retentionPct: Number(retention) || 0 }),
    })
    const data = await res.json()
    if (res.ok && data.invoiceId) { toast.success('Facture créée !'); router.push(`/factures/${data.invoiceId}`) }
    else { toast.error(data.error || 'Erreur création facture'); setSaving(false) }
  }

  if (!open) {
    return (
      <Button className="gap-2 bg-purple-600 hover:bg-purple-700" onClick={() => setOpen(true)}>
        <FileText className="w-4 h-4" /> Créer la facture
      </Button>
    )
  }

  return (
    <div className="w-full rounded-xl border border-purple-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-gray-900">Facturer le devis</p>
        {previousPct > 0 && <span className="text-xs font-medium text-purple-700">Déjà facturé : {previousPct} % du marché</span>}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {MODES.map(m => (
          <button key={m.id} onClick={() => setMode(m.id)}
            className={`text-left rounded-lg border p-2.5 transition-colors ${mode === m.id ? 'border-purple-400 bg-purple-50' : 'border-gray-200 hover:border-gray-300'}`}>
            <p className="text-sm font-medium text-gray-900">{m.label}</p>
            <p className="text-[11px] text-gray-500">{m.hint}</p>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        {(mode === 'acompte' || mode === 'situation') && (
          <div>
            <Label className="text-xs text-gray-500">{mode === 'acompte' ? 'Acompte (% du marché)' : 'Avancement cumulé (%)'}</Label>
            <Input type="number" value={percent} onChange={e => setPercent(e.target.value)} className="h-9 w-32" min="0" max="100" step="1" />
          </div>
        )}
        <div>
          <Label className="text-xs text-gray-500">Retenue de garantie (%)</Label>
          <Input type="number" value={retention} onChange={e => setRetention(e.target.value)} className="h-9 w-32" min="0" max="10" step="0.5" />
        </div>
      </div>

      <div className="rounded-lg bg-gray-50 p-3 text-sm space-y-1">
        <div className="flex justify-between"><span className="text-gray-500">Part facturée</span><span className="font-medium">{preview.delta} % {mode === 'situation' && `(cumul ${preview.cumul} %)`}</span></div>
        <div className="flex justify-between"><span className="text-gray-500">Montant HT</span><span>{formatCurrency(preview.ht)}</span></div>
        <div className="flex justify-between"><span className="text-gray-500">Total TTC</span><span>{formatCurrency(preview.ttc)}</span></div>
        {preview.retention > 0 && (
          <div className="flex justify-between text-orange-600"><span>Retenue de garantie</span><span>− {formatCurrency(preview.retention)}</span></div>
        )}
        <div className="flex justify-between text-base font-bold border-t pt-1 mt-1"><span>Net à payer</span><span>{formatCurrency(preview.net)}</span></div>
      </div>

      <div className="flex gap-2">
        <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Annuler</Button>
        <Button className="gap-2 bg-purple-600 hover:bg-purple-700 flex-1" onClick={create} disabled={saving || preview.delta <= 0}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} Créer la facture
        </Button>
      </div>
    </div>
  )
}
