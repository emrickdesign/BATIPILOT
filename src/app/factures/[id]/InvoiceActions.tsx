'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Download, CheckCircle, Send, Loader2 } from 'lucide-react'

export default function InvoiceActions({ invoiceId, status, invoiceNumber }: {
  invoiceId: string; status: string; invoiceNumber: string
}) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)

  async function updateStatus(newStatus: string) {
    setLoading(newStatus)
    const supabase = createClient()
    await supabase.from('invoices').update({ status: newStatus }).eq('id', invoiceId)
    toast.success(newStatus === 'payee' ? 'Facture marquée comme payée !' : 'Statut mis à jour')
    router.refresh()
    setLoading(null)
  }

  async function handleDownload() {
    setLoading('pdf')
    try {
      const res = await fetch(`/api/factures/${invoiceId}/pdf`)
      const html = await res.text()
      const win = window.open('', '_blank')
      if (win) {
        win.document.write(html)
        win.document.close()
        setTimeout(() => win.print(), 500)
      }
    } catch {
      toast.error('Erreur PDF')
    }
    setLoading(null)
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" className="gap-2" onClick={handleDownload} disabled={!!loading}>
        {loading === 'pdf' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
        Télécharger / Imprimer
      </Button>
      {status === 'brouillon' && (
        <Button variant="outline" className="gap-2" onClick={() => updateStatus('envoyee')} disabled={!!loading}>
          <Send className="w-4 h-4" /> Marquer comme envoyée
        </Button>
      )}
      {(status === 'envoyee' || status === 'en_retard' || status === 'payee_partiellement') && (
        <Button className="gap-2 bg-green-600 hover:bg-green-700" onClick={() => updateStatus('payee')} disabled={!!loading}>
          <CheckCircle className="w-4 h-4" /> Marquer comme payée
        </Button>
      )}
    </div>
  )
}
