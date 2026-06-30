'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Download, Send, Loader2, Receipt } from 'lucide-react'
import { toast } from 'sonner'
import { expensesToCsv } from '@/lib/depenses'

type MonthInvoice = { invoice_number: string; total_ttc: number; issue_date?: string | null; status: string }
const invoiceStatusFr: Record<string, string> = {
  brouillon: 'À préparer', envoyee: 'Envoyée', payee_partiellement: 'Paiement partiel', payee: 'Payée', en_retard: 'En retard', annulee: 'Annulée',
}

export type MonthExpense = {
  id: string
  expense_date?: string | null
  supplier?: string | null
  category?: string | null
  amount_ht?: number | null
  vat_amount?: number | null
  amount_ttc?: number | null
  vat_rate?: number | null
  payment_method?: string | null
  ticket_number?: string | null
  notes?: string | null
  status: string
  storage_path?: string | null
  projects?: { title?: string } | null
}

// Actions par mois pour la préparation comptable : export CSV + marquage « envoyé à la comptable ».
export default function MonthActions({ monthKey, label, expenses, invoices }: { monthKey: string; label: string; expenses: MonthExpense[]; invoices: MonthInvoice[] }) {
  const router = useRouter()
  const [sending, setSending] = useState(false)

  function download(content: string, filename: string) {
    const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  function exportCsv() {
    if (expenses.length === 0) { toast.error('Aucune dépense à exporter ce mois-ci'); return }
    download(expensesToCsv(expenses), `depenses-${monthKey}.csv`)
    toast.success(`Dépenses ${label} téléchargées`)
  }

  function exportFactures() {
    if (invoices.length === 0) { toast.error('Aucune facture ce mois-ci'); return }
    const rows = [['Numéro', 'Date', 'Montant TTC', 'Statut']]
    for (const i of invoices) rows.push([i.invoice_number, i.issue_date || '', String(i.total_ttc), invoiceStatusFr[i.status] || i.status])
    download(rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n'), `factures-${monthKey}.csv`)
    toast.success(`Factures ${label} téléchargées`)
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
    <div className="flex items-center gap-2 flex-shrink-0">
      <Button size="sm" variant="outline" className="gap-1" onClick={exportCsv}>
        <Download className="w-3.5 h-3.5" /> Dépenses
      </Button>
      <Button size="sm" variant="outline" className="gap-1" onClick={exportFactures}>
        <Receipt className="w-3.5 h-3.5" /> Factures
      </Button>
      <Button size="sm" variant="outline" className="gap-1" onClick={markSent} disabled={sending}>
        {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Envoyé compta
      </Button>
    </div>
  )
}
