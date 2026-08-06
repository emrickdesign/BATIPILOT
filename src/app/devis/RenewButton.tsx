'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, MessageCircle, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

/** Devis expiré → régénère un devis identique (nouvelles dates) et l'envoie (email/WhatsApp). */
export default function RenewButton({ quoteId, clientPhone }: { quoteId: string; clientPhone: string | null }) {
  const router = useRouter()
  const [busy, setBusy] = useState<null | 'email' | 'whatsapp'>(null)

  async function renew(channel: 'email' | 'whatsapp') {
    setBusy(channel)
    try {
      const res = await fetch(`/api/devis/${quoteId}/renouveler`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data?.error || 'Erreur'); return }
      if (channel === 'whatsapp') {
        if (data.waHref) window.open(data.waHref, '_blank')
        else toast.error('Numéro WhatsApp manquant')
        toast.success('Nouveau devis créé')
      } else {
        toast.success('Nouveau devis créé et envoyé par email')
      }
      router.refresh()
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mt-3 pt-2.5 border-t border-[#F4CFC5]" onClick={e => e.stopPropagation()}>
      <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[#C0392B] mb-1.5"><RefreshCw className="w-3 h-3" /> Expiré — renouveler et renvoyer</p>
      <div className="flex items-center gap-1.5">
        <button onClick={() => renew('email')} disabled={!!busy}
          className="flex-1 inline-flex items-center justify-center gap-1.5 h-8 rounded-lg bg-[#C0392B] text-white text-[12px] font-semibold hover:bg-[#A82F23] disabled:opacity-50">
          <Mail className="w-3.5 h-3.5" /> {busy === 'email' ? '…' : 'Email'}
        </button>
        {clientPhone && (
          <button onClick={() => renew('whatsapp')} disabled={!!busy}
            className="flex-1 inline-flex items-center justify-center gap-1.5 h-8 rounded-lg border border-[#25D366] text-[#128C3E] text-[12px] font-semibold hover:bg-[#25D366]/10 disabled:opacity-50">
            <MessageCircle className="w-3.5 h-3.5" /> {busy === 'whatsapp' ? '…' : 'WhatsApp'}
          </button>
        )}
      </div>
    </div>
  )
}
