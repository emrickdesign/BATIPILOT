'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Mail, MessageSquare, Check, Star, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { reviewSms, reviewEmailSubject, reviewEmailBody, mailtoLink, smsLink } from '@/lib/avis'

export type AvisRow = {
  clientId: string
  clientName: string
  email: string | null
  phone: string | null
  projectTitle: string
  requestedAt: string | null
}

export default function AvisClient({
  companyName, reviewUrl, toAsk, done,
}: { companyName: string | null; reviewUrl: string; toAsk: AvisRow[]; done: AvisRow[] }) {
  const router = useRouter()
  const [pending, setPending] = useState<AvisRow[]>(toAsk)
  const [history, setHistory] = useState<AvisRow[]>(done)
  const [busy, setBusy] = useState<string | null>(null)

  async function mark(row: AvisRow, requested: boolean) {
    setBusy(row.clientId)
    const supabase = createClient()
    const { error } = await supabase.from('clients')
      .update({ review_requested_at: requested ? new Date().toISOString() : null })
      .eq('id', row.clientId)
    setBusy(null)
    if (error) { toast.error('Enregistrement impossible'); return }
    if (requested) {
      setPending(prev => prev.filter(r => r.clientId !== row.clientId))
      setHistory(prev => [{ ...row, requestedAt: new Date().toISOString() }, ...prev])
    } else {
      setHistory(prev => prev.filter(r => r.clientId !== row.clientId))
      setPending(prev => [{ ...row, requestedAt: null }, ...prev])
    }
    router.refresh()
  }

  // Ouvre un lien mailto:/sms: via un clic d'ancre (fiable sur mobile).
  function openLink(href: string) {
    const a = document.createElement('a')
    a.href = href
    a.rel = 'noopener'
    a.click()
  }
  function sendEmail(row: AvisRow) {
    if (!row.email) return
    openLink(mailtoLink(row.email, reviewEmailSubject(companyName), reviewEmailBody(companyName, row.clientName, reviewUrl)))
    mark(row, true)
  }
  function sendSms(row: AvisRow) {
    if (!row.phone) return
    openLink(smsLink(row.phone, reviewSms(companyName, row.clientName, reviewUrl)))
    mark(row, true)
  }

  const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('fr-FR') : ''

  return (
    <div className="space-y-5">
      {/* À demander */}
      <Card className="border-0 shadow-[var(--shadow-sm)]">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Star className="w-4 h-4 text-amber-500" /> À demander
            {pending.length > 0 && <span className="text-sm font-normal text-gray-500">· {pending.length}</span>}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {pending.length === 0 ? (
            <p className="text-sm text-gray-400 py-3">Tous les clients de vos chantiers terminés ont déjà reçu une demande. 👌</p>
          ) : (
            <div className="space-y-2">
              {pending.map(row => (
                <div key={row.clientId} className="flex items-center gap-3 rounded-xl border border-gray-100 px-3 py-2.5 flex-wrap hover:border-gray-200 transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-marine truncate">{row.clientName}</p>
                    <p className="text-xs text-gray-400 truncate">Chantier : {row.projectTitle}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" disabled={!row.email || busy === row.clientId} onClick={() => sendEmail(row)}
                      title={row.email ? `Email à ${row.email}` : 'Aucun email pour ce client'}>
                      <Mail className="w-4 h-4 mr-1.5" /> Email
                    </Button>
                    <Button size="sm" disabled={!row.phone || busy === row.clientId} onClick={() => sendSms(row)}
                      title={row.phone ? `SMS au ${row.phone}` : 'Aucun mobile pour ce client'}>
                      <MessageSquare className="w-4 h-4 mr-1.5" /> SMS
                    </Button>
                    <Button size="sm" variant="ghost" className="text-gray-400 hover:text-gray-700" disabled={busy === row.clientId}
                      onClick={() => mark(row, true)} title="Marquer comme demandé sans envoyer">
                      <Check className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Déjà demandés */}
      {history.length > 0 && (
        <Card className="border-0 shadow-[var(--shadow-sm)]">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-base flex items-center gap-2"><Check className="w-4 h-4 text-emerald-500" /> Déjà demandés <span className="text-sm font-normal text-gray-500">· {history.length}</span></CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="space-y-1.5">
              {history.map(row => (
                <div key={row.clientId} className="flex items-center gap-3 px-2 py-2">
                  <span className="grid place-items-center w-7 h-7 rounded-full bg-emerald-50 text-emerald-600 flex-shrink-0"><Check className="w-3.5 h-3.5" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-700 truncate">{row.clientName}</p>
                    <p className="text-xs text-gray-400">Demandé le {fmt(row.requestedAt)}</p>
                  </div>
                  <Button size="sm" variant="ghost" className="text-gray-400 hover:text-gray-700" disabled={busy === row.clientId}
                    onClick={() => mark(row, false)} title="Remettre dans la liste à demander">
                    <RotateCcw className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
