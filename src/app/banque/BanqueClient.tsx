'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import Link from 'next/link'
import { Upload, Loader2, ArrowDownToLine, Check, X, Link2, Receipt } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { parseBankCsv } from '@/lib/banque'

export type TxItem = {
  id: string
  tx_date: string | null
  label: string | null
  amount: number
  suggestion?: { invoiceId: string; invoiceNumber: string; clientName: string; clientId: string | null; amountDue: number } | null
}
type OpenInvoice = { id: string; invoice_number: string; clientName: string; due: number }

export default function BanqueClient({ transactions, openInvoices }: { transactions: TxItem[]; openInvoices: OpenInvoice[] }) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function markPaid(inv: OpenInvoice) {
    if (!confirm(`Marquer la facture ${inv.invoice_number} comme payée ?`)) return
    setBusyId(inv.id)
    const supabase = createClient()
    const { error } = await supabase.from('invoices').update({ status: 'payee', amount_due: 0 }).eq('id', inv.id)
    setBusyId(null)
    if (error) { toast.error('Erreur'); return }
    toast.success('Facture marquée payée'); router.refresh()
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImporting(true)
    try {
      const text = await file.text()
      const parsed = parseBankCsv(text)
      if (parsed.length === 0) { toast.error('Aucune transaction lisible dans ce fichier'); return }
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { toast.error('Non connecté'); return }
      const rows = parsed.map(t => ({ user_id: user.id, tx_date: t.tx_date, label: t.label, amount: t.amount, status: 'a_rapprocher' as const }))
      const { error } = await supabase.from('bank_transactions').upsert(rows, { onConflict: 'user_id,tx_date,label,amount', ignoreDuplicates: true })
      if (error) { toast.error('Erreur à l’import'); return }
      toast.success(`${parsed.length} transaction(s) importée(s)`)
      router.refresh()
    } finally {
      setImporting(false)
    }
  }

  async function reconcile(tx: TxItem) {
    if (!tx.suggestion) return
    setBusyId(tx.id)
    const supabase = createClient()
    const [a, b] = await Promise.all([
      supabase.from('invoices').update({ status: 'payee' }).eq('id', tx.suggestion.invoiceId),
      supabase.from('bank_transactions').update({
        status: 'rapproche', matched_invoice_id: tx.suggestion.invoiceId, matched_client_id: tx.suggestion.clientId,
      }).eq('id', tx.id),
    ])
    if (a.error || b.error) toast.error('Erreur lors du rapprochement')
    else { toast.success('Paiement rapproché, facture marquée payée'); router.refresh() }
    setBusyId(null)
  }

  async function ignore(tx: TxItem) {
    setBusyId(tx.id)
    const supabase = createClient()
    const { error } = await supabase.from('bank_transactions').update({ status: 'ignore' }).eq('id', tx.id)
    if (error) toast.error('Erreur')
    else { toast.success('Transaction ignorée'); router.refresh() }
    setBusyId(null)
  }

  return (
    <div className="space-y-5">
      <Card className="border border-dashed border-gray-300 bg-white">
        <CardContent className="p-6 flex flex-col items-center text-center gap-3">
          <span className="grid place-items-center w-12 h-12 rounded-xl bg-emerald-100 text-emerald-600"><Upload className="w-6 h-6" /></span>
          <div>
            <p className="font-semibold text-marine">Importer un relevé bancaire</p>
            <p className="text-sm text-gray-500">Exporte ton relevé en CSV depuis ta banque, puis dépose-le ici. Les paiements entrants seront rapprochés de tes factures.</p>
          </div>
          <Button onClick={() => fileRef.current?.click()} disabled={importing} className="gap-2">
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {importing ? 'Import…' : 'Choisir un fichier CSV'}
          </Button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
        </CardContent>
      </Card>

      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Paiements à rapprocher</h2>
        <Card className="border border-gray-200/80 bg-white">
          <CardContent className="p-2 sm:p-4">
            {transactions.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">Aucune transaction à rapprocher. Importe un relevé pour commencer.</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {transactions.map(tx => (
                  <div key={tx.id} className="flex items-center gap-3 py-3 px-1">
                    <span className={`grid place-items-center w-9 h-9 rounded-lg flex-shrink-0 ${tx.amount >= 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-500'}`}>
                      <ArrowDownToLine className="w-4 h-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-marine truncate">{tx.label || 'Transaction'}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-gray-400">{tx.tx_date ? formatDate(tx.tx_date) : '—'}</span>
                        {tx.suggestion && (
                          <Badge className="bg-blue-100 text-blue-700 border-0 gap-1 text-[10px]">
                            <Link2 className="w-3 h-3" /> {tx.suggestion.invoiceNumber} · {tx.suggestion.clientName}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <span className={`text-sm font-semibold tabular-nums flex-shrink-0 ${tx.amount >= 0 ? 'text-emerald-600' : 'text-gray-600'}`}>
                      {tx.amount >= 0 ? '+' : ''}{formatCurrency(tx.amount)}
                    </span>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {tx.suggestion && (
                        <Button size="sm" className="gap-1 h-8" onClick={() => reconcile(tx)} disabled={busyId === tx.id}>
                          {busyId === tx.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Rapprocher
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-gray-400" onClick={() => ignore(tx)} disabled={busyId === tx.id} title="Ignorer">
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Factures en attente de paiement (§18.1) */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Factures en attente de paiement</h2>
        <Card className="border border-gray-200/80 bg-white">
          <CardContent className="p-2 sm:p-4">
            {openInvoices.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">Toutes les factures sont payées. 🎉</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {openInvoices.map(inv => (
                  <div key={inv.id} className="flex items-center gap-3 py-2.5 px-1">
                    <span className="grid place-items-center w-9 h-9 rounded-lg bg-blue-100 text-blue-600 flex-shrink-0"><Receipt className="w-4 h-4" /></span>
                    <Link href={`/factures/${inv.id}`} className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-marine truncate hover:text-primary">{inv.clientName}</div>
                      <div className="text-xs text-gray-400 font-mono">{inv.invoice_number}</div>
                    </Link>
                    <span className="text-sm font-semibold text-marine tabular-nums flex-shrink-0">{formatCurrency(inv.due)}</span>
                    <Button size="sm" variant="outline" className="h-8 gap-1 flex-shrink-0" onClick={() => markPaid(inv)} disabled={busyId === inv.id}>
                      {busyId === inv.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Payée
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
