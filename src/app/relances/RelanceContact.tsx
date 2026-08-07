'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Send, Mail, MessageCircle, MessageSquare } from 'lucide-react'
import { mailtoLink, smsLink } from '@/lib/avis'
import { waLink } from '@/lib/relance-messages'

type Props = {
  clientName: string
  email: string | null
  phone: string | null
  subject: string
  body: string
  sms: string
  /** Si fourni, ouvrir un canal marque le devis comme relancé (reminded_at). */
  markQuoteId?: string
}

// Ouvre le mail/WhatsApp/SMS avec un message déjà rédigé et personnalisé.
export default function RelanceContact({ clientName, email, phone, subject, body, sms, markQuoteId }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const wa = waLink(phone, sms)

  function openLink(href: string) {
    const a = document.createElement('a')
    a.href = href; a.target = '_blank'; a.rel = 'noopener'; a.click()
  }

  async function fire(href: string | null) {
    if (!href) return
    openLink(href)
    if (markQuoteId) {
      await createClient().from('quotes').update({ reminded_at: new Date().toISOString() }).eq('id', markQuoteId)
      router.refresh()
    }
    setOpen(false)
  }

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold text-primary border border-primary/40 bg-primary/[0.04] hover:bg-primary/10 transition-colors flex-shrink-0">
        <Send className="w-3.5 h-3.5" /> Relancer
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Relancer {clientName}</DialogTitle></DialogHeader>
          <p className="text-xs text-gray-500 -mt-1">Message pré-rédigé — relisez, puis envoyez :</p>
          <div className="rounded-xl bg-[#FBF7F0] border border-[#F0E7D8] p-3 text-sm text-gray-700 whitespace-pre-line max-h-56 overflow-y-auto">{body}</div>
          <div className="flex items-center gap-2 mt-1">
            <button onClick={() => fire(email ? mailtoLink(email, subject, body) : null)} disabled={!email}
              className="flex-1 inline-flex items-center justify-center gap-1.5 h-10 rounded-xl bg-primary text-white text-sm font-medium disabled:opacity-40">
              <Mail className="w-4 h-4" /> Email
            </button>
            <button onClick={() => fire(wa)} disabled={!wa}
              className="flex-1 inline-flex items-center justify-center gap-1.5 h-10 rounded-xl border border-[#25D366] text-[#128C3E] text-sm font-medium hover:bg-[#25D366]/10 disabled:opacity-40">
              <MessageCircle className="w-4 h-4" /> WhatsApp
            </button>
            <button onClick={() => fire(phone ? smsLink(phone, sms) : null)} disabled={!phone}
              className="flex-1 inline-flex items-center justify-center gap-1.5 h-10 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 disabled:opacity-40">
              <MessageSquare className="w-4 h-4" /> SMS
            </button>
          </div>
          {!email && !phone && <p className="text-[11px] text-gray-400">Aucun email ni téléphone pour ce client.</p>}
        </DialogContent>
      </Dialog>
    </>
  )
}
