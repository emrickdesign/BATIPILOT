import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ArrowLeft, Phone, Mail, MapPin, HardHat, FolderOpen, Edit, Hash,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { projectStatusLabels, projectStatusColors } from '@/lib/chantiers'
import { clientDisplayName, clientStatusLabels, clientStatusColors } from '@/lib/clients'
import type { ProjectStatus, ClientStatus } from '@/types'

const num = (v: unknown) => Number(v) || 0

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: client } = await supabase
    .from('clients').select('*').eq('id', id).eq('user_id', user.id).single()
  if (!client) return notFound()

  const [{ data: projects }, { data: quotes }, { data: invoices }, { data: documents }] = await Promise.all([
    supabase.from('projects').select('id,title,status,project_type').eq('client_id', id).neq('status', 'archive').order('created_at', { ascending: false }),
    supabase.from('quotes').select('id,quote_number,status,total_ttc,issue_date').eq('client_id', id).order('created_at', { ascending: false }),
    supabase.from('invoices').select('id,invoice_number,status,total_ttc,amount_due,issue_date').eq('client_id', id).order('created_at', { ascending: false }),
    supabase.from('documents').select('id,name,category').eq('client_id', id).order('created_at', { ascending: false }),
  ])

  const isPaid = (s: string) => s === 'payee' || s === 'paye'
  const isOpen = (s: string) => s === 'envoyee' || s === 'en_retard' || s === 'payee_partiellement'
  const inv = invoices || []
  const totalFacture = inv.filter(i => i.status !== 'brouillon').reduce((s, i) => s + num(i.total_ttc), 0)
  const encaisse = inv.filter(i => isPaid(i.status)).reduce((s, i) => s + num(i.total_ttc), 0)
  const reste = inv.filter(i => isOpen(i.status)).reduce((s, i) => s + (num(i.amount_due) || num(i.total_ttc)), 0)

  const clientName = clientDisplayName(client)

  return (
    <div className="space-y-4 max-w-3xl">
      {/* En-tête */}
      <div className="flex items-center gap-3">
        <Link href="/clients">
          <Button variant="ghost" size="sm" className="gap-1"><ArrowLeft className="w-4 h-4" /> Retour</Button>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 truncate">{clientName}</h1>
        <Badge className={`${clientStatusColors[client.status as ClientStatus] || 'bg-gray-100 text-gray-700'} border-0 flex-shrink-0 text-xs`}>
          {clientStatusLabels[client.status as ClientStatus] || client.status}
        </Badge>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {/* « Créer un chantier » uniquement s'il n'y en a aucun ; sinon le chantier lié est listé plus bas. */}
        {!projects?.length && (
          <Link href={`/chantiers/nouveau?client=${id}`}><Button size="sm" className="gap-1"><HardHat className="w-4 h-4" /> Créer un chantier</Button></Link>
        )}
        {client.email && (
          <Link href={`/emails?compose=1&to=${encodeURIComponent(client.email)}`}>
            <Button variant="info" size="sm" className="gap-1"><Mail className="w-4 h-4" /> Email</Button>
          </Link>
        )}
        <Link href={`/clients/${id}/modifier`}><Button variant="outline" size="sm" className="gap-1"><Edit className="w-4 h-4" /> Modifier</Button></Link>
      </div>

      {/* Résumé financier */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border border-[#CFDDF6] bg-[#EAF1FC]"><CardContent className="p-4">
          <div className="text-[11px] font-medium text-[#3E5C8A]">Total facturé</div>
          <div className="text-xl font-bold text-[#1F5FAE] tabular-nums mt-1">{formatCurrency(totalFacture)}</div>
        </CardContent></Card>
        <Card className="border border-[#DDE9C9] bg-[#EEF6E4]"><CardContent className="p-4">
          <div className="text-[11px] font-medium text-[#4C6F35]">Encaissé</div>
          <div className="text-xl font-bold text-[#3F7A2E] tabular-nums mt-1">{formatCurrency(encaisse)}</div>
        </CardContent></Card>
        <Link href="/banque">
          <Card className="border border-[#F0E1C0] bg-[#FBF1D8] card-interactive h-full"><CardContent className="p-4">
            <div className="text-[11px] font-medium text-[#8A6D2E]">Reste à encaisser</div>
            <div className={`text-xl font-bold tabular-nums mt-1 ${reste > 0 ? 'text-[#8A5A08]' : 'text-gray-400'}`}>{formatCurrency(reste)}</div>
          </CardContent></Card>
        </Link>
      </div>

      {/* Coordonnées */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <Badge variant="outline" className="w-fit">{client.type === 'professionnel' ? '🏢 Professionnel' : '👤 Particulier'}</Badge>
          {client.phone && (
            <div className="flex items-center gap-2 text-sm"><Phone className="w-4 h-4 text-gray-400" /><a href={`tel:${client.phone}`} className="text-primary">{client.phone}</a></div>
          )}
          {client.email && (
            <div className="flex items-center gap-2 text-sm"><Mail className="w-4 h-4 text-gray-400" /><a href={`mailto:${client.email}`} className="text-primary truncate">{client.email}</a></div>
          )}
          {client.type === 'professionnel' && client.siret && (
            <div className="flex items-center gap-2 text-sm"><Hash className="w-4 h-4 text-gray-400" /><span className="text-gray-700">SIRET {client.siret}</span></div>
          )}
          {client.billing_address && (
            <div className="flex items-start gap-2 text-sm"><MapPin className="w-4 h-4 text-gray-400 mt-0.5" /><span className="text-gray-700 whitespace-pre-line"><span className="text-[11px] text-gray-400 block">Facturation</span>{client.billing_address}</span></div>
          )}
          {client.site_address && (
            <div className="flex items-start gap-2 text-sm"><MapPin className="w-4 h-4 text-gray-400 mt-0.5" /><span className="text-gray-700 whitespace-pre-line"><span className="text-[11px] text-gray-400 block">Chantier</span>{client.site_address}</span></div>
          )}
          {client.notes && (
            <div className="pt-2 border-t border-gray-100"><p className="text-sm text-gray-500 italic whitespace-pre-line">{client.notes}</p></div>
          )}
        </CardContent>
      </Card>

      {/* Chantiers */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-base">Chantiers ({projects?.length || 0})</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {!projects?.length ? <p className="text-sm text-gray-400 py-2">Aucun chantier</p> : (
            <div className="space-y-2">
              {projects.map(pr => (
                <Link key={pr.id} href={`/chantiers/${pr.id}`}>
                  <div className="flex items-center justify-between py-2 hover:bg-gray-50 rounded px-2 -mx-2">
                    <div className="flex items-center gap-2 min-w-0"><HardHat className="w-4 h-4 text-gray-400 flex-shrink-0" /><span className="text-sm text-gray-700 truncate">{pr.title}</span></div>
                    <Badge className={`${projectStatusColors[pr.status as ProjectStatus] || 'bg-gray-100 text-gray-700'} border-0 text-xs flex-shrink-0`}>{projectStatusLabels[pr.status as ProjectStatus] || pr.status}</Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Devis */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-base">Devis ({quotes?.length || 0})</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {!quotes?.length ? <p className="text-sm text-gray-400 py-2">Aucun devis</p> : (
            <div className="space-y-2">
              {quotes.map(q => (
                <Link key={q.id} href={`/devis/${q.id}`}>
                  <div className="flex items-center justify-between py-2 hover:bg-gray-50 rounded px-2 -mx-2">
                    <div><span className="font-mono text-xs text-gray-400">{q.quote_number}</span><span className="ml-2 text-sm text-gray-700">{formatDate(q.issue_date)}</span></div>
                    <span className="text-sm font-semibold">{formatCurrency(q.total_ttc)}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Factures */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-base">Factures ({inv.length})</CardTitle></CardHeader>
        <CardContent className="px-4 pb-4">
          {!inv.length ? <p className="text-sm text-gray-400 py-2">Aucune facture</p> : (
            <div className="space-y-2">
              {inv.map(i => (
                <Link key={i.id} href={`/factures/${i.id}`}>
                  <div className="flex items-center justify-between py-2 hover:bg-gray-50 rounded px-2 -mx-2">
                    <span className="font-mono text-xs text-gray-400">{i.invoice_number}</span>
                    <span className="text-sm font-semibold">{formatCurrency(num(i.amount_due) || num(i.total_ttc))}</span>
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
          <Link href={`/documents?client=${id}`}><Button variant="outline" size="sm">+ Document</Button></Link>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {!documents?.length ? <p className="text-sm text-gray-400 py-2">Aucun document</p> : (
            <div className="space-y-2">
              {documents.map(doc => (
                <Link key={doc.id} href={`/documents?client=${id}`}>
                  <div className="flex items-center justify-between py-2 hover:bg-gray-50 rounded px-2 -mx-2">
                    <div className="flex items-center gap-2 min-w-0"><FolderOpen className="w-4 h-4 text-gray-400 flex-shrink-0" /><span className="text-sm text-gray-700 truncate">{doc.name}</span></div>
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
