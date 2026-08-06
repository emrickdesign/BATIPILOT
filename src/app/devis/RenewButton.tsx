'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Mail, MessageCircle, RefreshCw, Pencil } from 'lucide-react'
import { toast } from 'sonner'

/** Devis expiré → popup : renvoyer le même devis (email/WhatsApp) OU le modifier avant d'envoyer. */
export default function RenewButton({ quoteId, clientPhone }: { quoteId: string; clientPhone: string | null }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<null | 'email' | 'whatsapp' | 'draft'>(null)

  async function renew(channel: 'email' | 'whatsapp' | 'draft') {
    setBusy(channel)
    try {
      const res = await fetch(`/api/devis/${quoteId}/renouveler`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data?.error || 'Erreur'); return }
      if (channel === 'draft') {
        toast.success('Nouveau devis créé — à modifier')
        if (data.newId) router.push(`/devis/${data.newId}`)
        return
      }
      if (channel === 'whatsapp') {
        if (data.waHref) window.open(data.waHref, '_blank'); else toast.error('Numéro WhatsApp manquant')
        toast.success('Nouveau devis créé')
      } else {
        toast.success('Nouveau devis créé et envoyé par email')
      }
      setOpen(false)
      router.refresh()
    } catch { toast.error('Erreur réseau') } finally { setBusy(null) }
  }

  return (
    <div className="mt-3 pt-2.5 border-t border-[#F4CFC5]" onClick={e => e.stopPropagation()}>
      <button
        onClick={() => setOpen(true)}
        className="w-full inline-flex items-center justify-center gap-1.5 h-8 rounded-lg border border-[#C0392B] text-[#C0392B] text-[12px] font-semibold hover:bg-[#C0392B]/[0.06]"
      >
        <RefreshCw className="w-3.5 h-3.5" /> Expiré — renouveler et renvoyer
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md" onClick={e => e.stopPropagation()}>
          <DialogHeader><DialogTitle>Renouveler le devis</DialogTitle></DialogHeader>
          <p className="text-xs text-gray-500 -mt-1">Recrée un devis identique avec de nouvelles dates.</p>

          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Renvoyer à l&apos;identique</p>
            <div className="flex items-center gap-2">
              <button onClick={() => renew('email')} disabled={!!busy}
                className="flex-1 inline-flex items-center justify-center gap-1.5 h-10 rounded-xl bg-primary text-white text-sm font-medium disabled:opacity-40">
                <Mail className="w-4 h-4" /> {busy === 'email' ? '…' : 'Par email'}
              </button>
              <button onClick={() => renew('whatsapp')} disabled={!clientPhone || !!busy}
                className="flex-1 inline-flex items-center justify-center gap-1.5 h-10 rounded-xl border border-[#25D366] text-[#128C3E] text-sm font-medium hover:bg-[#25D366]/10 disabled:opacity-40">
                <MessageCircle className="w-4 h-4" /> {busy === 'whatsapp' ? '…' : 'WhatsApp'}
              </button>
            </div>
          </div>

          <div className="pt-1 border-t border-gray-100 space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Ou d&apos;abord le modifier</p>
            <button onClick={() => renew('draft')} disabled={!!busy}
              className="w-full inline-flex items-center justify-center gap-1.5 h-10 rounded-xl border border-gray-300 text-gray-700 text-sm font-medium hover:border-gray-400 disabled:opacity-40">
              <Pencil className="w-4 h-4" /> {busy === 'draft' ? '…' : 'Modifier avant d\'envoyer'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
