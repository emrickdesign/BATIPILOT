'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Package, Download, Plus, HelpCircle, Check, FileText } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { fmtUnit, labelKey } from '@/lib/materiaux'

export type MaterialRow = {
  key: string
  label: string
  unit: string | null
  quantity: number
  estCostHt: number
  quotes: string[]
  uncertain: boolean
  purchased: boolean
  supplier: string | null
  cost_ht: number | null
  manual: boolean
}

export default function MateriauxSection({
  projectId, projectTitle, initial,
}: { projectId: string; projectTitle: string; initial: MaterialRow[] }) {
  const router = useRouter()
  const [rows, setRows] = useState<MaterialRow[]>(initial)
  const [busy, setBusy] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const nbAchetes = rows.filter(r => r.purchased).length
  const budgetEst = rows.reduce((s, r) => s + (r.estCostHt || 0), 0)
  const coutReel = rows.reduce((s, r) => s + (r.purchased ? Number(r.cost_ht) || 0 : 0), 0)

  async function upsert(row: MaterialRow, patch: Partial<MaterialRow>) {
    const next = { ...row, ...patch }
    setRows(prev => prev.map(r => (r.key === row.key ? next : r)))
    setBusy(row.key)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setBusy(null); return }
    const { error } = await supabase.from('procurement_items').upsert({
      user_id: user.id,
      project_id: projectId,
      label_key: row.key,
      label: next.label,
      unit: next.unit,
      quantity: next.quantity,
      supplier: next.supplier,
      cost_ht: next.cost_ht,
      purchased: next.purchased,
      purchased_at: next.purchased ? new Date().toISOString() : null,
      manual: next.manual,
    }, { onConflict: 'project_id,label_key' })
    setBusy(null)
    if (error) { toast.error('Enregistrement impossible'); return }
    router.refresh()
  }

  async function addManual(label: string, quantity: number, unit: string) {
    const key = labelKey(label)
    if (!key) return
    if (rows.some(r => r.key === key)) { toast.error('Ce matériau est déjà dans la liste'); setAdding(false); return }
    const row: MaterialRow = { key, label: label.trim(), unit: unit || 'u', quantity, estCostHt: 0, quotes: [], uncertain: false, purchased: false, supplier: null, cost_ht: null, manual: true }
    setRows(prev => [...prev, row].sort((a, b) => a.label.localeCompare(b.label, 'fr')))
    setAdding(false)
    await upsert(row, {})
  }

  function exportCsv() {
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
    const header = ['Matériau', 'Quantité', 'Unité', 'Fournisseur', 'Coût HT', 'Acheté', 'Devis']
    const lines = rows.map(r => [
      esc(r.label), esc(r.quantity), esc(fmtUnit(r.unit)),
      esc(r.supplier || ''), esc(r.cost_ht ?? ''), esc(r.purchased ? 'Oui' : 'Non'), esc(r.quotes.join(' ')),
    ].join(';'))
    const csv = '﻿' + [header.join(';'), ...lines].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `bon-commande-${projectTitle.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function printBonCommande() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data: co } = user
      ? await supabase.from('companies').select('trade_name,address,phone,email,siret').eq('user_id', user.id).single()
      : { data: null }

    // À commander = ce qui n'est pas encore acheté (sinon tout). Groupé par fournisseur.
    const toOrder = rows.filter(r => !r.purchased)
    const list = toOrder.length ? toOrder : rows
    const groups = new Map<string, MaterialRow[]>()
    for (const r of list) {
      const k = r.supplier?.trim() || 'Fournisseur à définir'
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
    <Card className="border-0 shadow-[var(--shadow-sm)]">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 pt-4 px-4">
        <CardTitle className="text-base flex items-center gap-2">
          <Package className="w-4 h-4 text-gray-400" /> Besoins matériaux
          {!empty && <span className="text-sm font-normal text-gray-500">· {nbAchetes}/{rows.length} achetés</span>}
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
            <div className="space-y-1.5 mt-1">
              {rows.map(r => (
                <MatRow key={r.key} row={r} busy={busy === r.key}
                  onToggle={() => upsert(r, { purchased: !r.purchased })}
                  onSupplier={v => upsert(r, { supplier: v })}
                  onCost={v => upsert(r, { cost_ht: v })} />
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500 border-t border-gray-100 pt-2.5">
              {budgetEst > 0 && <span>Budget matériaux estimé (devis) : <span className="font-semibold text-marine">{formatCurrency(budgetEst)}</span></span>}
              {coutReel > 0 && <span>Coût réel saisi : <span className="font-semibold text-marine">{formatCurrency(coutReel)}</span></span>}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function MatRow({ row, busy, onToggle, onSupplier, onCost }: {
  row: MaterialRow; busy: boolean
  onToggle: () => void; onSupplier: (v: string) => void; onCost: (v: number | null) => void
}) {
  const [supplier, setSupplier] = useState(row.supplier || '')
  const [cost, setCost] = useState(row.cost_ht != null ? String(row.cost_ht) : '')
  return (
    <div className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 transition-colors ${row.purchased ? 'border-emerald-200 bg-emerald-50/40' : 'border-gray-100 hover:border-gray-200'}`}>
      <button onClick={onToggle} disabled={busy}
        className={`grid place-items-center w-5 h-5 rounded-md border-2 flex-shrink-0 transition-colors ${row.purchased ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-gray-300 hover:border-emerald-400'}`}
        title={row.purchased ? 'Marquer comme à acheter' : 'Marquer comme acheté'}>
        {row.purchased && <Check className="w-3 h-3" strokeWidth={3} />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium truncate ${row.purchased ? 'text-gray-500 line-through' : 'text-gray-800'}`}>
          {row.label}
          {row.uncertain && <span title="Ligne libre — à vérifier" className="inline-flex ml-1.5 align-middle text-amber-500"><HelpCircle className="w-3.5 h-3.5" /></span>}
        </p>
        <p className="text-[11px] text-gray-400">
          {row.quantity} {fmtUnit(row.unit)}
          {row.quotes.length > 0 && <> · {row.quotes.join(', ')}</>}
          {row.manual && <> · ajout manuel</>}
        </p>
      </div>
      <Input value={supplier} onChange={e => setSupplier(e.target.value)} onBlur={() => supplier !== (row.supplier || '') && onSupplier(supplier)}
        placeholder="Fournisseur" className="h-8 w-[130px] text-xs hidden sm:block" />
      <div className="relative">
        <Input value={cost} onChange={e => setCost(e.target.value)}
          onBlur={() => { const n = cost === '' ? null : Number(cost.replace(',', '.')); if (n !== (row.cost_ht ?? null)) onCost(Number.isNaN(n as number) ? null : n) }}
          placeholder="€ HT" inputMode="decimal" className="h-8 w-[80px] text-xs pr-5" />
      </div>
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
