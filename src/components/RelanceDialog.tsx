'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { relanceCopy } from '@/lib/relances'
import { Send, Mail, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'

type Props = {
  quoteId: string
  clientName: string
  phone: string | null
  email: string | null
  issueDate: string | null
  validUntil: string | null
  dot: string
  /** Jours restants avant la fin de validité (affiché au-dessus du bouton). */
  daysLeft?: number | null
}

/** Bouton "Relancer le client" + popup : choix email/WhatsApp, message adapté à la validité. */
export default function RelanceDialog({ quoteId, clientName, phone, email, issueDate, validUntil, dot, daysLeft }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<null | 'email' | 'whatsapp'>(null)

  const line = relanceCopy(issueDate, validUntil)
  const preview = `Bonjour ${clientName}, ${line} Merci de le signer pour valider votre projet.`
  const urgent = daysLeft != null && daysLeft <= 3

  async function relance(channel: 'email' | 'whatsapp') {
    setBusy(channel)
    try {
      const res = await fetch(`/api/devis/${quoteId}/relancer`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data?.error || 'Erreur'); return }
      if (channel === 'whatsapp') {
        if (data.waHref) window.open(data.waHref, '_blank'); else toast.error('Numéro WhatsApp manquant')
        toast.success('Relance WhatsApp prête')
      } else {
        toast.success('Relance envoyée par email')
      }
      setOpen(false)
      router.refresh()
    } catch { toast.error('Erreur réseau') } finally { setBusy(null) }
  }

  return (
    <div className="mt-3" onClick={e => e.stopPropagation()}>
      {daysLeft != null && (
        <p className={`text-[11px] font-semibold mb-1.5 flex items-center gap-1.5 ${urgent ? 'text-[#C0392B]' : 'text-gray-500'}`}>
          <Send className="w-3 h-3 flex-shrink-0" />
          Relance {daysLeft > 0 ? `— encore ${daysLeft} j de validité` : "— dernier jour de validité"}
        </p>
      )}
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-1.5 min-h-[34px] px-3 py-1.5 rounded-lg text-[12.5px] font-semibold leading-tight border transition-colors hover:bg-black/[0.02]"
        style={{ borderColor: dot, color: dot }}
      >
        <Send className="w-3.5 h-3.5 flex-shrink-0" /><span>Relancer le client</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md" onClick={e => e.stopPropagation()}>
          <DialogHeader><DialogTitle>Relancer {clientName}</DialogTitle></DialogHeader>
          <p className="text-xs text-gray-500 -mt-1">Message adapté à la validité du devis :</p>
          <div className="rounded-xl bg-[#FBF7F0] border border-[#F0E7D8] p-3 text-sm text-gray-700">{preview}<br /><span className="text-gray-400">— lien de signature ajouté automatiquement</span></div>
          <div className="flex items-center gap-2 mt-1">
            <button onClick={() => relance('email')} disabled={!email || !!busy}
              className="flex-1 inline-flex items-center justify-center gap-1.5 h-10 rounded-xl bg-primary text-white text-sm font-medium disabled:opacity-40">
              <Mail className="w-4 h-4" /> {busy === 'email' ? '…' : 'Par email'}
            </button>
            <button onClick={() => relance('whatsapp')} disabled={!phone || !!busy}
              className="flex-1 inline-flex items-center justify-center gap-1.5 h-10 rounded-xl border border-[#25D366] text-[#128C3E] text-sm font-medium hover:bg-[#25D366]/10 disabled:opacity-40">
              <MessageCircle className="w-4 h-4" /> {busy === 'whatsapp' ? '…' : 'WhatsApp'}
            </button>
          </div>
          {!email && <p className="text-[11px] text-gray-400">Pas d&apos;email pour ce client — WhatsApp uniquement.</p>}
        </DialogContent>
      </Dialog>
    </div>
  )
}
