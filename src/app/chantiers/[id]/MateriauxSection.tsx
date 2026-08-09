'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import DottedCard from '@/components/charts/DottedCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Package, Download, Plus, HelpCircle, FileText, Info } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { fmtUnit, labelKey } from '@/lib/materiaux'

export type MatchStatus = 'livre' | 'facture' | 'devise' | 'a_commander'

export type MaterialRow = {
  key: string
  label: string
  unit: string | null
  quantity: number
  estCostHt: number
  quotes: string[]
  uncertain: boolean
  manual: boolean
  // Rapprochement automatique avec les documents fournisseurs scannés du chantier
  autoStatus: MatchStatus
  autoSupplier: string | null
  autoCost: number | null
}

const STATUS_META: Record<MatchStatus, { label: string; cls: string }> = {
  livre: { label: 'Livré', cls: 'bg-[#E9F2DB] text-[#3F7A2E]' },
  facture: { label: 'Facturé', cls: 'bg-[#E3ECFB] text-[#1F5FAE]' },
  devise: { label: 'Devisé', cls: 'bg-[#FBEED6] text-[#8A5A08]' },
  a_commander: { label: 'À commander', cls: 'bg-gray-100 text-gray-500' },
}
const isReceived = (s: MatchStatus) => s === 'livre' || s === 'facture'

export default function MateriauxSection({
  projectId, projectTitle, initial,
}: { projectId: string; projectTitle: string; initial: MaterialRow[] }) {
  const router = useRouter()
  const [rows, setRows] = useState<MaterialRow[]>(initial)
  const [adding, setAdding] = useState(false)

  const nbRecus = rows.filter(r => isReceived(r.autoStatus)).length
  const budgetEst = rows.reduce((s, r) => s + (r.estCostHt || 0), 0)
  const coutReel = rows.reduce((s, r) => s + (isReceived(r.autoStatus) ? Number(r.autoCost) || 0 : 0), 0)

  async function addManual(label: string, quantity: number, unit: string) {
    const key = labelKey(label)
    if (!key) return
    if (rows.some(r => r.key === key)) { toast.error('Ce matériau est déjà dans la liste'); setAdding(false); return }
    const row: MaterialRow = { key, label: label.trim(), unit: unit || 'u', quantity, estCostHt: 0, quotes: [], uncertain: false, manual: true, autoStatus: 'a_commander', autoSupplier: null, autoCost: null }
    setRows(prev => [...prev, row].sort((a, b) => a.label.localeCompare(b.label, 'fr')))
    setAdding(false)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase.from('procurement_items').upsert({
      user_id: user.id, project_id: projectId, label_key: key, label: row.label, unit: row.unit, quantity: row.quantity, manual: true,
    }, { onConflict: 'project_id,label_key' })
    if (error) { toast.error('Enregistrement impossible'); return }
    router.refresh()
  }

  function exportCsv() {
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
    const header = ['Matériau', 'Quantité', 'Unité', 'Statut', 'Fournisseur', 'Coût HT', 'Devis']
    const lines = rows.map(r => [
      esc(r.label), esc(r.quantity), esc(fmtUnit(r.unit)),
      esc(STATUS_META[r.autoStatus].label), esc(r.autoSupplier || ''), esc(r.autoCost ?? ''), esc(r.quotes.join(' ')),
    ].join(';'))
    const csv = '﻿' + [header.join(';'), ...lines].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `materiaux-${projectTitle.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function printBonCommande() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data: co } = user
      ? await supabase.from('companies').select('trade_name,address,phone,email,siret').eq('user_id', user.id).single()
      : { data: null }

    // À commander = tout ce qui n'est pas encore livré/facturé. Groupé par fournisseur.
    const toOrder = rows.filter(r => r.autoStatus === 'a_commander' || r.autoStatus === 'devise')
    const list = toOrder.length ? toOrder : rows
    const groups = new Map<string, MaterialRow[]>()
    for (const r of list) {
      const k = r.autoSupplier?.trim() || 'Fournisseur à définir'
      groups.set(k, [...(groups.get(k) || []), r])
    }
    const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const today = new Date().toLocaleDateString('fr-FR')
    const sections = [...groups.entries()].map(([supplier, items]) => `
      <h3>${esc(supplier)}</h3>
      <table><thead><tr><th>Matériau</th><th class="q">Quantité</th><th>Unité</th></tr></thead><tbody>
      ${items.map(r => `<tr><td>${esc(r.label)}</td><td class="q">${esc(r.quantity)}</td><td>${esc(fmtUnit(r.unit))}</td></tr>`).join('')}
      </tbody></table>`).join('')
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Bon de commande — ${esc(projectTitle)}</title>
    <style>
      body{font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;max-width:800px;margin:24px auto;padding:0 24px;font-size:13px}
      .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1a1a1a;padding-bottom:12px;margin-bottom:16px}
      h1{font-size:22px;margin:0}
      h3{margin:18px 0 6px;font-size:14px;background:#f2f2f2;padding:6px 10px;border-radius:4px}
      table{width:100%;border-collapse:collapse;margin-bottom:8px}
      th,td{border:1px solid #ddd;padding:6px 10px;text-align:left}
      th{background:#fafafa;font-size:11px;text-transform:uppercase;color:#555}
      .q{text-align:right;width:110px}
      .meta{color:#666;font-size:12px;text-align:right}
      @media print{body{margin:0}}
    </style></head><body>
    <div class="head">
      <div><strong style="font-size:16px">${esc(co?.trade_name || 'Votre entreprise')}</strong><br>
      ${esc(co?.address || '')}<br>${esc(co?.phone || '')} ${co?.email ? '· ' + esc(co.email) : ''}${co?.siret ? '<br>SIRET : ' + esc(co.siret) : ''}</div>
      <div class="meta"><h1>Bon de commande</h1>Chantier : ${esc(projectTitle)}<br>Date : ${esc(today)}</div>
    </div>
    ${sections || '<p>Aucun matériau à commander.</p>'}
    <p style="margin-top:24px;color:#888;font-size:11px">Merci de confirmer disponibilité et délai de livraison.</p>
    <script>window.onload=function(){window.print()}</script>
    </body></html>`
    const w = window.open('', '_blank')
    if (!w) { toast.error('Autorisez les pop-ups pour imprimer le bon de commande'); return }
    w.document.write(html); w.document.close()
  }

  const empty = rows.length === 0

  return (
    <DottedCard>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 pt-4 px-4">
        <CardTitle className="text-base flex items-center gap-2">
          <Package className="w-4 h-4 text-gray-400" /> Besoins matériaux
          {!empty && <span className="text-sm font-normal text-gray-500">· {nbRecus}/{rows.length} reçus</span>}
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setAdding(a => !a)}><Plus className="w-4 h-4 mr-1" /> Matériau</Button>
          {!empty && <Button variant="outline" size="sm" onClick={printBonCommande}><FileText className="w-4 h-4 mr-1" /> Bon de commande</Button>}
          {!empty && <Button variant="ghost" size="sm" onClick={exportCsv} title="Export CSV"><Download className="w-4 h-4" /></Button>}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {adding && <AddRow onAdd={addManual} onCancel={() => setAdding(false)} />}

        {empty ? (
          <p className="text-sm text-gray-400 py-3">
            Aucun matériau. Les besoins apparaissent automatiquement dès qu&apos;un devis est accepté, ou ajoutez-en manuellement.
          </p>
        ) : (
          <>
            <div className="flex gap-2 rounded-lg bg-primary/[0.04] border border-primary/10 px-3 py-2 mb-3 text-[11px] text-marine/70">
              <Info className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
              <span>Statut mis à jour <span className="font-medium">automatiquement</span> d&apos;après vos documents fournisseurs scannés (BL / factures / devis). Le rapprochement se fait par mots-clés — vérifiez en cas de doute.</span>
            </div>
            <div className="space-y-1.5">
              {rows.map(r => <MatRow key={r.key} row={r} />)}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500 border-t border-gray-100 pt-2.5">
              {budgetEst > 0 && <span>Budget matériaux estimé (devis) : <span className="font-semibold text-marine">{formatCurrency(budgetEst)}</span></span>}
              {coutReel > 0 && <span>Coût réel (BL/factures) : <span className="font-semibold text-marine">{formatCurrency(coutReel)}</span></span>}
            </div>
          </>
        )}
      </CardContent>
    </DottedCard>
  )
}

