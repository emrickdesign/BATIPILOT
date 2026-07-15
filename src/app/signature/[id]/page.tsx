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

  // ─── Contrat de sous-traitance ───
  if (sig.contract_id) {
    const [{ data: contract }, { data: comp }] = await Promise.all([
      service.from('subcontractor_contracts').select('*, subcontractors(*)').eq('id', sig.contract_id).single(),
      service.from('companies').select('*').eq('user_id', sig.user_id).single(),
    ])
    if (!contract) return notFound()
    const sub = (contract as any).subcontractors
    let projectTitle: string | null = null
    if (contract.project_id) {
      const { data: p } = await service.from('projects').select('title').eq('id', contract.project_id).single()
      projectTitle = p?.title ?? null
    }
    const amount = Number(contract.amount_ht) || 0
    const ret = amount * (Number(contract.retention_pct) || 0) / 100
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="flex items-center gap-3">
            {comp?.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={comp.logo_url} alt={comp.trade_name || ''} className="w-10 h-10 rounded-lg object-cover" />
            )}
            <p className="font-bold text-gray-900 text-lg">{comp?.trade_name || 'Votre entreprise'}</p>
          </div>

          <Card>
            <CardContent className="p-5 space-y-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400 font-semibold">Contrat de sous-traitance</p>
                <p className="font-medium text-gray-900">{contract.title || 'Mission de sous-traitance'}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm border-t border-b py-3">
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 mb-1">DONNEUR D&apos;ORDRE</p>
                  <p className="font-medium text-gray-900">{comp?.trade_name || ''}</p>
                  {comp?.siret && <p className="text-gray-500 text-xs">SIRET : {comp.siret}</p>}
                  {comp?.address && <p className="text-gray-500 text-xs">{comp.address}</p>}
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 mb-1">LE SOUS-TRAITANT</p>
                  <p className="font-medium text-gray-900">{sub?.company_name || ''}</p>
                  {sub?.trade && <p className="text-gray-500 text-xs">{sub.trade}</p>}
                  {sub?.siret && <p className="text-gray-500 text-xs">SIRET : {sub.siret}</p>}
                </div>
              </div>

              {projectTitle && <p className="text-sm text-gray-600">Chantier : <span className="font-medium text-gray-900">{projectTitle}</span></p>}
              {contract.description && <p className="text-sm text-gray-600 whitespace-pre-line">{contract.description}</p>}

              <div className="rounded-lg bg-gray-50 p-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-gray-500">Montant HT</span><span className="font-semibold text-gray-900">{formatCurrency(amount)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Retenue de garantie ({contract.retention_pct || 0}%)</span><span>{formatCurrency(ret)}</span></div>
                {(contract.start_date || contract.end_date) && (
                  <div className="flex justify-between"><span className="text-gray-500">Période</span><span>{contract.start_date ? formatDate(contract.start_date) : '?'} → {contract.end_date ? formatDate(contract.end_date) : '?'}</span></div>
                )}
              </div>

              <p className="text-[11px] text-gray-400 border-t pt-3">Contrat régi par la loi n°75-1334 du 31 décembre 1975 relative à la sous-traitance. Le sous-traitant atteste être à jour de ses obligations sociales et fiscales et disposer des assurances requises.</p>
            </CardContent>
          </Card>

          {status === 'signee' && (
            <Card className="border-green-200 bg-green-50"><CardContent className="p-5 flex items-start gap-3">
              <CheckCircle className="w-6 h-6 text-green-600 shrink-0 mt-0.5" />
              <div><p className="font-semibold text-green-800">Contrat déjà signé</p>
                <p className="text-sm text-green-700 mt-1">Signé par {sig.signer_name} le {formatDate(sig.signed_at)}.{sig.signer_email ? ` Une copie a été envoyée à ${sig.signer_email}.` : ''}</p></div>
            </CardContent></Card>
          )}
          {status === 'expiree' && (
            <Card className="border-orange-200 bg-orange-50"><CardContent className="p-5 flex items-start gap-3">
              <Clock className="w-6 h-6 text-orange-600 shrink-0 mt-0.5" />
              <div><p className="font-semibold text-orange-800">Ce lien a expiré</p>
                <p className="text-sm text-orange-700 mt-1">Contactez {comp?.trade_name || "l'entreprise"} pour recevoir un nouveau lien.</p></div>
            </CardContent></Card>
          )}
          {status === 'annulee' && (
            <Card className="border-gray-200 bg-gray-100"><CardContent className="p-5 flex items-start gap-3">
              <XCircle className="w-6 h-6 text-gray-500 shrink-0 mt-0.5" /><p className="font-semibold text-gray-700">Ce lien n&apos;est plus valide</p>
            </CardContent></Card>
          )}
          {status === 'en_attente' && (
            <SignatureForm signatureId={id} defaultName={sig.signer_name || sub?.company_name || ''} defaultEmail={sig.signer_email || sub?.email || ''} docTypeLabel="contrat" />
          )}
        </div>
      </div>
    )
  }

  let document: any = null
  let lines: any[] = []
  let docType: 'devis' | 'facture' = 'devis'
  let company: any = null
  let client: any = null

  if (sig.quote_id) {
    docType = 'devis'
    const [{ data: quote }, { data: comp }] = await Promise.all([
      service.from('quotes').select('*, clients(*), quote_lines(*)').eq('id', sig.quote_id).single(),
      service.from('companies').select('*').eq('user_id', sig.user_id).single(),
    ])
    document = quote
    lines = ((quote?.quote_lines as any[]) || []).sort((a, b) => a.sort_order - b.sort_order)
    company = comp
    client = quote?.clients
  } else if (sig.invoice_id) {
    docType = 'facture'
    const [{ data: invoice }, { data: comp }] = await Promise.all([
      service.from('invoices').select('*, clients(*), invoice_lines(*)').eq('id', sig.invoice_id).single(),
      service.from('companies').select('*').eq('user_id', sig.user_id).single(),
    ])
    document = invoice
    lines = ((invoice?.invoice_lines as any[]) || []).sort((a, b) => a.sort_order - b.sort_order)
    company = comp
    client = invoice?.clients
  }
  if (!document) return notFound()

  const docNumber = docType === 'devis' ? document.quote_number : document.invoice_number
  const clientName = client?.type === 'professionnel'
    ? (client.company_name || 'Client')
    : `${client?.first_name || ''} ${client?.last_name || ''}`.trim() || 'Client'

  const prestataireLines = [
    company?.address,
    company?.siret ? `SIRET : ${company.siret}` : null,
    [company?.phone, company?.email].filter(Boolean).join(' · ') || null,
  ].filter(Boolean) as string[]

  const clientInfoLines = [
    client?.type === 'professionnel' && client?.siret ? `SIRET : ${client.siret}` : null,
    client?.phone || null,
    client?.email || null,
    client?.billing_address || null,
  ].filter(Boolean) as string[]

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          {company?.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={company.logo_url} alt={company.trade_name || ''} className="w-10 h-10 rounded-lg object-cover" />
          )}
          <p className="font-bold text-gray-900 text-lg">{company?.trade_name || 'Votre entreprise'}</p>
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm border-t border-b py-3">
              <div>
                <p className="text-[11px] font-semibold text-gray-400 mb-1">PRESTATAIRE</p>
                <p className="font-medium text-gray-900">{company?.trade_name || ''}</p>
                {prestataireLines.map((l, i) => <p key={i} className="text-gray-500 text-xs">{l}</p>)}
              </div>
              <div>
                <p className="text-[11px] font-semibold text-gray-400 mb-1">CLIENT</p>
                <p className="font-medium text-gray-900">{clientName}</p>
                {clientInfoLines.map((l, i) => <p key={i} className="text-gray-500 text-xs">{l}</p>)}
              </div>
            </div>

            <div className="text-sm text-gray-600 grid grid-cols-2 gap-2">
              <div>Date : <span className="font-medium text-gray-900">{formatDate(document.issue_date)}</span></div>
              {docType === 'devis' && document.valid_until && (
                <div>Validité : <span className="font-medium text-gray-900">{formatDate(document.valid_until)}</span></div>
              )}
              {docType === 'facture' && document.due_date && (
                <div>Échéance : <span className="font-medium text-gray-900">{formatDate(document.due_date)}</span></div>
              )}
            </div>

            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Désignation</th>
                    <th className="text-right px-2 py-2 font-medium text-gray-600 w-14">Qté</th>
                    <th className="text-right px-2 py-2 font-medium text-gray-600 w-12">TVA</th>
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
                      <td className="text-right px-2 py-2 text-gray-500">{l.vat_rate}%</td>
                      <td className="text-right px-3 py-2 font-semibold text-gray-900">{formatCurrency(l.total_ht)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end">
              <div className="w-64 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Total HT</span>
                  <span className="font-medium">{formatCurrency(document.subtotal_ht)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">TVA</span>
                  <span>{formatCurrency(document.total_vat)}</span>
                </div>
                <div className="flex justify-between font-bold text-base border-t pt-1">
                  <span>Total TTC</span>
                  <span>{formatCurrency(document.total_ttc)}</span>
                </div>
                {docType === 'devis' && document.deposit_amount > 0 && (
                  <div className="flex justify-between text-blue-600 border-t pt-1">
                    <span>Acompte demandé ({document.deposit_percent}%)</span>
                    <span className="font-semibold">{formatCurrency(document.deposit_amount)}</span>
                  </div>
                )}
                {docType === 'facture' && document.deposit_already_paid > 0 && (
                  <div className="flex justify-between text-gray-500">
                    <span>Acompte versé</span>
                    <span>- {formatCurrency(document.deposit_already_paid)}</span>
                  </div>
                )}
                {docType === 'facture' && (
                  <div className="flex justify-between font-bold text-blue-700 border-t pt-1">
                    <span>Reste à payer</span>
                    <span>{formatCurrency(document.amount_due)}</span>
                  </div>
                )}
              </div>
            </div>

            {document.notes && (
              <div className="text-sm text-gray-500 border-t pt-3">
                <p className="font-medium text-gray-700 mb-1">{docType === 'devis' ? 'Modalités :' : 'Notes :'}</p>
                <p className="whitespace-pre-line">{document.notes}</p>
              </div>
            )}
            {document.legal_mentions && (
              <div className="text-xs text-gray-400 border-t pt-3">{document.legal_mentions}</div>
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
