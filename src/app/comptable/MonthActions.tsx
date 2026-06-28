'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Download, Send, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { expensesToCsv } from '@/lib/depenses'

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
export default function MonthActions({ monthKey, label, expenses }: { monthKey: string; label: string; expenses: MonthExpense[] }) {
  const router = useRouter()
  const [sending, setSending] = useState(false)

  function exportCsv() {
    if (expenses.length === 0) { toast.error('Aucune dépense à exporter ce mois-ci'); return }
    const csv = expensesToCsv(expenses)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `depenses-${monthKey}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`Export ${label} téléchargé`)
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
        <Download className="w-3.5 h-3.5" /> Export CSV
      </Button>
      <Button size="sm" variant="outline" className="gap-1" onClick={markSent} disabled={sending}>
        {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Envoyé compta
      </Button>
    </div>
  )
}
