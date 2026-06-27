'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Download, Send, CheckCircle, XCircle, FileText, Loader2, Mail, MessageCircle } from 'lucide-react'

function formatWhatsApp(phone: string) {
  let p = phone.replace(/[\s\-\.\(\)]/g, '')
  if (p.startsWith('0')) p = '+33' + p.slice(1)
  return p
}

export default function QuoteActions({
  quoteId, status, clientEmail, clientPhone, quoteNumber, quoteTitle, companyName,
}: {
  quoteId: string
  status: string
  clientEmail?: string
  clientPhone?: string
  quoteNumber: string
  quoteTitle?: string
  companyName?: string
}) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)

  async function updateStatus(newStatus: string) {
    setLoading(newStatus)
    const supabase = createClient()
    await supabase.from('quotes').update({ status: newStatus }).eq('id', quoteId)
    toast.success(
      newStatus === 'accepte' ? 'Devis marqué comme accepté !' :
      newStatus === 'refuse' ? 'Devis marqué comme refusé' :
      newStatus === 'envoye' ? 'Devis marqué comme envoyé' : 'Statut mis à jour'
    )
    router.refresh()
    setLoading(null)
  }

  function handleDownloadPDF() {
    window.open(`/api/devis/${quoteId}/pdf`, '_blank')
  }

  async function handleSendEmail() {
    if (!clientEmail) { toast.error('Ce client n\'a pas d\'adresse email'); return }
    setLoading('email')
    const res = await fetch(`/api/devis/${quoteId}/envoyer`, { method: 'POST' })
    const json = await res.json()
    if (res.ok) {
      toast.success(`Devis envoyé à ${clientEmail} !`)
      router.refresh()
    } else {
      toast.error(json.error || 'Erreur envoi email')
    }
    setLoading(null)
  }

  function handleWhatsApp() {
    if (!clientPhone) { toast.error('Ce client n\'a pas de numéro de téléphone'); return }
    const phone = formatWhatsApp(clientPhone)
    const msg = encodeURIComponent(
      `Bonjour,\n\nJe vous transmets votre devis ${quoteNumber}${quoteTitle ? ` pour : ${quoteTitle}` : ''}.\n\nN'hésitez pas à me contacter pour toute question.\n\nCordialement,\n${companyName || ''}`
    )
    window.open(`https://wa.me/${phone}?text=${msg}`, '_blank')
  }

  async function handleTransformInvoice() {
    setLoading('facture')
    const res = await fetch(`/api/devis/${quoteId}/transformer`, { method: 'POST' })
    const data = await res.json()
    if (data.invoiceId) {
      toast.success('Facture créée !')
      router.push(`/factures/${data.invoiceId}`)
    } else {
      toast.error('Erreur lors de la transformation')
    }
    setLoading(null)
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" className="gap-2" onClick={handleDownloadPDF} disabled={!!loading}>
        <Download className="w-4 h-4" /> PDF
      </Button>

      <Button
        variant="outline"
        className="gap-2 border-blue-200 text-blue-700 hover:bg-blue-50"
        onClick={handleSendEmail}
        disabled={!!loading || !clientEmail}
        title={!clientEmail ? 'Aucun email pour ce client' : `Envoyer à ${clientEmail}`}
      >
        {loading === 'email' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
        Email
      </Button>

      <Button
        variant="outline"
        className="gap-2 border-green-200 text-green-700 hover:bg-green-50"
        onClick={handleWhatsApp}
        disabled={!!loading || !clientPhone}
        title={!clientPhone ? 'Aucun téléphone pour ce client' : `WhatsApp ${clientPhone}`}
      >
        <MessageCircle className="w-4 h-4" /> WhatsApp
      </Button>

      {status !== 'envoye' && status !== 'accepte' && status !== 'refuse' && status !== 'transforme' && (
        <Button variant="outline" className="gap-2" onClick={() => updateStatus('envoye')} disabled={!!loading}>
          <Send className="w-4 h-4" /> Marquer envoyé
        </Button>
      )}

      {(status === 'envoye' || status === 'pret') && (
        <>
          <Button className="gap-2 bg-green-600 hover:bg-green-700" onClick={() => updateStatus('accepte')} disabled={!!loading}>
            <CheckCircle className="w-4 h-4" /> Accepté
          </Button>
          <Button variant="outline" className="gap-2 border-red-200 text-red-600 hover:bg-red-50" onClick={() => updateStatus('refuse')} disabled={!!loading}>
            <XCircle className="w-4 h-4" /> Refusé
          </Button>
        </>
      )}

      {status === 'accepte' && (
        <Button className="gap-2 bg-purple-600 hover:bg-purple-700" onClick={handleTransformInvoice} disabled={!!loading}>
          {loading === 'facture' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
          Créer la facture
        </Button>
      )}
    </div>
  )
}