function MatRow({ row }: { row: MaterialRow }) {
  const meta = STATUS_META[row.autoStatus]
  const received = isReceived(row.autoStatus)
  return (
    <div className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 ${received ? 'border-emerald-200 bg-emerald-50/40' : 'border-gray-100'}`}>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium truncate ${received ? 'text-gray-600' : 'text-gray-800'}`}>
          {row.label}
          {row.uncertain && <span title="Ligne libre — à vérifier" className="inline-flex ml-1.5 align-middle text-amber-500"><HelpCircle className="w-3.5 h-3.5" /></span>}
        </p>
        <p className="text-[11px] text-gray-400 truncate">
          {row.quantity} {fmtUnit(row.unit)}
          {row.autoSupplier && <> · {row.autoSupplier}</>}
          {row.quotes.length > 0 && <> · {row.quotes.join(', ')}</>}
          {row.manual && <> · ajout manuel</>}
        </p>
      </div>
      {row.autoCost != null && <span className="text-xs font-semibold text-marine tabular-nums flex-shrink-0">{formatCurrency(row.autoCost)}</span>}
      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${meta.cls}`}>{meta.label}</span>
    </div>
  )
}

function AddRow({ onAdd, onCancel }: { onAdd: (label: string, qty: number, unit: string) => void; onCancel: () => void }) {
  const [label, setLabel] = useState('')
  const [qty, setQty] = useState('1')
  const [unit, setUnit] = useState('u')
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-gray-300 p-3 mb-3">
      <div className="flex-1 min-w-[160px]">
        <Input autoFocus value={label} onChange={e => setLabel(e.target.value)} placeholder="Ex : Placo BA13, sac ciment…" className="h-9 text-sm" />
      </div>
      <Input value={qty} onChange={e => setQty(e.target.value)} inputMode="decimal" placeholder="Qté" className="h-9 w-[70px] text-sm" />
      <select value={unit} onChange={e => setUnit(e.target.value)} className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm">
        {['u', 'm2', 'ml', 'piece', 'forfait'].map(u => <option key={u} value={u}>{fmtUnit(u)}</option>)}
      </select>
      <Button size="sm" disabled={!label.trim()} onClick={() => onAdd(label, Number(qty.replace(',', '.')) || 1, unit)}>Ajouter</Button>
      <Button size="sm" variant="ghost" onClick={onCancel}>Annuler</Button>
    </div>
  )
}
