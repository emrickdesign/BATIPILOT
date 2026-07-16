'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Download, Send, Loader2, Receipt, FolderArchive } from 'lucide-react'
import { toast } from 'sonner'
import { num, subVat, type MonthExpense, type MonthInvoice, type MonthSubInvoice } from './shared'

const invoiceStatusFr: Record<string, string> = {
  brouillon: 'À préparer', envoyee: 'Envoyée', payee_partiellement: 'Paiement partiel', payee: 'Payée', en_retard: 'En retard', annulee: 'Annulée',
}
const esc = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v)
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const toCsv = (rows: unknown[][]) => rows.map(r => r.map(esc).join(';')).join('\n')

function safeName(s: string) {
  return (s || 'piece').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9.\-_ ]/g, '_').slice(0, 60).trim()
}
function extOf(path: string) {
  const m = path.match(/\.([a-zA-Z0-9]+)$/)
  return m ? `.${m[1]}` : ''
}

// Actions par mois : exports (achats, ventes, dossier complet) + marquage « envoyé à la comptable ».
export default function MonthActions({ monthKey, label, expenses, invoices, subInvoices }: {
  monthKey: string; label: string
  expenses: MonthExpense[]; invoices: MonthInvoice[]; subInvoices: MonthSubInvoice[]
}) {
  const router = useRouter()
  const [sending, setSending] = useState(false)
  const [zipping, setZipping] = useState(false)

  function download(content: BlobPart, filename: string, type: string) {
    const blob = content instanceof Blob ? content : new Blob([content], { type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  // ─── Achats : dépenses + factures de sous-traitance (le comptable veut les deux)
  function achatsCsv(): string {
    const rows: unknown[][] = [['Type', 'Date', 'Fournisseur', 'Catégorie', 'Montant HT', 'TVA', 'Montant TTC', 'Taux TVA', 'Paiement', 'N° pièce', 'Chantier', 'Justificatif', 'Note']]
    for (const e of expenses) {
      rows.push(['Dépense', e.expense_date || '', e.supplier || '', e.category || '',
        e.amount_ht ?? '', e.vat_amount ?? '', e.amount_ttc ?? '', e.vat_rate ?? '',
        e.payment_method || '', e.ticket_number || '', e.projects?.title || '',
        e.storage_path ? 'oui' : 'MANQUANT', e.notes || ''])
    }
    for (const i of subInvoices) {
      rows.push(['Sous-traitance', i.issue_date || '', i.company_name || '', 'Sous-traitance',
        i.amount_ht ?? '', subVat(i) || '', i.amount_ttc ?? '', '',
        '', i.number || '', '', i.storage_path ? 'oui' : 'MANQUANT', ''])
    }
    return toCsv(rows)
  }

  // ─── Ventes : avec client, HT et TVA (indispensables à la déclaration de TVA)
  function facturesCsv(): string {
    const rows: unknown[][] = [['Numéro', 'Date', 'Client', 'Montant HT', 'TVA', 'Montant TTC', 'Statut']]
    for (const i of invoices) {
      rows.push([i.invoice_number, i.issue_date || '', i.client_name || '',
        i.subtotal_ht, i.total_vat, i.total_ttc, invoiceStatusFr[i.status] || i.status])
    }
    return toCsv(rows)
  }

  function tvaCsv(): string {
    const collectee = invoices.filter(i => i.status !== 'brouillon').reduce((t, i) => t + num(i.total_vat), 0)
    const deductible = expenses.reduce((t, e) => t + num(e.vat_amount), 0) + subInvoices.reduce((t, i) => t + subVat(i), 0)
    const solde = collectee - deductible
    return toCsv([
      ['Libellé', 'Montant'],
      ['TVA collectée (ventes)', collectee.toFixed(2)],
      ['TVA déductible (achats)', deductible.toFixed(2)],
      [solde >= 0 ? 'TVA à payer' : 'Crédit de TVA', Math.abs(solde).toFixed(2)],
    ])
  }

  function exportAchats() {
    if (expenses.length === 0 && subInvoices.length === 0) { toast.error('Aucun achat ce mois-ci'); return }
    download('﻿' + achatsCsv(), `achats-${monthKey}.csv`, 'text/csv;charset=utf-8;')
    toast.success(`Achats ${label} téléchargés`)
  }
  function exportFactures() {
    if (invoices.length === 0) { toast.error('Aucune facture ce mois-ci'); return }
    download('﻿' + facturesCsv(), `factures-${monthKey}.csv`, 'text/csv;charset=utf-8;')
    toast.success(`Factures ${label} téléchargées`)
  }

  // ─── Dossier complet : CSV + tous les justificatifs, dans un ZIP
  async function exportZip() {
    if (expenses.length === 0 && subInvoices.length === 0 && invoices.length === 0) { toast.error('Rien à exporter ce mois-ci'); return }
    setZipping(true)
    try {
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      zip.file(`achats-${monthKey}.csv`, '﻿' + achatsCsv())
      zip.file(`factures-${monthKey}.csv`, '﻿' + facturesCsv())
      zip.file(`recap-tva-${monthKey}.csv`, '﻿' + tvaCsv())

      const pieces = [
        ...expenses.filter(e => e.storage_path).map(e => ({
          path: e.storage_path as string,
          name: `${e.expense_date || monthKey}-${safeName(e.supplier || 'depense')}-${num(e.amount_ttc).toFixed(2)}`,
        })),
        ...subInvoices.filter(i => i.storage_path).map(i => ({
          path: i.storage_path as string,
          name: `${i.issue_date || monthKey}-ST-${safeName(i.company_name || 'sous-traitant')}-${num(i.amount_ttc).toFixed(2)}`,
        })),
      ]

      let ok = 0
      if (pieces.length) {
        const folder = zip.folder('justificatifs')!
        const supabase = createClient()
        for (const p of pieces) {
          const { data } = await supabase.storage.from('documents').createSignedUrl(p.path, 600)
          if (!data?.signedUrl) continue
          const res = await fetch(data.signedUrl)
          if (!res.ok) continue
          folder.file(`${p.name}${extOf(p.path)}`, await res.blob())
          ok++
        }
      }

      const blob = await zip.generateAsync({ type: 'blob' })
      download(blob, `compta-${monthKey}.zip`, 'application/zip')
      const manquants = pieces.length - ok
      toast.success(`Dossier ${label} prêt — ${ok} justificatif(s)${manquants > 0 ? `, ${manquants} illisible(s)` : ''}`)
    } catch (e) {
      console.error('ZIP compta:', e)
      toast.error('Erreur pendant la création du dossier')
    } finally { setZipping(false) }
  }

  async function markSent() {
    const ids = expenses.filter(e => e.status !== 'envoye_comptable' && e.status !== 'archive').map(e => e.id)
    if (ids.length === 0) { toast.info('Tout est déjà envoyé pour ce mois'); return }
    setSending(true)
    const supabase = createClient()
    const { error } = await supabase.from('expenses').update({ status: 'envoye_comptable' }).in('id', ids)
    if (error) toast.error('Erreur lors du marquage')
    else { toast.success(`${ids.length} dépense(s) marquée(s) envoyées`); router.refresh() }
    setSending(false)
  }

  return (
    <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
      <Button size="sm" variant="info" className="gap-1" onClick={exportAchats}>
        <Download className="w-3.5 h-3.5" /> Achats
      </Button>
      <Button size="sm" variant="info" className="gap-1" onClick={exportFactures}>
        <Receipt className="w-3.5 h-3.5" /> Factures
      </Button>
      <Button size="sm" variant="info" className="gap-1" onClick={exportZip} disabled={zipping}>
        {zipping ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FolderArchive className="w-3.5 h-3.5" />}
        {zipping ? 'Préparation…' : 'Dossier complet'}
      </Button>
      <Button size="sm" variant="info" className="gap-1" onClick={markSent} disabled={sending}>
        {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Envoyé compta
      </Button>
    </div>
  )
}
