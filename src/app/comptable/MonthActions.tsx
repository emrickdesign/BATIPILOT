'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Download, Send, Loader2, Receipt, FolderArchive, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { formatDate } from '@/lib/utils'
import {
  depensesCsv, facturesCsv, tvaCsv, piecesOf,
  type MonthExpense, type MonthInvoice, type MonthSubInvoice,
} from './shared'

export type LastSend = { sent_at: string; to_email: string } | null

// Actions par mois : envoi réel à la comptable (principal), dossier ZIP, exports CSV (secondaires).
export default function MonthActions({ monthKey, label, expenses, invoices, subInvoices, lastSend, accountantEmail }: {
  monthKey: string; label: string
  expenses: MonthExpense[]; invoices: MonthInvoice[]; subInvoices: MonthSubInvoice[]
  lastSend: LastSend; accountantEmail: string
}) {
  const router = useRouter()
  const [sending, setSending] = useState(false)
  const [zipping, setZipping] = useState(false)

  const isEmpty = expenses.length === 0 && subInvoices.length === 0 && invoices.length === 0

  function download(content: BlobPart, filename: string, type: string) {
    const blob = content instanceof Blob ? content : new Blob([content], { type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  function exportDepenses() {
    if (expenses.length === 0 && subInvoices.length === 0) { toast.error('Aucune dépense ce mois-ci'); return }
    download('﻿' + depensesCsv(expenses, subInvoices), `depenses-${monthKey}.csv`, 'text/csv;charset=utf-8;')
    toast.success(`Dépenses ${label} téléchargées`)
  }
  function exportFactures() {
    if (invoices.length === 0) { toast.error('Aucune facture ce mois-ci'); return }
    download('﻿' + facturesCsv(invoices), `factures-${monthKey}.csv`, 'text/csv;charset=utf-8;')
    toast.success(`Factures ${label} téléchargées`)
  }

  // Dossier complet : les 3 tableurs + tous les justificatifs, en ZIP
  async function exportZip() {
    if (isEmpty) { toast.error('Rien à exporter ce mois-ci'); return }
    setZipping(true)
    try {
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      zip.file(`depenses-${monthKey}.csv`, '﻿' + depensesCsv(expenses, subInvoices))
      zip.file(`factures-${monthKey}.csv`, '﻿' + facturesCsv(invoices))
      zip.file(`recap-tva-${monthKey}.csv`, '﻿' + tvaCsv(expenses, invoices, subInvoices))

      const pieces = piecesOf(monthKey, expenses, subInvoices)
      let ok = 0
      if (pieces.length) {
        const folder = zip.folder('justificatifs')!
        const supabase = createClient()
        for (const p of pieces) {
          const { data } = await supabase.storage.from('documents').createSignedUrl(p.path, 600)
          if (!data?.signedUrl) continue
          const res = await fetch(data.signedUrl)
          if (!res.ok) continue
          folder.file(p.name, await res.blob())
          ok++
        }
      }
      download(await zip.generateAsync({ type: 'blob' }), `compta-${monthKey}.zip`, 'application/zip')
      toast.success(`Dossier ${label} prêt — ${ok} justificatif(s)`)
    } catch (e) {
      console.error('ZIP compta:', e)
      toast.error('Erreur pendant la création du dossier')
    } finally { setZipping(false) }
  }

  // Envoi réel : construit le dossier côté serveur et l'envoie par Gmail à la comptable
  async function sendToAccountant() {
    if (isEmpty) { toast.error('Rien à envoyer ce mois-ci'); return }
    let email = accountantEmail
    if (!email) {
      const input = window.prompt('Email de votre comptable ? (mémorisé pour les prochains envois)')
      if (!input) return
      email = input.trim()
    }
    if (lastSend && !window.confirm(`Ce dossier a déjà été envoyé le ${formatDate(lastSend.sent_at)} à ${lastSend.to_email}. Le renvoyer ?`)) return

    setSending(true)
    try {
      const res = await fetch('/api/comptable/envoyer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: monthKey, email: accountantEmail ? undefined : email }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Erreur pendant l\'envoi'); return }
      toast.success(`Dossier ${label} envoyé à ${json.to} (${json.nbFiles} justificatif(s))`)
      router.refresh()
    } catch {
      toast.error('Erreur réseau pendant l\'envoi')
    } finally { setSending(false) }
  }

  const totalPieces = expenses.length + subInvoices.length + invoices.length

  return (
    <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
      {/* Secondaires : tableurs seuls, si la comptable les demande */}
      <Button size="sm" variant="ghost" className="gap-1 text-gray-500" onClick={exportDepenses}>
        <Download className="w-3.5 h-3.5" /> Dépenses
      </Button>
      <Button size="sm" variant="ghost" className="gap-1 text-gray-500" onClick={exportFactures}>
        <Receipt className="w-3.5 h-3.5" /> Factures
      </Button>

      {/* Principaux */}
      <Button size="sm" variant="info" className="gap-1" onClick={exportZip} disabled={zipping || isEmpty}>
        {zipping ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FolderArchive className="w-3.5 h-3.5" />}
        {zipping ? 'Préparation…' : 'Dossier complet'}
      </Button>

      {lastSend ? (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs font-medium text-[#3F7A2E]">
            <CheckCircle2 className="w-3.5 h-3.5" /> Envoyé le {formatDate(lastSend.sent_at)}
          </span>
          <Button size="sm" variant="outline" className="gap-1" onClick={sendToAccountant} disabled={sending}>
            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Renvoyer
          </Button>
        </div>
      ) : (
        <Button size="sm" className="gap-1 shadow-sm" onClick={sendToAccountant} disabled={sending || isEmpty}>
          {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          {sending ? 'Envoi…' : `Envoyer à la compta${totalPieces ? ` (${totalPieces})` : ''}`}
        </Button>
      )}
    </div>
  )
}
