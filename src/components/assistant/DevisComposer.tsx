'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
// Les API Web Speech (SpeechRecognition) ne sont pas typées dans la lib DOM → `any` assumé.

/**
 * VRAI VISUEL DU DEVIS/FACTURE, éditable en place (pas un formulaire d'appli).
 * On modifie directement sur le document : désignation, quantité, unité, prix, TVA.
 * On peut aussi dicter/écrire une consigne pour que l'IA modifie les lignes, puis
 * enregistrer (et envoyer) sans quitter l'assistant.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Plus, Trash2, Loader2, Mic, MicOff, Check, Send, ExternalLink, Wand2,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { draftTotals, lineTotalHT, UNITS, type DevisDraft, type DraftLine, type Unit } from '@/lib/assistant/devis-shared'

const UNIT_LABELS: Record<Unit, string> = { m2: 'm²', ml: 'ml', u: 'u', forfait: 'forfait', h: 'h', j: 'j', piece: 'pièce' }
const getSR = () => (typeof window === 'undefined' ? null : (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null)
const CELL = 'w-full bg-transparent outline-none rounded px-1 py-1 focus:bg-[#FDF3EF] focus:ring-1 focus:ring-[#E0674C]/40'

type Company = { trade_name?: string; address?: string; phone?: string; siret?: string; legal_mentions?: string }
type ClientRow = { company_name?: string; first_name?: string; last_name?: string; type?: string; phone?: string; email?: string; billing_address?: string; site_address?: string }

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
  const [company, setCompany] = useState<Company | null>(null)
  const [client, setClient] = useState<ClientRow | null>(null)
  const dictRef = useRef<any>(null)
  const dictBaseRef = useRef('')

  const totals = draftTotals(draft.lines)
  const isFacture = draft.kind === 'facture'
  const docLabel = isFacture ? 'FACTURE' : 'DEVIS'

  // En-tête réaliste : coordonnées entreprise + client (lecture directe).
  useEffect(() => {
    let alive = true
    ;(async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      const [{ data: comp }, { data: cli }] = await Promise.all([
        user ? supabase.from('companies').select('trade_name, address, phone, siret, legal_mentions').eq('user_id', user.id).maybeSingle() : Promise.resolve({ data: null }),
        draft.clientId && draft.clientId !== 'demo'
          ? supabase.from('clients').select('company_name, first_name, last_name, type, phone, email, billing_address, site_address').eq('id', draft.clientId).maybeSingle()
          : Promise.resolve({ data: null }),
      ])
      if (!alive) return
      setCompany(comp as Company | null)
      setClient(cli as ClientRow | null)
    })()
    return () => { alive = false }
  }, [draft.clientId])

  const today = new Date()
  const validUntil = new Date(); validUntil.setDate(validUntil.getDate() + 30)
  const dateFr = (d: Date) => d.toLocaleDateString('fr-FR')
  const legalMentions = company?.legal_mentions || 'TVA à taux réduit — Article 279-0 bis du CGI (travaux de rénovation)'

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
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl bg-[#e9e7e2]">
      {/* ─── LA FEUILLE : vrai document devis/facture, éditable en place ─── */}
      <div className="min-h-0 flex-1 overflow-y-auto p-2.5 sm:p-4">
        <div className="mx-auto max-w-[720px] rounded-lg bg-white p-4 text-[#22201b] shadow-[0_2px_16px_rgba(20,10,0,.14)] sm:p-7">
          {/* En-tête : entreprise / n° document / client */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 text-[13px] leading-tight">
              <p className="font-heading text-base font-extrabold text-marine">{company?.trade_name || 'Votre entreprise'}</p>
              {company?.address && <p className="text-gray-500">{company.address}</p>}
              {company?.phone && <p className="text-gray-500">{company.phone}</p>}
              {company?.siret && <p className="text-[11px] text-gray-400">SIRET : {company.siret}</p>}
            </div>
            <div className="flex-none text-right">
              <p className="font-heading text-xl font-extrabold tracking-tight text-[#E0674C]">{docLabel}</p>
              <span className="mt-1 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">Brouillon</span>
            </div>
          </div>

          {/* Client + dates */}
          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-gray-100 pt-4 text-[13px]">
            <div>
              <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{isFacture ? 'Facturé à' : 'Adressé à'}</p>
              <p className="font-semibold text-marine">{draft.clientName}</p>
              {client?.billing_address && <p className="text-gray-500">{client.billing_address}</p>}
              {client?.phone && <p className="text-gray-500">{client.phone}</p>}
              {client?.email && <p className="text-gray-500">{client.email}</p>}
            </div>
            <div className="text-right text-gray-600">
              <p>Date : <span className="font-medium text-marine">{dateFr(today)}</span></p>
              {isFacture
                ? <p>Échéance : <span className="font-medium text-marine">{dateFr(validUntil)}</span></p>
                : <p>Valable jusqu’au : <span className="font-medium text-marine">{dateFr(validUntil)}</span></p>}
              {client?.site_address && <p className="mt-1 text-[12px]">Chantier : <span className="font-medium text-marine">{client.site_address}</span></p>}
            </div>
          </div>

          {/* Objet (éditable) */}
          <div className="mt-3 flex items-center gap-2 text-[13px]">
            <span className="flex-none text-gray-400">Objet :</span>
            <input value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })}
              placeholder="Objet du devis…" className={`${CELL} font-medium text-marine`} />
          </div>

          {/* Tableau des lignes (éditable en place) */}
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[540px] border-collapse text-[13px]">
              <thead>
                <tr className="border-y-2 border-[#22201b]/10 text-[11px] uppercase tracking-wide text-gray-400">
                  <th className="py-1.5 pr-2 text-left font-semibold">Désignation</th>
                  <th className="w-14 px-1 py-1.5 text-right font-semibold">Qté</th>
                  <th className="w-16 px-1 py-1.5 text-center font-semibold">Unité</th>
                  <th className="w-24 px-1 py-1.5 text-right font-semibold">P.U. HT</th>
                  <th className="w-14 px-1 py-1.5 text-center font-semibold">TVA</th>
                  <th className="w-24 px-1 py-1.5 text-right font-semibold">Total HT</th>
                  <th className="w-5" />
                </tr>
              </thead>
              <tbody>
                {draft.lines.map((l, i) => (
                  <tr key={i} className="group border-b border-gray-100 align-top">
                    <td className="py-1.5 pr-2">
                      <input value={l.designation} onChange={e => patchLine(i, { designation: e.target.value })}
                        placeholder="Prestation…" className={`${CELL} font-medium text-marine`} />
                      <input value={l.description || ''} onChange={e => patchLine(i, { description: e.target.value })}
                        placeholder="détail (optionnel)" className={`${CELL} text-[11px] text-gray-400`} />
                    </td>
                    <td className="px-0.5 py-1.5">
                      <input type="number" min={0} step={0.1} value={l.quantity}
                        onChange={e => patchLine(i, { quantity: parseFloat(e.target.value) || 0 })}
                        className={`${CELL} text-right tabular-nums`} />
                    </td>
                    <td className="px-0.5 py-1.5">
                      <select value={l.unit} onChange={e => patchLine(i, { unit: e.target.value as Unit })}
                        className={`${CELL} cursor-pointer text-center`}>
                        {UNITS.map(u => <option key={u} value={u}>{UNIT_LABELS[u]}</option>)}
                      </select>
                    </td>
                    <td className="px-0.5 py-1.5">
                      <input type="number" min={0} step={0.01} value={l.unit_price_ht}
                        onChange={e => patchLine(i, { unit_price_ht: parseFloat(e.target.value) || 0 })}
                        className={`${CELL} text-right tabular-nums`} />
                    </td>
                    <td className="px-0.5 py-1.5">
                      <select value={l.vat_rate} onChange={e => patchLine(i, { vat_rate: parseFloat(e.target.value) })}
                        className={`${CELL} cursor-pointer text-center`}>
                        <option value={5.5}>5,5%</option><option value={10}>10%</option><option value={20}>20%</option>
                      </select>
                    </td>
                    <td className="px-1 py-2 text-right font-semibold tabular-nums text-marine">{formatCurrency(lineTotalHT(l))}</td>
                    <td className="py-2 text-right">
                      <button onClick={() => removeLine(i)} title="Supprimer la ligne"
                        className="grid h-5 w-5 place-items-center rounded text-gray-300 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={addLine} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 py-1.5 text-[12px] font-medium text-gray-400 hover:border-[#E0674C]/50 hover:text-[#E0674C]">
            <Plus className="h-3.5 w-3.5" /> Ajouter une ligne
          </button>

          {/* Totaux */}
          <div className="mt-4 flex justify-end">
            <div className="w-56 space-y-1 text-[13px]">
              <div className="flex justify-between"><span className="text-gray-500">Total HT</span><span className="font-medium tabular-nums">{formatCurrency(totals.subtotalHT)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">TVA</span><span className="tabular-nums">{formatCurrency(totals.totalVAT)}</span></div>
              <div className="flex justify-between border-t border-gray-200 pt-1 font-heading text-[15px] font-extrabold text-marine"><span>Total TTC</span><span className="tabular-nums">{formatCurrency(totals.totalTTC)}</span></div>
            </div>
          </div>

          {/* Mentions légales */}
          <p className="mt-5 border-t border-gray-100 pt-3 text-[11px] leading-snug text-gray-400">{legalMentions}</p>
        </div>
      </div>

      {/* ─── Barre d'outils (hors document) : consigne IA + enregistrement ─── */}
      <div className="border-t border-black/10 bg-white">
        <div className="flex items-end gap-2 px-3 pt-2.5">
          <button type="button" onClick={toggleDictation} title={dictating ? 'Arrêter la dictée' : 'Dicter la consigne'}
            className={`grid h-9 w-9 flex-none place-items-center rounded-full ${dictating ? 'bg-[#E0674C] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
            {dictating ? <MicOff className="h-[17px] w-[17px]" /> : <Mic className="h-[17px] w-[17px]" />}
          </button>
          <input value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); askAi() } }}
            placeholder={dictating ? 'Parle : « enlève la peinture, ajoute 20 m² de parquet »' : 'Dis à l’IA quoi changer sur le devis…'}
            className="min-w-0 flex-1 rounded-full border border-gray-200 bg-gray-50 px-3.5 py-2 text-sm outline-none focus:border-[#E0674C]/60 focus:bg-white" />
          <button onClick={askAi} disabled={aiPrompt.trim().length < 4 || aiLoading}
            className="grid h-9 w-9 flex-none place-items-center rounded-full bg-[#F5A623] text-black transition-opacity disabled:opacity-40" title="Appliquer avec l’IA">
            {aiLoading ? <Loader2 className="h-[17px] w-[17px] animate-spin" /> : <Wand2 className="h-[17px] w-[17px]" />}
          </button>
        </div>
        {err && <p className="mx-3 mt-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-[13px] text-red-600">{err}</p>}
        <div className="flex items-center gap-2 px-3 py-2.5">
          <button onClick={() => save(false)} disabled={!!saving} title="Enregistrer le brouillon"
            className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-[#E0674C] px-3 text-sm font-semibold text-white hover:bg-[#c9563d] disabled:opacity-60">
            {saving === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Enregistrer
          </button>
          <button onClick={() => save(true)} disabled={!!saving} title="Enregistrer et envoyer au client"
            className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-[#2B2B2E] px-3 text-sm font-semibold text-white hover:bg-black disabled:opacity-60">
            {saving === 'send' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Envoyer
          </button>
          <button onClick={() => onOpenFull(isFacture ? `/factures/nouveau?client=${draft.clientId}` : `/devis/nouveau?client=${draft.clientId}`)}
            className="grid h-10 w-10 flex-none place-items-center rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50" title="Ouvrir l’éditeur complet">
            <ExternalLink className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>
    </div>
  )
}
