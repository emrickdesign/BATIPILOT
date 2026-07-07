import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/service'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { CheckCircle, Clock, XCircle } from 'lucide-react'
import SignatureForm from './SignatureForm'

const unitLabels: Record<string, string> = {
  m2: 'm²', ml: 'ml', u: 'unité', forfait: 'forfait', h: 'heure', j: 'jour', piece: 'pièce'
}

export default async function SignaturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const service = createServiceClient()

  const { data: sig } = await service.from('document_signatures').select('*').eq('id', id).single()
  if (!sig) return notFound()

  let status = sig.status as string
  if (status === 'en_attente' && sig.expires_at && new Date(sig.expires_at) < new Date()) {
    await service.from('document_signatures').update({ status: 'expiree' }).eq('id', id)
    status = 'expiree'
  }

  let document: any = null
  let lines: any[] = []
  let docType: 'devis' | 'facture' = 'devis'
  let company: any = null

  if (sig.quote_id) {
    docType = 'devis'
    const [{ data: quote }, { data: comp }] = await Promise.all([
      service.from('quotes').select('*, clients(*), quote_lines(*)').eq('id', sig.quote_id).single(),
      service.from('companies').select('*').eq('user_id', sig.user_id).single(),
    ])
    document = quote
    lines = ((quote?.quote_lines as any[]) || []).sort((a, b) => a.sort_order - b.sort_order)
    company = comp
  } else if (sig.invoice_id) {
    docType = 'facture'
    const [{ data: invoice }, { data: comp }] = await Promise.all([
      service.from('invoices').select('*, clients(*), invoice_lines(*)').eq('id', sig.invoice_id).single(),
      service.from('companies').select('*').eq('user_id', sig.user_id).single(),
    ])
    document = invoice
    lines = ((invoice?.invoice_lines as any[]) || []).sort((a, b) => a.sort_order - b.sort_order)
    company = comp
  }
  if (!document) return notFound()

  const docNumber = docType === 'devis' ? document.quote_number : document.invoice_number

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          {company?.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={company.logo_url} alt={company.trade_name || ''} className="w-10 h-10 rounded-lg object-cover" />
          )}
          <div>
            <p className="font-bold text-gray-900">{company?.trade_name || 'Votre entreprise'}</p>
            {company?.address && <p className="text-xs text-gray-500">{company.address}</p>}
          </div>
        </div>

        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400 font-semibold">
                  {docType === 'devis' ? 'Devis' : 'Facture'}
                </p>
                <p className="font-mono text-sm text-gray-500">{docNumber}</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(document.total_ttc)}</p>
                <p className="text-xs text-gray-400">TTC</p>
              </div>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Désignation</th>
                    <th className="text-right px-2 py-2 font-medium text-gray-600 w-16">Qté</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600 w-24">Total HT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {lines.map((l: any) => (
                    <tr key={l.id}>
                      <td className="px-3 py-2">
                        <div className="font-medium text-gray-900">{l.designation}</div>
                        {l.description && <div className="text-xs text-gray-400">{l.description}</div>}
                      </td>
                      <td className="text-right px-2 py-2 text-gray-600">{l.quantity} {unitLabels[l.unit] || l.unit}</td>
                      <td className="text-right px-3 py-2 font-semibold text-gray-900">{formatCurrency(l.total_ht)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {document.notes && (
              <div className="text-sm text-gray-500 border-t pt-3">
                <p className="font-medium text-gray-700 mb-1">Modalités :</p>
                <p>{document.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {status === 'signee' && (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="p-5 flex items-start gap-3">
              <CheckCircle className="w-6 h-6 text-green-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-green-800">Document déjà signé</p>
                <p className="text-sm text-green-700 mt-1">
                  Signé par {sig.signer_name} le {formatDate(sig.signed_at)}.
                  {sig.signer_email ? ` Une copie a été envoyée à ${sig.signer_email}.` : ''}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {status === 'expiree' && (
          <Card className="border-orange-200 bg-orange-50">
            <CardContent className="p-5 flex items-start gap-3">
              <Clock className="w-6 h-6 text-orange-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-orange-800">Ce lien a expiré</p>
                <p className="text-sm text-orange-700 mt-1">
                  Contactez {company?.trade_name || "l'entreprise"} pour recevoir un nouveau lien de signature.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {status === 'annulee' && (
          <Card className="border-gray-200 bg-gray-100">
            <CardContent className="p-5 flex items-start gap-3">
              <XCircle className="w-6 h-6 text-gray-500 shrink-0 mt-0.5" />
              <p className="font-semibold text-gray-700">Ce lien n&apos;est plus valide</p>
            </CardContent>
          </Card>
        )}

        {status === 'en_attente' && (
          <SignatureForm
            signatureId={id}
            defaultName={sig.signer_name || ''}
            defaultEmail={sig.signer_email || ''}
            docTypeLabel={docType}
          />
        )}
      </div>
    </div>
  )
}
