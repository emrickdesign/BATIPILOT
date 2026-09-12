'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
// Les API Web Speech (SpeechRecognition) ne sont pas typées dans la lib DOM → `any` assumé.

/**
 * Éditeur de devis/facture INLINE dans l'assistant : on ajoute / supprime / modifie
 * les lignes à la main, ou on dicte/écrit une consigne pour que l'IA les modifie.
 * Puis on enregistre (et on envoie) sans quitter l'assistant.
 */
import { useCallback, useRef, useState } from 'react'
import {
  Plus, Trash2, Loader2, Sparkles, Mic, MicOff, Check, FileText, ReceiptText, Send, ExternalLink, Wand2,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { draftTotals, lineTotalHT, UNITS, type DevisDraft, type DraftLine, type Unit } from '@/lib/assistant/devis-shared'

const UNIT_LABELS: Record<Unit, string> = { m2: 'm²', ml: 'ml', u: 'u', forfait: 'forfait', h: 'h', j: 'j', piece: 'pièce' }
const getSR = () => (typeof window === 'undefined' ? null : (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null)

export default function DevisComposer({
  draft, setDraft, onSaved, onOpenFull,
}: {
  draft: DevisDraft
  setDraft: (d: DevisDraft) => void
  onSaved: (info: { href: string; number: string; sent: boolean; sendError?: string }) => void
  onOpenFull: (href: string) => void
}) {
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [saving, setSaving] = useState<false | 'save' | 'send'>(false)
  const [err, setErr] = useState<string | null>(null)
  const [dictating, setDictating] = useState(false)
  const dictRef = useRef<any>(null)
  const dictBaseRef = useRef('')

  const totals = draftTotals(draft.lines)
  const isFacture = draft.kind === 'facture'

  const patchLine = (i: number, patch: Partial<DraftLine>) =>
    setDraft({ ...draft, lines: draft.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) })
  const removeLine = (i: number) => setDraft({ ...draft, lines: draft.lines.filter((_, j) => j !== i) })
  const addLine = () => setDraft({
    ...draft,
    lines: [...draft.lines, { designation: '', description: '', category: '', quantity: 1, unit: 'u', unit_price_ht: 0, vat_rate: 10, discount_percent: 0 }],
  })

  // ─── Dictée de la consigne IA ───
  const toggleDictation = useCallback(() => {
    if (dictating) { try { dictRef.current?.stop() } catch {}; return }
    const SR = getSR()
    if (!SR) return
    const rec = new SR()
    rec.lang = 'fr-FR'; rec.interimResults = true; rec.continuous = true
    dictBaseRef.current = aiPrompt ? aiPrompt.replace(/\s+$/, '') + ' ' : ''
    let finalAcc = ''
    rec.onresult = (e: any) => {
      let itm = '', fin = ''
      for (let i = e.resultIndex; i < e.results.length; i++) { const r = e.results[i]; if (r.isFinal) fin += r[0].transcript; else itm += r[0].transcript }
      if (fin) finalAcc += fin
      setAiPrompt((dictBaseRef.current + finalAcc + itm).replace(/\s+/g, ' ').trimStart())
    }
    rec.onerror = () => setDictating(false)
    rec.onend = () => { setDictating(false); dictRef.current = null }
    dictRef.current = rec; setDictating(true)
    try { rec.start() } catch { setDictating(false) }
  }, [dictating, aiPrompt])

  // ─── L'IA modifie les lignes ───
  const askAi = useCallback(async () => {
    const instruction = aiPrompt.trim()
    if (instruction.length < 4 || aiLoading) return
    try { dictRef.current?.stop() } catch {}
    setAiLoading(true); setErr(null)
    try {
      const res = await fetch('/api/assistant/devis/compose', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: draft.kind, clientId: draft.clientId, instruction, lines: draft.lines }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Modification impossible')
      setDraft({ ...draft, title: data.title || draft.title, lines: Array.isArray(data.lines) ? data.lines : draft.lines })
      setAiPrompt('')
    } catch (e) { setErr((e as Error)?.message || 'Erreur') } finally { setAiLoading(false) }
  }, [aiPrompt, aiLoading, draft, setDraft])

  // ─── Enregistrer (et envoyer) ───
  const save = useCallback(async (send: boolean) => {
    if (!draft.lines.some(l => l.designation.trim())) { setErr('Ajoute au moins une prestation.'); return }
    setSaving(send ? 'send' : 'save'); setErr(null)
    try {
      const res = await fetch('/api/assistant/devis/save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: draft.kind, clientId: draft.clientId, title: draft.title, lines: draft.lines, send }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Enregistrement impossible')
      onSaved({ href: data.href, number: data.number, sent: !!data.sent, sendError: data.sendError })
    } catch (e) { setErr((e as Error)?.message || 'Erreur') } finally { setSaving(false) }
  }, [draft, onSaved])

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-black/10 bg-white text-gray-800 shadow-sm">
      {/* En-tête document */}
      <div className="flex items-center gap-2.5 border-b border-black/5 bg-[#FDF3EF] px-4 py-3">
        <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-[#E0674C] text-white">
          {isFacture ? <ReceiptText className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[#E0674C]">{isFacture ? 'Facture' : 'Devis'} · {draft.clientName}</div>
          <input value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })}
            placeholder="Objet du document…"
            className="w-full bg-transparent text-[15px] font-bold text-marine outline-none placeholder:font-normal placeholder:text-gray-400" />
        </div>
      </div>

      {/* Lignes */}
      <div className="min-h-[132px] flex-1 space-y-2 overflow-y-auto bg-[#FBF8F6] px-3 py-3">
        {draft.lines.map((l, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-2.5 shadow-sm">
            <div className="flex items-start gap-2">
              <input value={l.designation} onChange={e => patchLine(i, { designation: e.target.value })}
                placeholder="Désignation"
                className="min-w-0 flex-1 rounded-lg border border-transparent bg-gray-50 px-2.5 py-1.5 text-sm font-medium text-marine outline-none focus:border-[#E0674C]/50 focus:bg-white" />
              <button onClick={() => removeLine(i)} title="Supprimer la ligne" className="mt-0.5 grid h-7 w-7 flex-none place-items-center rounded-lg text-gray-300 hover:bg-red-50 hover:text-red-500">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 grid grid-cols-[1fr_auto_1fr_auto] items-end gap-1.5">
              <Field label="Qté"><input type="number" min={0} step={0.1} value={l.quantity}
                onChange={e => patchLine(i, { quantity: parseFloat(e.target.value) || 0 })}
                className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm outline-none focus:border-[#E0674C]/60" /></Field>
              <Field label="Unité"><select value={l.unit} onChange={e => patchLine(i, { unit: e.target.value as Unit })}
                className="rounded-md border border-gray-200 bg-white px-1.5 py-1 text-sm outline-none focus:border-[#E0674C]/60">
                {UNITS.map(u => <option key={u} value={u}>{UNIT_LABELS[u]}</option>)}
              </select></Field>
              <Field label="Prix HT"><input type="number" min={0} step={0.01} value={l.unit_price_ht}
                onChange={e => patchLine(i, { unit_price_ht: parseFloat(e.target.value) || 0 })}
                className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm outline-none focus:border-[#E0674C]/60" /></Field>
              <Field label="TVA"><select value={l.vat_rate} onChange={e => patchLine(i, { vat_rate: parseFloat(e.target.value) })}
                className="rounded-md border border-gray-200 bg-white px-1.5 py-1 text-sm outline-none focus:border-[#E0674C]/60">
                <option value={5.5}>5,5%</option><option value={10}>10%</option><option value={20}>20%</option>
              </select></Field>
            </div>
            <div className="mt-1.5 text-right text-[13px] font-semibold text-gray-700">{formatCurrency(lineTotalHT(l))} HT</div>
          </div>
        ))}
        <button onClick={addLine} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white/60 py-2.5 text-sm font-medium text-gray-500 hover:border-[#E0674C]/50 hover:text-[#E0674C]">
          <Plus className="h-4 w-4" /> Ajouter une ligne
        </button>
      </div>

      {/* Consigne IA */}
      <div className="border-t border-black/5 bg-white px-3 py-2.5">
        <div className="flex items-end gap-2">
          <button type="button" onClick={toggleDictation} title={dictating ? 'Arrêter la dictée' : 'Dicter la consigne'}
            className={`grid h-9 w-9 flex-none place-items-center rounded-full ${dictating ? 'bg-[#E0674C] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
            {dictating ? <MicOff className="h-[17px] w-[17px]" /> : <Mic className="h-[17px] w-[17px]" />}
          </button>
          <input value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); askAi() } }}
            placeholder={dictating ? 'Parle : « enlève la peinture, ajoute 20 m² de parquet »' : 'Dis à l’IA quoi changer…'}
            className="min-w-0 flex-1 rounded-full border border-gray-200 bg-gray-50 px-3.5 py-2 text-sm outline-none focus:border-[#E0674C]/60 focus:bg-white" />
          <button onClick={askAi} disabled={aiPrompt.trim().length < 4 || aiLoading}
            className="grid h-9 w-9 flex-none place-items-center rounded-full bg-[#F5A623] text-black transition-opacity disabled:opacity-40" title="Appliquer avec l’IA">
            {aiLoading ? <Loader2 className="h-[17px] w-[17px] animate-spin" /> : <Wand2 className="h-[17px] w-[17px]" />}
          </button>
        </div>
      </div>

      {/* Totaux + actions */}
      <div className="border-t border-black/5 bg-white px-4 py-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Total HT</span><span className="font-medium tabular-nums">{formatCurrency(totals.subtotalHT)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">TVA</span><span className="tabular-nums">{formatCurrency(totals.totalVAT)}</span>
        </div>
        <div className="mt-1 flex items-center justify-between border-t border-gray-100 pt-1.5 font-heading text-base font-extrabold text-marine">
          <span>Total TTC</span><span className="tabular-nums">{formatCurrency(totals.totalTTC)}</span>
        </div>
        {err && <p className="mt-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-[13px] text-red-600">{err}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button onClick={() => save(false)} disabled={!!saving}
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[#E0674C] px-4 text-sm font-semibold text-white hover:bg-[#c9563d] disabled:opacity-60">
            {saving === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Enregistrer
          </button>
          <button onClick={() => save(true)} disabled={!!saving}
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[#2B2B2E] px-4 text-sm font-semibold text-white hover:bg-black disabled:opacity-60">
            {saving === 'send' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enregistrer &amp; envoyer
          </button>
          <button onClick={() => onOpenFull(draft.kind === 'facture' ? `/factures/nouveau?client=${draft.clientId}` : `/devis/nouveau?client=${draft.clientId}`)}
            className="inline-flex h-10 items-center gap-1.5 rounded-full border border-gray-200 px-3.5 text-sm text-gray-600 hover:bg-gray-50" title="Ouvrir l’éditeur complet">
            <ExternalLink className="h-4 w-4" /> Éditeur
          </button>
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-gray-400"><Sparkles className="h-3 w-3" /> Lignes chiffrées par l’IA — vérifie les prix avant d’envoyer.</p>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">{label}</span>
      {children}
    </label>
  )
}
