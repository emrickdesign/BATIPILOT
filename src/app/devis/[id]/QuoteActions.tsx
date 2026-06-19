'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Download, Send, CheckCircle, XCircle, FileText, Loader2 } from 'lucide-react'

export default function QuoteActions({
  quoteId, status, clientEmail, quoteNumber,
}: {
  quoteId: string
  status: string
  clientEmail?: string
  quoteNumber: string
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

  async function handleDownloadPDF() {
    setLoading('pdf')
    try {
      const res = await fetch(`/api/devis/${quoteId}/pdf`)
      if (!res.ok) throw new Error('Erreur génération PDF')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${quoteNumber}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Erreur lors de la génération du PDF')
    }
    setLoading(null)
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
      <Button
        variant="outline"
        className="gap-2"
        onClick={handleDownloadPDF}
        disabled={!!loading}
      >
        {loading === 'pdf' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
        Télécharger PDF
      </Button>

      {status !== 'envoye' && status !== 'accepte' && status !== 'refuse' && status !== 'transforme' && (
        <Button
          variant="outline"
          className="gap-2"
          onClick={() => updateStatus('envoye')}
          disabled={!!loading}
        >
          <Send className="w-4 h-4" />
          Marquer comme envoyé
        </Button>
      )}

      {(status === 'envoye' || status === 'pret') && (
        <>
          <Button
            className="gap-2 bg-green-600 hover:bg-green-700"
            onClick={() => updateStatus('accepte')}
            disabled={!!loading}
          >
            <CheckCircle className="w-4 h-4" />
            Devis accepté
          </Button>
          <Button
            variant="outline"
            className="gap-2 border-red-200 text-red-600 hover:bg-red-50"
            onClick={() => updateStatus('refuse')}
            disabled={!!loading}
          >
            <XCircle className="w-4 h-4" />
            Devis refusé
          </Button>
        </>
      )}

      {status === 'accepte' && (
        <Button
          className="gap-2 bg-purple-600 hover:bg-purple-700"
          onClick={handleTransformInvoice}
          disabled={!!loading}
        >
          {loading === 'facture' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
          Créer la facture
        </Button>
      )}
    </div>
  )
}
