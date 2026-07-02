'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Download, CheckCircle, Send, Mail, MessageCircle, Loader2, FileSpreadsheet, Landmark, Calculator, Ban } from 'lucide-react'

function formatWhatsApp(phone: string) {
  let p = phone.replace(/[\s\-.()]/g, '')
  if (p.startsWith('0')) p = '+33' + p.slice(1)
  return p
}

export default function InvoiceActions({
  invoiceId, status, invoiceNumber, clientEmail, clientPhone, clientName, companyName,
  issueDate, subtotalHt, totalVat, totalTtc, amountDue,
}: {
  invoiceId: string
  status: string
  invoiceNumber: string
  clientEmail?: string
  clientPhone?: string
  clientName?: string
  companyName?: string
  issueDate?: string
  subtotalHt?: number
  totalVat?: number
  totalTtc?: number
  amountDue?: number
}) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)

  async function updateStatus(newStatus: string) {
    setLoading(newStatus)
    const supabase = createClient()
    await supabase.from('invoices').update({ status: newStatus }).eq('id', invoiceId)
    toast.success(
      newStatus === 'payee' ? 'Facture marquée comme payée !' :
      newStatus === 'annulee' ? 'Facture annulée' :
      newStatus === 'envoyee' ? 'Facture marquée comme envoyée' : 'Statut mis à jour'
    )
    router.refresh()
    setLoading(null)
  }

  function handleDownload() {
    window.open(`/api/factures/${invoiceId}/pdf`, '_blank')
  }

  async function handleSendEmail() {
    if (!clientEmail) { toast.error('Ce client n\'a pas d\'adresse email'); return }
    setLoading('email')
    const res = await fetch(`/api/factures/${invoiceId}/envoyer`, { method: 'POST' })
    const json = await res.json()
    if (res.ok) { toast.success(`Facture envoyée à ${clientEmail} !`); router.refresh() }
    else { toast.error(json.error || 'Erreur envoi email') }
    setLoading(null)
  }

  function handleWhatsApp() {
    if (!clientPhone) { toast.error('Ce client n\'a pas de numéro de téléphone'); return }
    const phone = formatWhatsApp(clientPhone)
    const fmt = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)
    const msg = encodeURIComponent(
      `Bonjour,\n\nJe vous transmets votre facture ${invoiceNumber}${amountDue ? ` d'un montant de ${fmt(amountDue)}` : ''}.\n\nN'hésitez pas à me contacter pour toute question.\n\nCordialement,\n${companyName || ''}`
    )
    window.open(`https://wa.me/${phone}?text=${msg}`, '_blank')
  }

  function handleExportData() {
    const rows = [
      ['Numéro', 'Date', 'Client', 'Total HT', 'TVA', 'Total TTC', 'Reste à payer'],
      [invoiceNumber, issueDate || '', clientName || '', String(subtotalHt ?? ''), String(totalVat ?? ''), String(totalTtc ?? ''), String(amountDue ?? '')],
    ]
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${invoiceNumber}.csv`; a.click()
    URL.revokeObjectURL(url)
    toast.success('Données exportées (CSV)')
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="info" className="gap-2" onClick={handleDownload} disabled={!!loading}>
        <Download className="w-4 h-4" /> PDF
      </Button>

      <Button variant="info" className="gap-2" onClick={handleExportData} disabled={!!loading}>
        <FileSpreadsheet className="w-4 h-4" /> Exporter (CSV)
      </Button>

      <Button
        variant="info" className="gap-2"
        onClick={handleSendEmail} disabled={!!loading || !clientEmail}
        title={!clientEmail ? 'Aucun email pour ce client' : `Envoyer à ${clientEmail}`}
      >
        {loading === 'email' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />} Email
      </Button>

      <Button
        variant="outline" className="gap-2 border-green-200 text-green-700 hover:bg-green-50"
        onClick={handleWhatsApp} disabled={!!loading || !clientPhone}
        title={!clientPhone ? 'Aucun téléphone pour ce client' : `WhatsApp ${clientPhone}`}
      >
        <MessageCircle className="w-4 h-4" /> WhatsApp
      </Button>

      {status === 'brouillon' && (
        <Button variant="success" className="gap-2" onClick={() => updateStatus('envoyee')} disabled={!!loading}>
          <Send className="w-4 h-4" /> Marquer envoyée
        </Button>
      )}

      <Link href="/banque">
        <Button variant="info" className="gap-2"><Landmark className="w-4 h-4" /> Rapprocher un paiement</Button>
      </Link>

      <Link href="/comptable">
        <Button variant="info" className="gap-2"><Calculator className="w-4 h-4" /> Transmettre à la comptable</Button>
      </Link>

      {(status === 'envoyee' || status === 'en_retard' || status === 'payee_partiellement') && (
        <Button variant="success" className="gap-2" onClick={() => updateStatus('payee')} disabled={!!loading}>
          <CheckCircle className="w-4 h-4" /> Marquer payée
        </Button>
      )}

      {status !== 'annulee' && status !== 'payee' && (
        <Button variant="destructive" className="gap-2" onClick={() => { if (confirm('Annuler cette facture ?')) updateStatus('annulee') }} disabled={!!loading}>
          <Ban className="w-4 h-4" /> Annuler
        </Button>
      )}
    </div>
  )
}
