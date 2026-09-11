'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { AlertTriangle, BadgeCheck, CircleAlert, Download, Info, Loader2, RefreshCw, Send } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { canSendAgain, isSettled, statusInfo, type StatusTone } from '@/lib/einvoicing/status'
import type { ComplianceIssue } from '@/lib/facturx/model'

export interface EInvoiceEvent { status: string; message: string | null; created_at: string }

type Props = {
  invoiceId: string
  status: string | null
  message: string | null
  sentAt: string | null
  platformName: string | null
  connected: boolean
  autoSend: boolean
  b2c: boolean
  cancelled: boolean
  issues: ComplianceIssue[]
  events: EInvoiceEvent[]
}

const TONE_BADGE: Record<StatusTone, 'info' | 'success' | 'warning' | 'destructive'> = {
  info: 'info', success: 'success', warning: 'warning', danger: 'destructive',
}

/** Bloc « Facture électronique » d'une facture : format Factur-X, conformité, transmission et statut. */
export default function EInvoicePanel(props: Props) {
  const router = useRouter()
  const [sending, setSending] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [issues, setIssues] = useState(props.issues)
  const errors = issues.filter(i => i.level === 'error')
  const warnings = issues.filter(i => i.level === 'warning')
  const info = statusInfo(props.status)
  const platform = props.platformName || 'votre plateforme agréée'

  // Statut en cours : on interroge la plateforme à l'ouverture de la facture.
  useEffect(() => {
    if (!props.status || isSettled(props.status)) return
    let alive = true
    fetch(`/api/factures/${props.invoiceId}/einvoice`)
      .then(r => r.json())
      .then(j => { if (alive && j?.changed) router.refresh() })
      .catch(() => undefined)
    return () => { alive = false }
  }, [props.invoiceId, props.status, router])

  async function refresh() {
    setRefreshing(true)
    const res = await fetch(`/api/factures/${props.invoiceId}/einvoice`)
    const json = await res.json().catch(() => ({}))
    setRefreshing(false)
    if (!res.ok) { toast.error(json.error || 'Plateforme injoignable'); return }
    if (json.changed) { toast.success('Statut mis à jour'); router.refresh() }
    else toast('Pas de changement pour le moment')
  }

  async function transmit() {
    setSending(true)
    const res = await fetch(`/api/factures/${props.invoiceId}/transmettre`, { method: 'POST' })
    const json = await res.json().catch(() => ({}))
    setSending(false)
    if (json.ok) { toast.success(`Facture déposée sur ${platform}`); router.refresh(); return }
    if (json.issues?.length) setIssues(json.issues)
    toast.error(json.error || 'Transmission impossible')
    router.refresh()
  }

  const sendButton = (label: string) => (
    <Button onClick={transmit} disabled={sending || errors.length > 0} className="gap-1.5">
      {sending ? <Loader2 className="animate-spin" /> : <Send />} {label}
    </Button>
  )

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="grid place-items-center w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 shrink-0">
              <BadgeCheck className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-marine flex items-center gap-2 flex-wrap">
                Facture électronique <Badge variant="success">Factur-X · EN 16931</Badge>
              </p>
              <p className="text-xs text-gray-500">PDF lisible avec ses données structurées intégrées, conforme à la réforme.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <a href={`/api/factures/${props.invoiceId}/pdf?format=pdf&download=1`} className={buttonVariants({ variant: 'outline', size: 'sm', className: 'gap-1.5' })}>
              <Download /> Factur-X
            </a>
            <a href={`/api/factures/${props.invoiceId}/pdf?format=xml`} className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'gap-1.5' })}>
              <Download /> XML
            </a>
          </div>
        </div>

        {props.b2c ? (
          <div className="flex items-start gap-2 rounded-xl bg-gray-50 px-3 py-2.5 text-sm text-gray-600">
            <Info className="w-4 h-4 mt-0.5 shrink-0 text-gray-400" />
            Client particulier : la facture ne passe pas par une plateforme agréée (réservé aux clients professionnels).
          </div>
        ) : info ? (
          <div className="rounded-xl border border-gray-200 p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant={TONE_BADGE[info.tone]}>{info.label}</Badge>
                <span className="text-xs text-gray-500">
                  via {platform}{props.sentAt ? ` · envoyée le ${formatDate(props.sentAt)}` : ''}
                </span>
              </div>
              <div className="flex gap-2">
                {!isSettled(props.status) && (
                  <Button size="sm" variant="ghost" onClick={refresh} disabled={refreshing} className="gap-1.5">
                    {refreshing ? <Loader2 className="animate-spin" /> : <RefreshCw />} Actualiser
                  </Button>
                )}
                {canSendAgain(props.status) && props.connected && !props.cancelled && sendButton('Renvoyer')}
              </div>
            </div>
            <p className="text-xs text-gray-500">{info.help}</p>
            {props.message && <p className="text-xs text-red-600">{props.message}</p>}
            {props.events.length > 1 && (
              <ol className="border-l border-gray-200 ml-1 pl-3 space-y-1">
                {props.events.map((e, i) => (
                  <li key={i} className="text-xs text-gray-500">
                    <span className="font-medium text-gray-700">{statusInfo(e.status)?.label || e.status}</span>
                    {' · '}{new Date(e.created_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                    {e.message ? ` — ${e.message}` : ''}
                  </li>
                ))}
              </ol>
            )}
          </div>
        ) : props.cancelled ? null : props.connected ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-gray-50 px-3 py-2.5">
            <p className="text-sm text-gray-600">
              {props.autoSend ? `Partira automatiquement vers ${platform} dès l’envoi au client.` : `Prête à être déposée sur ${platform}.`}
            </p>
            {sendButton('Transmettre maintenant')}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-gray-50 px-3 py-2.5">
            <p className="text-sm text-gray-600">Connectez votre plateforme agréée pour transmettre vos factures électroniques.</p>
            <Link href="/parametres/facturation-electronique" className={buttonVariants({ variant: 'outline' })}>Connecter ma plateforme</Link>
          </div>
        )}

        {errors.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm font-semibold text-amber-800 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" /> {props.b2c ? 'Informations à compléter' : 'À compléter avant la transmission'}
            </p>
            <ul className="mt-1.5 space-y-1">
              {errors.map((i, k) => (
                <li key={k} className="text-sm text-amber-800">
                  {i.message}{' '}
                  {i.fix && <Link href={i.fix.href} className="font-medium underline underline-offset-2">{i.fix.label}</Link>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {warnings.length > 0 && (
          <ul className="space-y-1">
            {warnings.map((i, k) => (
              <li key={k} className="text-xs text-gray-500 flex gap-1.5">
                <CircleAlert className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-500" />
                <span>
                  {i.message}{' '}
                  {i.fix && <Link href={i.fix.href} className="text-primary hover:underline">{i.fix.label}</Link>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
