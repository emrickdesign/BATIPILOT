import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Download, Send, Edit, CheckCircle, XCircle, FileText } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import QuoteActions from './QuoteActions'
import SignatureStatus from '@/components/SignatureStatus'

const statusLabels: Record<string, string> = {
  brouillon: 'Brouillon', pret: 'Prêt à envoyer', envoye: 'Envoyé',
  accepte: 'Accepté ✓', refuse: 'Refusé', expire: 'Expiré', transforme: 'Transformé en facture',
}
const statusColors: Record<string, string> = {
  brouillon: 'bg-gray-100 text-gray-700', pret: 'bg-blue-100 text-blue-700',
  envoye: 'bg-yellow-100 text-yellow-700', accepte: 'bg-green-100 text-green-700',
  refuse: 'bg-red-100 text-red-700', expire: 'bg-red-50 text-red-500',
  transforme: 'bg-purple-100 text-purple-700',
}
const unitLabels: Record<string, string> = {
  m2: 'm²', ml: 'ml', u: 'unité', forfait: 'forfait', h: 'heure', j: 'jour', piece: 'pièce'
}

export default async function DevisDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: quote } = await supabase
    .from('quotes')
    .select('*, clients(*), quote_lines(*)')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!quote) return notFound()

  const { data: company } = await supabase
    .from('companies')
    .select('*')
    .eq('user_id', user.id)
    .single()

  const { data: signature } = await supabase
    .from('document_signatures')
    .select('*')
    .eq('quote_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const client = quote.clients as any
  const lines = (quote.quote_lines as any[]).sort((a, b) => a.sort_order - b.sort_order)
  const clientName = client?.type === 'professionnel'
    ? client.company_name
    : `${client?.first_name || ''} ${client?.last_name || ''}`.trim() || 'Client'

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/devis">
            <Button variant="ghost" size="sm" className="gap-1">
              <ArrowLeft className="w-4 h-4" /> Retour
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-gray-400">{quote.quote_number}</span>
              <Badge className={`${statusColors[quote.status]} border-0 text-xs`}>
                {statusLabels[quote.status]}
              </Badge>
            </div>
            <h1 className="text-xl font-bold text-gray-900">{clientName}</h1>
          </div>
        </div>
        <Link href={`/devis/${id}/modifier`}>
          <Button variant="outline" size="sm" className="gap-1">
            <Edit className="w-4 h-4" /> Modifier
          </Button>
        </Link>
      </div>

      {/* Actions principales */}
      <QuoteActions
        quoteId={id}
        status={quote.status}
        clientId={client?.id}
        clientStatus={client?.status}
        clientEmail={client?.email}
        clientPhone={client?.phone}
        projectId={quote.project_id}
        quoteNumber={quote.quote_number}
        quoteTitle={quote.title}
        companyName={company?.trade_name}
        marketHt={Number(quote.subtotal_ht) || 0}
        marketTtc={Number(quote.total_ttc) || 0}
      />

      <SignatureStatus signature={signature} />

      {/* Aperçu du devis */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-base">Aperçu du devis</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-4">
          {/* En-tête */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="font-semibold text-gray-900">{company?.trade_name || 'Votre entreprise'}</p>
              {company?.address && <p className="text-gray-500">{company.address}</p>}
              {company?.phone && <p className="text-gray-500">{company.phone}</p>}
              {company?.siret && <p className="text-gray-400 text-xs">SIRET : {company.siret}</p>}
            </div>
            <div className="text-right">
              <p className="font-semibold">{clientName}</p>
              {client?.phone && <p className="text-gray-500">{client.phone}</p>}
              {client?.email && <p className="text-gray-500">{client.email}</p>}
              {client?.billing_address && <p className="text-gray-500 text-xs">{client.billing_address}</p>}
            </div>
          </div>

          <div className="border-t pt-3 text-sm text-gray-600 grid grid-cols-2 gap-2">
            <div>Date : <span className="font-medium text-gray-900">{formatDate(quote.issue_date)}</span></div>
            <div>Validité : <span className="font-medium text-gray-900">{quote.valid_until ? formatDate(quote.valid_until) : '—'}</span></div>
            {quote.title && <div className="col-span-2">Objet : <span className="font-medium text-gray-900">{quote.title}</span></div>}
            {quote.description && <div className="col-span-2 text-gray-500 italic">{quote.description}</div>}
            {client?.site_address && <div className="col-span-2">Chantier : <span className="font-medium text-gray-900">{client.site_address}</span></div>}
          </div>

          {/* Lignes */}
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Désignation</th>
                  <th className="text-right px-2 py-2 font-medium text-gray-600 w-16">Qté</th>
                  <th className="text-right px-2 py-2 font-medium text-gray-600 w-16">Unité</th>
                  <th className="text-right px-2 py-2 font-medium text-gray-600 w-20">P.U. HT</th>
                  <th className="text-right px-2 py-2 font-medium text-gray-600 w-10">TVA</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600 w-24">Total HT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lines.map((line: any) => (
                  <tr key={line.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <div className="font-medium text-gray-900">{line.designation}</div>
                      {line.description && <div className="text-xs text-gray-400">{line.description}</div>}
                      {line.needs_verification && (
                        <div className="text-xs text-primary">⚠ À vérifier (issu d&apos;analyse plan)</div>
                      )}
                    </td>
                    <td className="text-right px-2 py-2 text-gray-700">{line.quantity}</td>
                    <td className="text-right px-2 py-2 text-gray-500">{unitLabels[line.unit] || line.unit}</td>
                    <td className="text-right px-2 py-2 text-gray-700">{formatCurrency(line.unit_price_ht)}</td>
                    <td className="text-right px-2 py-2 text-gray-500">{line.vat_rate}%</td>
                    <td className="text-right px-3 py-2 font-semibold text-gray-900">{formatCurrency(line.total_ht)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totaux */}
          <div className="flex justify-end">
            <div className="w-64 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Total HT</span>
                <span className="font-medium">{formatCurrency(quote.subtotal_ht)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">TVA</span>
                <span>{formatCurrency(quote.total_vat)}</span>
              </div>
              <div className="flex justify-between font-bold text-base border-t pt-1">
                <span>Total TTC</span>
                <span>{formatCurrency(quote.total_ttc)}</span>
              </div>
              {quote.deposit_amount && (
                <div className="flex justify-between text-blue-600 border-t pt-1">
                  <span>Acompte ({quote.deposit_percent}%)</span>
                  <span className="font-semibold">{formatCurrency(quote.deposit_amount)}</span>
                </div>
              )}
            </div>
          </div>

          {quote.notes && (
            <div className="text-sm text-gray-500 border-t pt-3">
              <p className="font-medium text-gray-700 mb-1">Notes :</p>
              <p>{quote.notes}</p>
            </div>
          )}
          {quote.legal_mentions && (
            <div className="text-xs text-gray-400 border-t pt-3">{quote.legal_mentions}</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
