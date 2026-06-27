import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Phone, Mail, MapPin, FileText, HardHat, FolderOpen, Edit } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { projectStatusLabels, projectStatusColors } from '@/lib/chantiers'
import type { ProjectStatus } from '@/types'

const statusLabels: Record<string, string> = {
  nouveau: 'Nouveau', infos_a_recuperer: 'Infos à récupérer',
  devis_a_faire: 'Devis à faire', devis_envoye: 'Devis envoyé',
  devis_accepte: 'Devis accepté', devis_refuse: 'Devis refusé',
  chantier_a_planifier: 'À planifier', chantier_en_cours: 'Chantier en cours',
  facture_a_envoyer: 'Facture à envoyer', facture_envoyee: 'Facture envoyée',
  paye: 'Payé', termine: 'Terminé', archive: 'Archivé',
}

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: client } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!client) return notFound()

  const [{ data: projects }, { data: quotes }, { data: invoices }, { data: documents }] = await Promise.all([
    supabase.from('projects').select('id,title,status,project_type').eq('client_id', id).neq('status', 'archive').order('created_at', { ascending: false }),
    supabase.from('quotes').select('id,quote_number,status,total_ttc,issue_date').eq('client_id', id).order('created_at', { ascending: false }),
    supabase.from('invoices').select('id,invoice_number,status,amount_due,issue_date').eq('client_id', id).order('created_at', { ascending: false }),
    supabase.from('documents').select('id,name,category').eq('client_id', id).order('created_at', { ascending: false }),
  ])

  const clientName = client.type === 'professionnel'
    ? client.company_name
    : `${client.first_name || ''} ${client.last_name || ''}`.trim() || 'Sans nom'

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/clients">
            <Button variant="ghost" size="sm" className="gap-1">
              <ArrowLeft className="w-4 h-4" /> Retour
            </Button>
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">{clientName}</h1>
        </div>
        <div className="flex gap-2">
          <Link href={`/clients/${id}/modifier`}>
            <Button variant="outline" size="sm" className="gap-1">
              <Edit className="w-4 h-4" /> Modifier
            </Button>
          </Link>
          <Link href={`/chantiers/nouveau?client=${id}`}>
            <Button variant="outline" size="sm" className="gap-1">
              <HardHat className="w-4 h-4" /> Créer un chantier
            </Button>
          </Link>
          <Link href={`/devis/nouveau?client=${id}`}>
            <Button size="sm" className="gap-1">
              <FileText className="w-4 h-4" /> Créer un devis
            </Button>
          </Link>
        </div>
      </div>

      {/* Infos */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Badge variant="outline">{client.type === 'professionnel' ? '🏢 Pro' : '👤 Particulier'}</Badge>
            <Badge className="bg-blue-50 text-blue-700 border-0">
              {statusLabels[client.status] || client.status}
            </Badge>
          </div>
          {client.phone && (
            <div className="flex items-center gap-2 text-sm">
              <Phone className="w-4 h-4 text-gray-400" />
              <a href={`tel:${client.phone}`} className="text-blue-600">{client.phone}</a>
            </div>
          )}
          {client.email && (
            <div className="flex items-center gap-2 text-sm">
              <Mail className="w-4 h-4 text-gray-400" />
              <a href={`mailto:${client.email}`} className="text-blue-600">{client.email}</a>
            </div>
          )}
          {client.billing_address && (
            <div className="flex items-start gap-2 text-sm">
              <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
              <span className="text-gray-700 whitespace-pre-line">{client.billing_address}</span>
            </div>
          )}
          {client.notes && (
            <div className="pt-2 border-t border-gray-100">
              <p className="text-sm text-gray-500 italic">{client.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Chantiers */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Chantiers ({projects?.length || 0})</CardTitle>
          <Link href={`/chantiers/nouveau?client=${id}`}>
            <Button variant="outline" size="sm">+ Nouveau chantier</Button>
          </Link>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {!projects?.length ? (
            <p className="text-sm text-gray-400 py-2">Aucun chantier</p>
          ) : (
            <div className="space-y-2">
              {projects.map(pr => (
                <Link key={pr.id} href={`/chantiers/${pr.id}`}>
                  <div className="flex items-center justify-between py-2 hover:bg-gray-50 rounded px-2 -mx-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <HardHat className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span className="text-sm text-gray-700 truncate">{pr.title}</span>
                    </div>
                    <Badge className={`${projectStatusColors[pr.status as ProjectStatus] || 'bg-gray-100 text-gray-700'} border-0 text-xs flex-shrink-0`}>
                      {projectStatusLabels[pr.status as ProjectStatus] || pr.status}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Devis */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Devis ({quotes?.length || 0})</CardTitle>
          <Link href={`/devis/nouveau?client=${id}`}>
            <Button variant="outline" size="sm">+ Nouveau devis</Button>
          </Link>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {!quotes?.length ? (
            <p className="text-sm text-gray-400 py-2">Aucun devis</p>
          ) : (
            <div className="space-y-2">
              {quotes.map(q => (
                <Link key={q.id} href={`/devis/${q.id}`}>
                  <div className="flex items-center justify-between py-2 hover:bg-gray-50 rounded px-2 -mx-2">
                    <div>
                      <span className="font-mono text-xs text-gray-400">{q.quote_number}</span>
                      <span className="ml-2 text-sm text-gray-700">{formatDate(q.issue_date)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{formatCurrency(q.total_ttc)}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Factures */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-base">Factures ({invoices?.length || 0})</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {!invoices?.length ? (
            <p className="text-sm text-gray-400 py-2">Aucune facture</p>
          ) : (
            <div className="space-y-2">
              {invoices.map(inv => (
                <Link key={inv.id} href={`/factures/${inv.id}`}>
                  <div className="flex items-center justify-between py-2 hover:bg-gray-50 rounded px-2 -mx-2">
                    <span className="font-mono text-xs text-gray-400">{inv.invoice_number}</span>
                    <span className="text-sm font-semibold">{formatCurrency(inv.amount_due)}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Documents */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Documents ({documents?.length || 0})</CardTitle>
          <Link href={`/documents?client=${id}`}>
            <Button variant="outline" size="sm">+ Document</Button>
          </Link>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {!documents?.length ? (
            <p className="text-sm text-gray-400 py-2">Aucun document</p>
          ) : (
            <div className="space-y-2">
              {documents.map(doc => (
                <Link key={doc.id} href={`/documents?client=${id}`}>
                  <div className="flex items-center justify-between py-2 hover:bg-gray-50 rounded px-2 -mx-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <FolderOpen className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span className="text-sm text-gray-700 truncate">{doc.name}</span>
                    </div>
                    {doc.category && <Badge variant="outline" className="text-xs flex-shrink-0">{doc.category}</Badge>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
