import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import InvoiceActions from './InvoiceActions'
import SignatureStatus from '@/components/SignatureStatus'

const statusLabels: Record<string, string> = {
  brouillon: 'À préparer', envoyee: 'Envoyée', payee_partiellement: 'Partiellement payée',
  payee: 'Payée ✓', en_retard: 'En retard ⚠', annulee: 'Annulée',
}
const today = new Date().toISOString().split('T')[0]
const statusColors: Record<string, string> = {
  brouillon: 'bg-gray-100 text-gray-700', envoyee: 'bg-blue-100 text-blue-700',
  payee_partiellement: 'bg-yellow-100 text-yellow-700', payee: 'bg-green-100 text-green-700',
  en_retard: 'bg-red-100 text-red-700', annulee: 'bg-gray-100 text-gray-400',
}

export default async function FactureDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: invoice } = await supabase
    .from('invoices')
    .select('*, clients(*), invoice_lines(*)')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!invoice) return notFound()

  const { data: company } = await supabase.from('companies').select('*').eq('user_id', user.id).single()

  const { data: signature } = await supabase
    .from('document_signatures')
    .select('*')
    .eq('invoice_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const client = invoice.clients as any
  const lines = (invoice.invoice_lines as any[]).sort((a, b) => a.sort_order - b.sort_order)
  const clientName = client?.type === 'professionnel'
    ? client.company_name
    : `${client?.first_name || ''} ${client?.last_name || ''}`.trim() || 'Client'

  const unitLabels: Record<string, string> = {
    m2: 'm²', ml: 'ml', u: 'unité', forfait: 'forfait', h: 'heure', j: 'jour', piece: 'pièce'
  }

  const dispStatus = (invoice.status === 'envoyee' || invoice.status === 'payee_partiellement') && invoice.due_date && invoice.due_date < today
    ? 'en_retard' : invoice.status

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/factures">
            <Button variant="ghost" size="sm" className="gap-1">
              <ArrowLeft className="w-4 h-4" /> Retour
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-gray-400">{invoice.invoice_number}</span>
              <Badge className={`${statusColors[dispStatus]} border-0 text-xs`}>
                {statusLabels[dispStatus]}
              </Badge>
              {invoice.type && invoice.type !== 'complete' && (
                <Badge className="bg-purple-100 text-purple-700 border-0 text-xs">
                  {invoice.type === 'acompte' ? 'Acompte' : invoice.type === 'solde' ? 'Solde' : `Situation n°${invoice.situation_number || ''}`}
                  {invoice.billed_percent ? ` · ${invoice.billed_percent} %` : ''}
                </Badge>
              )}
            </div>
            <h1 className="text-xl font-bold text-gray-900">{clientName}</h1>
          </div>
        </div>
      </div>

      <InvoiceActions
        invoiceId={id}
        status={invoice.status}
        invoiceNumber={invoice.invoice_number}
        clientId={client?.id}
        clientEmail={client?.email}
        clientPhone={client?.phone}
        clientName={clientName}
        companyName={company?.trade_name}
        issueDate={invoice.issue_date}
        subtotalHt={invoice.subtotal_ht}
        totalVat={invoice.total_vat}
        totalTtc={invoice.total_ttc}
        amountDue={invoice.amount_due}
      />

      <SignatureStatus signature={signature} />

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="font-semibold">{company?.trade_name || 'Votre entreprise'}</p>
              {company?.address && <p className="text-gray-500">{company.address}</p>}
            </div>
            <div className="text-right">
              <p className="font-semibold">{clientName}</p>
              {client?.email && <p className="text-gray-500">{client.email}</p>}
            </div>
          </div>

          <div className="text-sm text-gray-600 grid grid-cols-2 gap-2 border-t pt-3">
            <div>Date : <span className="font-medium text-gray-900">{formatDate(invoice.issue_date)}</span></div>
            {invoice.due_date && <div>Échéance : <span className="font-medium text-gray-900">{formatDate(invoice.due_date)}</span></div>}
          </div>

          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Désignation</th>
                  <th className="text-right px-2 py-2 font-medium text-gray-600 w-16">Qté</th>
                  <th className="text-right px-2 py-2 font-medium text-gray-600 w-20">P.U. HT</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600 w-24">Total HT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lines.map((l: any) => (
                  <tr key={l.id}>
                    <td className="px-3 py-2">
                      <div className="font-medium">{l.designation}</div>
                      {l.description && <div className="text-xs text-gray-400">{l.description}</div>}
                    </td>
                    <td className="text-right px-2 py-2">{l.quantity} {unitLabels[l.unit] || l.unit}</td>
                    <td className="text-right px-2 py-2">{formatCurrency(l.unit_price_ht)}</td>
                    <td className="text-right px-3 py-2 font-semibold">{formatCurrency(l.total_ht)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <div className="w-64 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Total HT</span><span>{formatCurrency(invoice.subtotal_ht)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">TVA</span><span>{formatCurrency(invoice.total_vat)}</span></div>
              <div className="flex justify-between font-bold text-base border-t pt-1"><span>Total TTC</span><span>{formatCurrency(invoice.total_ttc)}</span></div>
              {invoice.deposit_already_paid > 0 && (
                <div className="flex justify-between text-gray-500"><span>Acompte versé</span><span>- {formatCurrency(invoice.deposit_already_paid)}</span></div>
              )}
              {invoice.retention_amount > 0 && (
                <div className="flex justify-between text-orange-600"><span>Retenue de garantie ({invoice.retention_pct} %)</span><span>- {formatCurrency(invoice.retention_amount)}</span></div>
              )}
              <div className="flex justify-between font-bold text-blue-700 border-t pt-1"><span>Net à payer</span><span>{formatCurrency(invoice.amount_due)}</span></div>
            </div>
          </div>
          {invoice.legal_mentions && <div className="text-xs text-gray-400 border-t pt-3">{invoice.legal_mentions}</div>}
        </CardContent>
      </Card>
    </div>
  )
}
