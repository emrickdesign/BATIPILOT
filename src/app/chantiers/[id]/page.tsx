import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ArrowLeft, MapPin, User, Calendar, FileText, Receipt, ScanLine, Edit, HardHat,
  FolderOpen, ReceiptText, Clock, Navigation, Camera, Users2, Truck, Plus,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Project, ProjectStatus } from '@/types'
import { clientDisplayName } from '@/lib/chantiers'
import StatusSelect from '../StatusSelect'
import MateriauxSection, { type MaterialRow } from './MateriauxSection'
import AvancementControl from './AvancementControl'
import { buildNeeds, type QuoteLineLite } from '@/lib/materiaux'

const num = (v: unknown) => Number(v) || 0

export default async function ChantierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: project } = await supabase
    .from('projects')
    .select('*, clients(id, type, first_name, last_name, company_name)')
    .eq('id', id).eq('user_id', user.id).single()

  if (!project) return notFound()
  type LinkedClient = { id: string; type: string; first_name: string | null; last_name: string | null; company_name: string | null }
  const p = project as Project & { clients?: LinkedClient | null }

  const [
    { data: quotes }, { data: invoices }, { data: plans }, { data: documents },
    { data: expenses }, { data: timeEntries }, { data: employees },
    { data: assignments }, { data: vehicleLogs }, { data: vehicles }, { data: subInvoices },
  ] = await Promise.all([
    supabase.from('quotes').select('id,quote_number,status,total_ttc,subtotal_ht,issue_date').eq('project_id', id).order('created_at', { ascending: false }),
    supabase.from('invoices').select('id,invoice_number,status,total_ttc,amount_due,issue_date').eq('project_id', id).order('created_at', { ascending: false }),
    supabase.from('plan_uploads').select('id,original_filename,analysis_status,created_at').eq('project_id', id).order('created_at', { ascending: false }),
    supabase.from('documents').select('id,name,category').eq('project_id', id).order('created_at', { ascending: false }),
    supabase.from('expenses').select('id,supplier,amount_ttc,amount_ht,category,expense_date').eq('project_id', id).neq('status', 'archive').order('created_at', { ascending: false }),
    supabase.from('time_entries').select('hours,employee_id').eq('project_id', id),
    supabase.from('employees').select('id,full_name,role,color,hourly_cost').eq('user_id', user.id),
    supabase.from('assignments').select('employee_id').eq('project_id', id),
    supabase.from('vehicle_logs').select('vehicle_id').eq('project_id', id),
    supabase.from('vehicles').select('id,name,plate').eq('user_id', user.id),
    supabase.from('subcontractor_invoices').select('amount_ht,amount_ttc,status').eq('project_id', id).eq('user_id', user.id),
  ])

  const isSigned = (s: string) => s === 'accepte' || s === 'transforme'
  const isOpen = (s: string) => s === 'envoyee' || s === 'en_retard' || s === 'payee_partiellement'

  const totalDepenses = (expenses || []).reduce((s, e) => s + num(e.amount_ttc), 0)
  const totalHeures = (timeEntries || []).reduce((s, t) => s + num(t.hours), 0)
  const empCost = new Map((employees || []).map(e => [e.id, num(e.hourly_cost)]))
  const empById = new Map((employees || []).map(e => [e.id, e]))

  // Bloc financier (admin)
  const revenuSigne = (quotes || []).filter(q => isSigned(q.status)).reduce((s, q) => s + num(q.subtotal_ht), 0)
  const montantDevis = (quotes || []).filter(q => isSigned(q.status)).reduce((s, q) => s + num(q.total_ttc), 0)
    || (quotes || []).reduce((s, q) => s + num(q.total_ttc), 0)
  const facture = (invoices || []).filter(i => i.status !== 'brouillon' && i.status !== 'annulee').reduce((s, i) => s + num(i.total_ttc), 0)
  const encaisse = (invoices || []).filter(i => i.status !== 'annulee').reduce((s, i) => s + (num(i.total_ttc) - num(i.amount_due)), 0)
  const reste = (invoices || []).filter(i => isOpen(i.status)).reduce((s, i) => s + (num(i.amount_due) || num(i.total_ttc)), 0)
  const coutDepensesHt = (expenses || []).reduce((s, e) => s + (num(e.amount_ht) || num(e.amount_ttc)), 0)
  const coutMainOeuvre = (timeEntries || []).reduce((s, t) => s + num(t.hours) * (empCost.get(t.employee_id) || 0), 0)
  // Coût sous-traitance HT (les factures ST rattachées au chantier — comptent dans la marge)
  const coutSousTraitance = (subInvoices || []).reduce((s, i) => s + (num(i.amount_ht) || num(i.amount_ttc) / 1.2), 0)
  const marge = revenuSigne - coutDepensesHt - coutMainOeuvre - coutSousTraitance
  const margePct = revenuSigne > 0 ? Math.round((marge / revenuSigne) * 100) : null

  // ── Besoins matériaux : dérivés des lignes de devis acceptés + suivi d'achat ──
  const acceptedQuotes = (quotes || []).filter(q => isSigned(q.status))
  type QLRaw = { id: string; quote_id: string; price_item_id: string | null; designation: string; quantity: number | null; unit: string | null; price_items: { supply_included: boolean; supplier_cost: number | null } | null }
  const [{ data: quoteLinesRaw }, { data: procRaw }] = await Promise.all([
    acceptedQuotes.length
      ? supabase.from('quote_lines').select('id,quote_id,price_item_id,designation,quantity,unit,price_items(supply_included,supplier_cost)').in('quote_id', acceptedQuotes.map(q => q.id))
      : Promise.resolve({ data: [] }),
    supabase.from('procurement_items').select('label_key,label,unit,quantity,supplier,cost_ht,purchased,manual').eq('project_id', id),
  ])
  const lines: QuoteLineLite[] = ((quoteLinesRaw || []) as unknown as QLRaw[]).map(l => ({
    id: l.id, quote_id: l.quote_id, price_item_id: l.price_item_id, designation: l.designation,
    quantity: l.quantity, unit: l.unit,
    price_item: l.price_items ? { supply_included: l.price_items.supply_included, supplier_cost: l.price_items.supplier_cost } : null,
  }))
  const needs = buildNeeds(acceptedQuotes.map(q => ({ id: q.id, quote_number: q.quote_number, status: q.status })), lines)
  type ProcRow = { label_key: string; label: string; unit: string | null; quantity: number | null; supplier: string | null; cost_ht: number | null; purchased: boolean; manual: boolean }
  const procRows = (procRaw || []) as ProcRow[]
  const procByKey = new Map(procRows.map(r => [r.label_key, r]))
  const materialRows: MaterialRow[] = needs.map(n => {
    const st = procByKey.get(n.key)
    return { ...n, purchased: st?.purchased ?? false, supplier: st?.supplier ?? null, cost_ht: st?.cost_ht ?? null, manual: false }
  })
  for (const r of procRows) {
    if (r.manual && !needs.some(n => n.key === r.label_key)) {
      materialRows.push({ key: r.label_key, label: r.label, unit: r.unit, quantity: Number(r.quantity) || 0, estCostHt: 0, quotes: [], uncertain: false, purchased: r.purchased, supplier: r.supplier, cost_ht: r.cost_ht, manual: true })
    }
  }
  materialRows.sort((a, b) => a.label.localeCompare(b.label, 'fr'))

  // Bloc équipe
  const assignedIds = [...new Set((assignments || []).map(a => a.employee_id))]
  const team = assignedIds.map(eid => empById.get(eid)).filter((e): e is NonNullable<typeof e> => !!e)
  const chef = team.find(e => e.role?.toLowerCase().includes('chef'))
  const vehById = new Map((vehicles || []).map(v => [v.id, v]))
  const projVehicles = [...new Set((vehicleLogs || []).map(l => l.vehicle_id))].map(vid => vehById.get(vid)).filter(Boolean)

  // Localisation
  const addr = p.address?.trim()
  const enc = addr ? encodeURIComponent(addr) : ''
  const mapSrc = `https://maps.google.com/maps?q=${enc}&z=15&output=embed`
  const itineraire = `https://www.google.com/maps/dir/?api=1&destination=${enc}`
  const applePlans = `https://maps.apple.com/?q=${enc}`

  const devisLink = `/devis/nouveau?project=${id}${p.client_id ? `&client=${p.client_id}` : ''}`
  const factureLink = p.client_id ? `/factures/nouveau?client=${p.client_id}` : '/factures/nouveau'

  return (
    <div className="space-y-4">
      {/* En-tête */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/chantiers"><Button variant="ghost" size="sm" className="gap-1"><ArrowLeft className="w-4 h-4" /> Retour</Button></Link>
          <h1 className="text-2xl font-bold text-gray-900 truncate">{p.title}</h1>
        </div>
        <StatusSelect projectId={id} current={p.status as ProjectStatus} clientId={p.client_id} />
      </div>

      {/* Actions (§10.3) */}
      <div className="flex flex-wrap gap-2">
        {addr && <a href={itineraire} target="_blank" rel="noopener noreferrer"><Button variant="outline" size="sm" className="gap-1"><Navigation className="w-4 h-4" /> Itinéraire</Button></a>}
        <Link href={devisLink}><Button variant="outline" size="sm" className="gap-1"><FileText className="w-4 h-4" /> Devis</Button></Link>
        <Link href={factureLink}><Button variant="outline" size="sm" className="gap-1"><Receipt className="w-4 h-4" /> Facture</Button></Link>
        <Link href={`/tickets?project=${id}`}><Button variant="outline" size="sm" className="gap-1"><ReceiptText className="w-4 h-4" /> Ticket</Button></Link>
        <Link href={`/documents?project=${id}`}><Button variant="outline" size="sm" className="gap-1"><Camera className="w-4 h-4" /> Photo / doc</Button></Link>
        <Link href="/planning"><Button variant="outline" size="sm" className="gap-1"><Users2 className="w-4 h-4" /> Affecter équipe</Button></Link>
        <Link href={`/chantiers/${id}/modifier`}><Button variant="outline" size="sm" className="gap-1"><Edit className="w-4 h-4" /> Modifier</Button></Link>
      </div>

      {/* Deux colonnes : détails du chantier (principal) + carte & magasins (latéral) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
      <div className="lg:col-span-2 space-y-4">
      {/* Infos */}
      <Card>
        <CardContent className="p-4 space-y-3">
          {p.project_type
            ? <Badge variant="outline" className="gap-1 w-fit"><HardHat className="w-3 h-3" />{p.project_type}</Badge>
            : <span className="text-xs text-gray-400">Type à définir</span>}
          {p.clients && (
            <div className="flex items-center gap-2 text-sm">
              <User className="w-4 h-4 text-gray-400" />
              <Link href={`/clients/${p.client_id}`} className="text-[#C14E33] hover:underline">{clientDisplayName(p.clients)}</Link>
            </div>
          )}
          {addr && (
            <div className="flex items-start gap-2 text-sm"><MapPin className="w-4 h-4 text-gray-400 mt-0.5" /><span className="text-gray-700 whitespace-pre-line">{p.address}</span></div>
          )}
          {(p.start_date || p.end_date) && (
            <div className="flex items-center gap-2 text-sm"><Calendar className="w-4 h-4 text-gray-400" /><span className="text-gray-700">{p.start_date ? formatDate(p.start_date) : '?'} → {p.end_date ? formatDate(p.end_date) : '?'}</span></div>
          )}
          {p.description && <div className="pt-2 border-t border-gray-100"><p className="text-sm text-gray-700 whitespace-pre-line">{p.description}</p></div>}
          <AvancementControl projectId={id} initial={p.progress} />
        </CardContent>
      </Card>

      {/* Bloc financier (admin) */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-base">Financier {margePct !== null && <span className={`text-sm font-semibold ${marge >= 0 ? 'text-[#3F7A2E]' : 'text-rose-600'}`}>· marge {margePct} %</span>}</CardTitle></CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-center">
            <Fin label="Devis" value={montantDevis} />
            <Fin label="Facturé" value={facture} />
            <Fin label="Encaissé" value={encaisse} tone="emerald" />
            <Fin label="Reste à encaisser" value={reste} tone={reste > 0 ? 'amber' : undefined} />
            <Fin label="Dépenses" value={totalDepenses} tone="rose" />
            {coutSousTraitance > 0 && <Fin label="Sous-traitance" value={coutSousTraitance} tone="rose" />}
            <Fin label="Marge estimée" value={marge} tone={marge >= 0 ? 'emerald' : 'rose'} />
          </div>
          <p className="text-[11px] text-gray-400 mt-2.5 leading-snug">
            Marge = signé HT ({formatCurrency(revenuSigne)}) − dépenses HT ({formatCurrency(coutDepensesHt)}) − main-d&apos;œuvre ({formatCurrency(coutMainOeuvre)}){coutSousTraitance > 0 ? ` − sous-traitance (${formatCurrency(coutSousTraitance)})` : ''}. {totalHeures > 0 && `${totalHeures.toFixed(1).replace('.0', '')} h déclarées.`}
          </p>
        </CardContent>
      </Card>

      {/* Bloc équipe */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><Users2 className="w-4 h-4 text-gray-400" /> Équipe ({team.length})</CardTitle>
          <Link href="/planning"><Button variant="outline" size="sm">Affecter</Button></Link>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          {team.length === 0 ? (
            <p className="text-sm text-gray-400 py-1">Aucun salarié affecté. <Link href="/planning" className="text-primary hover:underline">Affecter une équipe</Link></p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {team.map(e => (
                <span key={e.id} className="inline-flex items-center gap-1.5 rounded-full bg-gray-50 border border-gray-200 pl-1.5 pr-2.5 py-1 text-sm">
                  <span className="w-5 h-5 rounded-full flex-shrink-0" style={{ backgroundColor: e.color || '#94A3B8' }} />
                  {e.full_name}
                  {e.id === chef?.id && <Badge className="bg-[#F3E5D6] text-[#7A4220] border-0 text-[10px]">chef</Badge>}
                </span>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-4 text-sm pt-1">
            <span className="flex items-center gap-1.5 text-gray-600"><Clock className="w-4 h-4 text-gray-400" />{totalHeures.toFixed(1).replace('.0', '')} h déclarées</span>
            {projVehicles.length > 0 && (
              <span className="flex items-center gap-1.5 text-gray-600"><Truck className="w-4 h-4 text-gray-400" />{projVehicles.map(v => v!.name + (v!.plate ? ` (${v!.plate})` : '')).join(', ')}</span>
            )}
          </div>
        </CardContent>
      </Card>
      </div>

      {/* Colonne latérale : localisation + magasins + notes */}
      <div className="space-y-4">
      {/* Bloc localisation */}
      {addr && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-base flex items-center gap-2"><MapPin className="w-4 h-4 text-gray-400" /> Localisation</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <div className="rounded-xl overflow-hidden border border-gray-200">
              <iframe title="Carte du chantier" src={mapSrc} width="100%" height="200" loading="lazy" className="block" referrerPolicy="no-referrer-when-downgrade" />
            </div>
            <div className="flex flex-wrap gap-2">
              <a href={itineraire} target="_blank" rel="noopener noreferrer"><Button variant="outline" size="sm" className="gap-1"><Navigation className="w-4 h-4" /> Itinéraire (Google)</Button></a>
              <a href={applePlans} target="_blank" rel="noopener noreferrer"><Button variant="outline" size="sm" className="gap-1"><MapPin className="w-4 h-4" /> Apple Plans</Button></a>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Notes & accès chantier */}
      {p.notes && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-base">Notes &amp; accès chantier</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4"><p className="text-sm text-gray-600 whitespace-pre-line">{p.notes}</p></CardContent>
        </Card>
      )}
      </div>
      </div>

      {/* Ligne de 4 : Devis · Factures · Dépenses · Documents */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
      {/* Devis liés */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><FileText className="w-4 h-4 text-gray-400" /> Devis ({quotes?.length || 0})</CardTitle>
          <Link href={devisLink}><Button variant="outline" size="sm">+ Devis</Button></Link>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {!quotes?.length ? <p className="text-sm text-gray-400 py-2">Aucun devis rattaché</p> : (
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

      {/* Factures liées */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><Receipt className="w-4 h-4 text-gray-400" /> Factures ({invoices?.length || 0})</CardTitle>
          <Link href={factureLink}><Button variant="outline" size="sm">+ Facture</Button></Link>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {!invoices?.length ? <p className="text-sm text-gray-400 py-2">Aucune facture rattachée</p> : (
            <div className="space-y-2">
              {invoices.map(inv => (
                <Link key={inv.id} href={`/factures/${inv.id}`}>
                  <div className="flex items-center justify-between py-2 hover:bg-gray-50 rounded px-2 -mx-2">
                    <span className="font-mono text-xs text-gray-400">{inv.invoice_number}</span>
                    <span className="text-sm font-semibold">{formatCurrency(num(inv.amount_due) || num(inv.total_ttc))}</span>
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
          <CardTitle className="text-base flex items-center gap-2"><ReceiptText className="w-4 h-4 text-gray-400" /> Dépenses ({expenses?.length || 0}){totalDepenses > 0 && <span className="text-sm font-normal text-gray-500">· {formatCurrency(totalDepenses)}</span>}</CardTitle>
          <Link href={`/tickets?project=${id}`}><Button variant="outline" size="sm">+ Ticket</Button></Link>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {!expenses?.length ? <p className="text-sm text-gray-400 py-2">Aucune dépense rattachée</p> : (
            <div className="space-y-2">
              {expenses.map(exp => (
                <Link key={exp.id} href="/depenses">
                  <div className="flex items-center justify-between py-2 hover:bg-gray-50 rounded px-2 -mx-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <ReceiptText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span className="text-sm text-gray-700 truncate">{exp.supplier || 'Dépense'}</span>
                      {exp.category && <Badge variant="outline" className="text-xs flex-shrink-0">{exp.category}</Badge>}
                    </div>
                    <span className="text-sm font-semibold flex-shrink-0">{formatCurrency(num(exp.amount_ttc))}</span>
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
          <CardTitle className="text-base flex items-center gap-2"><FolderOpen className="w-4 h-4 text-gray-400" /> Documents ({documents?.length || 0})</CardTitle>
          <Link href={`/documents?project=${id}`}><Button variant="outline" size="sm"><Plus className="w-3.5 h-3.5" /> Document</Button></Link>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {!documents?.length ? <p className="text-sm text-gray-400 py-2">Aucun document rattaché</p> : (
            <div className="space-y-2">
              {documents.map(doc => (
                <Link key={doc.id} href={`/documents?project=${id}`}>
                  <div className="flex items-center justify-between py-2 hover:bg-gray-50 rounded px-2 -mx-2">
                    <div className="flex items-center gap-2 min-w-0"><FileText className="w-4 h-4 text-gray-400 flex-shrink-0" /><span className="text-sm text-gray-700 truncate">{doc.name}</span></div>
                    {doc.category && <Badge variant="outline" className="text-xs flex-shrink-0">{doc.category}</Badge>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      </div>

      {/* Besoins matériaux (dérivés des devis acceptés) */}
      <MateriauxSection projectId={id} projectTitle={p.title} initial={materialRows} />

      {/* Plans liés */}
      {!!plans?.length && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-base flex items-center gap-2"><ScanLine className="w-4 h-4 text-gray-400" /> Plans ({plans.length})</CardTitle></CardHeader>
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

function Fin({ label, value, tone }: { label: string; value: number; tone?: 'emerald' | 'rose' | 'amber' }) {
  const color = tone === 'emerald' ? 'text-[#3F7A2E]' : tone === 'rose' ? 'text-rose-600' : tone === 'amber' ? 'text-amber-600' : 'text-marine'
  const bg = tone === 'emerald' ? 'bg-[#F1F6E9]' : tone === 'rose' ? 'bg-rose-50' : tone === 'amber' ? 'bg-amber-50' : 'bg-gray-50'
  return (
    <div className={`rounded-lg ${bg} p-3`}>
      <p className="text-[11px] text-gray-400 mb-1">{label}</p>
      <p className={`text-sm font-semibold tabular-nums ${color}`}>{formatCurrency(value)}</p>
    </div>
  )
}
