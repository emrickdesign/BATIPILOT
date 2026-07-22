'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Download, Send, CheckCircle, XCircle, Loader2, Mail, MessageCircle, HardHat } from 'lucide-react'
import FacturationPanel from './FacturationPanel'

function formatWhatsApp(phone: string) {
  let p = phone.replace(/[\s\-.()]/g, '')
  if (p.startsWith('0')) p = '+33' + p.slice(1)
  return p
}

export default function QuoteActions({
  quoteId, status, clientId, clientEmail, clientPhone, projectId, quoteNumber, quoteTitle, companyName, marketHt, marketTtc,
}: {
  quoteId: string
  status: string
  clientId?: string
  clientStatus?: string
  clientEmail?: string
  clientPhone?: string
  projectId?: string | null
  quoteNumber: string
  quoteTitle?: string
  companyName?: string
  marketHt: number
  marketTtc: number
}) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)

  async function updateStatus(newStatus: string) {
    setLoading(newStatus)
    const supabase = createClient()
    await supabase.from('quotes').update({ status: newStatus }).eq('id', quoteId)
    // Fait avancer le prospect dans le pipeline (board Prospects) en fonction du devis.
    if (clientId) {
      if (newStatus === 'envoye') {
        await supabase.from('clients').update({ status: 'devis_envoye' })
          .eq('id', clientId).in('status', ['nouveau', 'infos_a_recuperer', 'devis_a_faire'])
      } else if (newStatus === 'accepte') {
        await supabase.from('clients').update({ status: 'devis_accepte' })
          .eq('id', clientId).in('status', ['nouveau', 'infos_a_recuperer', 'devis_a_faire', 'devis_envoye', 'devis_refuse'])
      }
    }
    toast.success(
      newStatus === 'accepte' ? 'Devis accepté !' :
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
    if (res.ok) { toast.success(`Devis envoyé à ${clientEmail} !`); router.refresh() }
    else { toast.error(json.error || 'Erreur envoi email') }
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

  async function handleCreateChantier() {
    setLoading('chantier')
    const res = await fetch(`/api/devis/${quoteId}/creer-chantier`, { method: 'POST' })
    const data = await res.json()
    if (data.projectId) {
      toast.success(data.existing ? 'Chantier déjà rattaché' : 'Chantier créé (à planifier) !')
      router.push(`/chantiers/${data.projectId}`)
    } else { toast.error(data.error || 'Erreur création chantier') }
    setLoading(null)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button variant="info" className="gap-2" onClick={handleDownloadPDF} disabled={!!loading}>
          <Download className="w-4 h-4" /> PDF
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

        {status !== 'envoye' && status !== 'accepte' && status !== 'refuse' && status !== 'transforme' && (
          <Button variant="success" className="gap-2" onClick={() => updateStatus('envoye')} disabled={!!loading}>
            <Send className="w-4 h-4" /> Marquer envoyé
          </Button>
        )}

        {(status === 'envoye' || status === 'pret' || status === 'expire') && (
          <>
            <Button variant="success" className="gap-2" onClick={() => updateStatus('accepte')} disabled={!!loading}>
              {loading === 'accepte' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Accepté
            </Button>
            <Button variant="destructive" className="gap-2" onClick={() => updateStatus('refuse')} disabled={!!loading}>
              <XCircle className="w-4 h-4" /> Refusé
            </Button>
          </>
        )}
      </div>

      {/* §7.4 — Prochaines étapes après acceptation */}
      {status === 'accepte' && (
        <div className="rounded-xl border border-green-200 bg-green-50/60 p-3">
          <p className="text-sm font-semibold text-green-800 mb-2">Devis accepté 🎉 — prochaines étapes</p>
          <div className="flex flex-wrap gap-2 items-start">
            {projectId ? (
              <Link href={`/chantiers/${projectId}`}>
                <Button variant="outline" className="gap-2"><HardHat className="w-4 h-4" /> Voir le chantier</Button>
              </Link>
            ) : (
              <Button variant="outline" className="gap-2" onClick={handleCreateChantier} disabled={!!loading}>
                {loading === 'chantier' ? <Loader2 className="w-4 h-4 animate-spin" /> : <HardHat className="w-4 h-4" />} Créer le chantier (à planifier)
              </Button>
            )}
            <FacturationPanel quoteId={quoteId} marketHt={marketHt} marketTtc={marketTtc} />
          </div>
        </div>
      )}
    </div>
  )
}
