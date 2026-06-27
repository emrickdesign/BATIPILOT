import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, MapPin, User, Calendar, FileText, Receipt, ScanLine, Edit, HardHat, FolderOpen, ReceiptText, Clock, TrendingUp } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Project, ProjectStatus } from '@/types'
import { clientDisplayName } from '@/lib/chantiers'
import StatusSelect from '../StatusSelect'

export default async function ChantierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: project } = await supabase
    .from('projects')
    .select('*, clients(id, type, first_name, last_name, company_name)')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!project) return notFound()
  type LinkedClient = { id: string; type: string; first_name: string | null; last_name: string | null; company_name: string | null }
  const p = project as Project & { clients?: LinkedClient | null }

  const [{ data: quotes }, { data: invoices }, { data: plans }, { data: documents }, { data: expenses }, { data: timeEntries }, { data: employees }] = await Promise.all([
    supabase.from('quotes').select('id,quote_number,status,total_ttc,subtotal_ht,issue_date').eq('project_id', id).order('created_at', { ascending: false }),
    supabase.from('invoices').select('id,invoice_number,status,amount_due,issue_date').eq('project_id', id).order('created_at', { ascending: false }),
    supabase.from('plan_uploads').select('id,original_filename,analysis_status,created_at').eq('project_id', id).order('created_at', { ascending: false }),
    supabase.from('documents').select('id,name,category').eq('project_id', id).order('created_at', { ascending: false }),
    supabase.from('expenses').select('id,supplier,amount_ttc,amount_ht,category,expense_date').eq('project_id', id).neq('status', 'archive').order('created_at', { ascending: false }),
    supabase.from('time_entries').select('hours,employee_id').eq('project_id', id),
    supabase.from('employees').select('id,hourly_cost').eq('user_id', user.id),
  ])

  const totalDepenses = (expenses || []).reduce((s, e) => s + (Number(e.amount_ttc) || 0), 0)
  const totalHeures = (timeEntries || []).reduce((s, t) => s + (Number(t.hours) || 0), 0)

  // Marge estimée = revenu signé (devis acceptés HT) − dépenses HT − coût main-d'œuvre
  const empCost = new Map((employees || []).map(e => [e.id, Number(e.hourly_cost) || 0]))
  const revenuSigne = (quotes || [])
    .filter(q => q.status === 'accepte' || q.status === 'transforme')
    .reduce((s, q) => s + (Number(q.subtotal_ht) || 0), 0)
  const coutDepensesHt = (expenses || []).reduce((s, e) => s + (Number(e.amount_ht) || Number(e.amount_ttc) || 0), 0)
  const coutMainOeuvre = (timeEntries || []).reduce((s, t) => s + (Number(t.hours) || 0) * (empCost.get(t.employee_id) || 0), 0)
  const marge = revenuSigne - coutDepensesHt - coutMainOeuvre
  const margePct = revenuSigne > 0 ? Math.round((marge / revenuSigne) * 100) : null
  const hasMargeData = revenuSigne > 0 || coutDepensesHt > 0 || coutMainOeuvre > 0

  const devisLink = `/devis/nouveau?project=${id}${p.client_id ? `&client=${p.client_id}` : ''}`

  return (
    <div className="space-y-4 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/chantiers">
            <Button variant="ghost" size="sm" className="gap-1">
              <ArrowLeft className="w-4 h-4" /> Retour
            </Button>
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 truncate">{p.title}</h1>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Link href={`/chantiers/${id}/modifier`}>
            <Button variant="outline" size="sm" className="gap-1">
              <Edit className="w-4 h-4" /> Modifier
            </Button>
          </Link>
          <Link href={devisLink}>
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
            {p.project_type
              ? <Badge variant="outline" className="gap-1"><HardHat className="w-3 h-3" />{p.project_type}</Badge>
              : <span className="text-xs text-gray-400">Type à définir</span>}
            <StatusSelect projectId={id} current={p.status as ProjectStatus} />
          </div>
          {p.clients && (
            <div className="flex items-center gap-2 text-sm">
              <User className="w-4 h-4 text-gray-400" />
              <Link href={`/clients/${p.client_id}`} className="text-blue-600 hover:underline">
                {clientDisplayName(p.clients)}
              </Link>
            </div>
          )}
          {p.address && (
            <div className="flex items-start gap-2 text-sm">
              <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
              <span className="text-gray-700 whitespace-pre-line">{p.address}</span>
            </div>
          )}
          {(p.start_date || p.end_date) && (
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="w-4 h-4 text-gray-400" />
              <span className="text-gray-700">
                {p.start_date ? formatDate(p.start_date) : '?'} → {p.end_date ? formatDate(p.end_date) : '?'}
              </span>
            </div>
          )}
          {totalHeures > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <Clock className="w-4 h-4 text-gray-400" />
              <span className="text-gray-700">{totalHeures.toFixed(1).replace('.0', '')} h de main-d&apos;œuvre déclarées</span>
            </div>
          )}
          {p.description && (
            <div className="pt-2 border-t border-gray-100">
              <p className="text-sm text-gray-700 whitespace-pre-line">{p.description}</p>
            </div>
          )}
          {p.notes && (
            <div className="pt-2 border-t border-gray-100">
              <p className="text-xs font-medium text-gray-400 mb-1">Notes internes</p>
              <p className="text-sm text-gray-500 italic whitespace-pre-line">{p.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Marge estimée */}
      {hasMargeData && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-gray-400" /> Marge estimée
              {margePct !== null && (
                <span className={`text-sm font-semibold ${marge >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>· {margePct} %</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs text-gray-400 mb-1">Signé (HT)</p>
                <p className="text-sm font-semibold text-marine tabular-nums">{formatCurrency(revenuSigne)}</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs text-gray-400 mb-1">Coûts</p>
                <p className="text-sm font-semibold text-gray-600 tabular-nums">{formatCurrency(coutDepensesHt + coutMainOeuvre)}</p>
              </div>
              <div className={`rounded-lg p-3 ${marge >= 0 ? 'bg-emerald-50' : 'bg-rose-50'}`}>
                <p className="text-xs text-gray-400 mb-1">Marge</p>
                <p className={`text-sm font-semibold tabular-nums ${marge >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatCurrency(marge)}</p>
              </div>
            </div>
            <p className="text-[11px] text-gray-400 mt-2.5 leading-snug">
              Détail des coûts : {formatCurrency(coutDepensesHt)} de dépenses + {formatCurrency(coutMainOeuvre)} de main-d&apos;œuvre.
              {revenuSigne === 0 && ' Aucun devis accepté rattaché pour l’instant.'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Devis liés */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-4 h-4 text-gray-400" /> Devis ({quotes?.length || 0})
          </CardTitle>
          <Link href={devisLink}>
            <Button variant="outline" size="sm">+ Devis</Button>
          </Link>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {!quotes?.length ? (
            <p className="text-sm text-gray-400 py-2">Aucun devis rattaché à ce chantier</p>
          ) : (
            <div className="space-y-2">
              {quotes.map(q => (
                <Link key={q.id} href={`/devis/${q.id}`}>
                  <div className="flex items-center justify-between py-2 hover:bg-gray-50 rounded px-2 -mx-2">
                    <div>
                      <span className="font-mono text-xs text-gray-400">{q.quote_number}</span>
                      <span className="ml-2 text-sm text-gray-700">{formatDate(q.issue_date)}</span>
                    </div>
                    <span className="text-sm font-semibold">{formatCurrency(q.total_ttc)}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Factures liées */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Receipt className="w-4 h-4 text-gray-400" /> Factures ({invoices?.length || 0})
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {!invoices?.length ? (
            <p className="text-sm text-gray-400 py-2">Aucune facture rattachée</p>
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

      {/* Dépenses liées */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <ReceiptText className="w-4 h-4 text-gray-400" /> Dépenses ({expenses?.length || 0})
            {totalDepenses > 0 && <span className="text-sm font-normal text-gray-500">· {formatCurrency(totalDepenses)}</span>}
          </CardTitle>
          <Link href={`/tickets?project=${id}`}>
            <Button variant="outline" size="sm">+ Ticket</Button>
          </Link>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {!expenses?.length ? (
            <p className="text-sm text-gray-400 py-2">Aucune dépense rattachée</p>
          ) : (
            <div className="space-y-2">
              {expenses.map(exp => (
                <Link key={exp.id} href="/depenses">
                  <div className="flex items-center justify-between py-2 hover:bg-gray-50 rounded px-2 -mx-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <ReceiptText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span className="text-sm text-gray-700 truncate">{exp.supplier || 'Dépense'}</span>
                      {exp.category && <Badge variant="outline" className="text-xs flex-shrink-0">{exp.category}</Badge>}
                    </div>
                    <span className="text-sm font-semibold flex-shrink-0">{formatCurrency(Number(exp.amount_ttc) || 0)}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Documents liés */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-gray-400" /> Documents ({documents?.length || 0})
          </CardTitle>
          <Link href={`/documents?project=${id}`}>
            <Button variant="outline" size="sm">+ Document</Button>
          </Link>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {!documents?.length ? (
            <p className="text-sm text-gray-400 py-2">Aucun document rattaché</p>
          ) : (
            <div className="space-y-2">
              {documents.map(doc => (
                <Link key={doc.id} href={`/documents?project=${id}`}>
                  <div className="flex items-center justify-between py-2 hover:bg-gray-50 rounded px-2 -mx-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
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

      {/* Plans liés */}
      {!!plans?.length && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-base flex items-center gap-2">
              <ScanLine className="w-4 h-4 text-gray-400" /> Plans ({plans.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="space-y-2">
              {plans.map(pl => (
                <div key={pl.id} className="flex items-center justify-between py-2 px-2 -mx-2">
                  <span className="text-sm text-gray-700 truncate">{pl.original_filename || 'Plan'}</span>
                  <Badge variant="outline" className="text-xs">{pl.analysis_status}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
