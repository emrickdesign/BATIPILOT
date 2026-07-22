import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/service'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { CheckCircle, Clock, XCircle } from 'lucide-react'
import SignatureForm from './SignatureForm'
import DocFrame from './DocFrame'
import { buildDocData, renderDocument } from '@/lib/doc-templates'

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

  // ─── Réception de chantier (PV) ───
  if (sig.reception_id) {
    const { data: reception } = await service.from('project_receptions').select('*').eq('id', sig.reception_id).single()
    if (!reception) return notFound()
    const [{ data: project }, { data: comp }] = await Promise.all([
      service.from('projects').select('*, clients(*)').eq('id', reception.project_id).single(),
      service.from('companies').select('*').eq('user_id', sig.user_id).single(),
    ])
    const cl = (project as any)?.clients
    const clientName = cl ? (cl.type === 'professionnel' ? cl.company_name : `${cl.first_name || ''} ${cl.last_name || ''}`.trim()) : (sig.signer_name || 'Client')
    const reserves = (reception.reserves as { label: string; resolved: boolean }[]) || []
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
                <p className="text-xs uppercase tracking-wide text-gray-400 font-semibold">Procès-verbal de réception de chantier</p>
                <p className="font-medium text-gray-900">{project?.title || 'Chantier'}</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm border-t border-b py-3">
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 mb-1">ENTREPRISE</p>
                  <p className="font-medium text-gray-900">{comp?.trade_name || ''}</p>
                  {comp?.siret && <p className="text-gray-500 text-xs">SIRET : {comp.siret}</p>}
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 mb-1">MAÎTRE D&apos;OUVRAGE</p>
                  <p className="font-medium text-gray-900">{clientName}</p>
                  {project?.address && <p className="text-gray-500 text-xs whitespace-pre-line">{project.address}</p>}
                </div>
              </div>
              <p className="text-sm text-gray-600">Réception prononcée le <span className="font-medium text-gray-900">{formatDate(reception.reception_date)}</span>{reserves.length === 0 ? ' sans réserve.' : ` avec ${reserves.length} réserve${reserves.length > 1 ? 's' : ''} :`}</p>
              {reserves.length > 0 && (
                <ul className="text-sm space-y-1">
                  {reserves.map((r, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className={`w-4 h-4 rounded-full flex-shrink-0 ${r.resolved ? 'bg-green-500' : 'bg-amber-400'}`} />
                      <span className={r.resolved ? 'line-through text-gray-400' : 'text-gray-700'}>{r.label}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[11px] text-gray-400 border-t pt-3">La signature du présent procès-verbal vaut réception des travaux au sens de l&apos;article 1792-6 du Code civil et fait courir les délais de garantie. En présence de réserves, celles-ci devront être levées dans les délais convenus.</p>
            </CardContent>
          </Card>

          {status === 'signee' && (
            <Card className="border-green-200 bg-green-50"><CardContent className="p-5 flex items-start gap-3">
              <CheckCircle className="w-6 h-6 text-green-600 shrink-0 mt-0.5" />
              <div><p className="font-semibold text-green-800">Réception signée</p>
                <p className="text-sm text-green-700 mt-1">Signée par {sig.signer_name} le {formatDate(sig.signed_at)}.</p></div>
            </CardContent></Card>
          )}
          {status === 'expiree' && (
            <Card className="border-orange-200 bg-orange-50"><CardContent className="p-5 flex items-start gap-3">
              <Clock className="w-6 h-6 text-orange-600 shrink-0 mt-0.5" />
              <div><p className="font-semibold text-orange-800">Ce lien a expiré</p>
                <p className="text-sm text-orange-700 mt-1">Contactez {comp?.trade_name || "l'entreprise"} pour un nouveau lien.</p></div>
            </CardContent></Card>
          )}
          {status === 'en_attente' && (
            <SignatureForm signatureId={id} defaultName={sig.signer_name || clientName} defaultEmail={sig.signer_email || cl?.email || ''} docTypeLabel="réception" />
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

  const templateId = (company?.template_style as { template_id?: string } | null)?.template_id
  const docData = buildDocData(docType, document, company, client, lines)
  const docHtml = renderDocument(templateId, docData)

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-[880px] mx-auto space-y-4">
        {/* Le document rendu dans le modèle choisi par l'entreprise — c'est ce que le client signe */}
        <DocFrame html={docHtml} />

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
