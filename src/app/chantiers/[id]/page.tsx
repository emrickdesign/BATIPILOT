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
import { getOwnerName } from '@/lib/profile'
import DottedPage from '@/components/PageDottedBg'
import ChantierFinancePanel from './ChantierFinancePanel'
import StatusSelect from '../StatusSelect'
import MateriauxSection, { type MaterialRow } from './MateriauxSection'
import AchatsSection, { type AchatDoc } from './AchatsSection'
import AvancementControl from './AvancementControl'
import NotesSection, { type NoteRow } from './NotesSection'
import ReceptionSection, { type Reception } from './ReceptionSection'
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
  const ownerName = await getOwnerName(supabase, user)
  type LinkedClient = { id: string; type: string; first_name: string | null; last_name: string | null; company_name: string | null }
  const p = project as Project & { clients?: LinkedClient | null }

  const [
    { data: quotes }, { data: invoices }, { data: plans }, { data: documents },
    { data: expenses }, { data: timeEntries }, { data: employees },
    { data: assignments }, { data: vehicleLogs }, { data: vehicles }, { data: subInvoices },
    { data: supplierDocs },
  ] = await Promise.all([
    supabase.from('quotes').select('id,quote_number,status,total_ttc,subtotal_ht,issue_date').eq('project_id', id).order('created_at', { ascending: false }),
    supabase.from('invoices').select('id,invoice_number,status,total_ttc,amount_due,issue_date').eq('project_id', id).order('created_at', { ascending: false }),
    supabase.from('plan_uploads').select('id,original_filename,analysis_status,created_at').eq('project_id', id).order('created_at', { ascending: false }),
    supabase.from('documents').select('id,name,category').eq('project_id', id).order('created_at', { ascending: false }),
    supabase.from('expenses').select('id,supplier,amount_ttc,amount_ht,category,expense_date').eq('project_id', id).neq('status', 'archive').order('created_at', { ascending: false }),
    supabase.from('time_entries').select('hours,employee_id').eq('project_id', id),
    supabase.from('employees').select('id,full_name,role,color,hourly_cost').eq('user_id', user.id),
    supabase.from('assignments').select('employee_id,start_hour,end_hour').eq('project_id', id),
    supabase.from('vehicle_logs').select('vehicle_id').eq('project_id', id),
    supabase.from('vehicles').select('id,name,plate').eq('user_id', user.id),
    supabase.from('subcontractor_invoices').select('amount_ht,amount_ttc,status').eq('project_id', id).eq('user_id', user.id),
    supabase.from('supplier_documents')
      .select('id,doc_type,supplier,doc_number,doc_date,total_ht,total_ttc,is_selected,consultation_label,storage_path,source,created_at, supplier_document_lines(id,designation,quantity,unit,unit_price_ht,total_ht,quality,sort_order)')
      .eq('project_id', id).eq('user_id', user.id).order('created_at', { ascending: false }),
  ])

  // Album photo : images des documents + photos de pointage, URLs signées.
  const [{ data: photoDocs }, { data: presPhotos }] = await Promise.all([
    supabase.from('documents').select('storage_path,created_at').eq('project_id', id).or('file_type.ilike.image/%,category.eq.photo').order('created_at', { ascending: false }).limit(30),
    supabase.from('presence_events').select('photo_path,occurred_at').eq('project_id', id).not('photo_path', 'is', null).order('occurred_at', { ascending: false }).limit(30),
  ])
  const photoPaths = [
    ...((photoDocs || []) as { storage_path: string }[]).map(d => d.storage_path),
    ...((presPhotos || []) as { photo_path: string }[]).map(p => p.photo_path),
  ].filter(Boolean)
  let photoUrls: string[] = []
  if (photoPaths.length) {
    const { data: signed } = await supabase.storage.from('documents').createSignedUrls(photoPaths, 3600)
    photoUrls = (signed || []).map(s => s.signedUrl).filter(Boolean) as string[]
  }

  const { data: notes } = await supabase.from('notes')
    .select('id, body, author_name, author_employee_id, created_at')
    .eq('project_id', id).eq('user_id', user.id).order('created_at', { ascending: false })

  // Réception de chantier (PV) + éventuelle demande de signature associée.
  const reception = (await supabase.from('project_receptions').select('*').eq('project_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle()).data
  const receptionSig = reception
    ? (await supabase.from('document_signatures').select('id,status').eq('reception_id', reception.id).order('created_at', { ascending: false }).limit(1).maybeSingle()).data
    : null

  const isSigned = (s: string) => s === 'accepte' || s === 'transforme'
  const isOpen = (s: string) => s === 'envoyee' || s === 'en_retard' || s === 'payee_partiellement'

  const totalDepenses = (expenses || []).reduce((s, e) => s + num(e.amount_ttc), 0)
  const totalHeures = (timeEntries || []).reduce((s, t) => s + num(t.hours), 0)
  // Dérive prévu vs pointé : heures planifiées (affectations, défaut 8h–17h) vs heures pointées.
  const heuresPlanifiees = (assignments || []).reduce((s, a: { start_hour?: number | null; end_hour?: number | null }) =>
    s + Math.max(0, (num(a.end_hour) || 17) - (num(a.start_hour) || 8)), 0) || num(p.planned_hours)
  const derive = totalHeures - heuresPlanifiees
  const empCost = new Map((employees || []).map(e => [e.id, num(e.hourly_cost)]))
  const empById = new Map((employees || []).map(e => [e.id, e]))

  // Bloc financier (admin)
  const revenuSigne = (quotes || []).filter(q => isSigned(q.status)).reduce((s, q) => s + num(q.subtotal_ht), 0)
  const facture =(invoices || []).filter(i => i.status !== 'brouillon' && i.status !== 'annulee').reduce((s, i) => s + num(i.total_ttc), 0)
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

  // ── Achats fournisseurs (devis / BL / factures scannés) ──
  const toNum = (v: unknown) => (v === null || v === undefined ? null : Number(v))
  type SDLineRaw = { id: string; designation: string; quantity: unknown; unit: string | null; unit_price_ht: unknown; total_ht: unknown; quality: string | null; sort_order: number }
  type SDRaw = { id: string; doc_type: 'devis' | 'bl' | 'facture'; supplier: string | null; doc_number: string | null; doc_date: string | null; total_ht: unknown; total_ttc: unknown; is_selected: boolean; consultation_label: string | null; storage_path: string | null; source: string; created_at: string; supplier_document_lines: SDLineRaw[] | null }
  const achatDocs: AchatDoc[] = ((supplierDocs || []) as SDRaw[]).map(d => ({
    id: d.id, doc_type: d.doc_type, supplier: d.supplier, doc_number: d.doc_number, doc_date: d.doc_date,
    total_ht: toNum(d.total_ht), total_ttc: toNum(d.total_ttc), is_selected: d.is_selected,
    consultation_label: d.consultation_label, storage_path: d.storage_path, source: d.source, created_at: d.created_at,
    lines: (d.supplier_document_lines || [])
      .map(l => ({ id: l.id, designation: l.designation, quantity: toNum(l.quantity), unit: l.unit, unit_price_ht: toNum(l.unit_price_ht), total_ht: toNum(l.total_ht), quality: l.quality, sort_order: l.sort_order }))
      .sort((a, b) => a.sort_order - b.sort_order),
  }))

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
    <DottedPage className="space-y-4">
      {/* Hero animé */}
      <div className="relative overflow-hidden rounded-2xl shadow-[var(--shadow-lg)] animate-hero-pan p-5 sm:p-6"
        style={{ backgroundImage: 'linear-gradient(120deg, #FF9440 0%, #E0674C 35%, #C14E33 65%, #FF7A1A 100%)' }}>
        <div aria-hidden className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.14) 1px, transparent 1px)', backgroundSize: '16px 16px' }} />
        <div className="relative flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3 min-w-0">
            <Link href="/chantiers" className="grid place-items-center w-9 h-9 rounded-xl bg-white/20 text-white hover:bg-white/30 transition-colors flex-shrink-0 mt-0.5 backdrop-blur-sm">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="min-w-0">
              {p.project_type && <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-white/90 bg-white/15 px-2 py-0.5 rounded-full mb-1.5"><HardHat className="w-3 h-3" /> {p.project_type}</span>}
              <h1 className="text-2xl sm:text-[28px] font-bold font-heading text-white leading-tight truncate">{p.title}</h1>
              <div className="flex items-center gap-3 mt-1 text-white/85 text-sm flex-wrap">
                {p.clients && <Link href={`/clients/${p.client_id}`} className="inline-flex items-center gap-1.5 hover:text-white"><User className="w-3.5 h-3.5" /> {clientDisplayName(p.clients)}</Link>}
                {addr && <span className="inline-flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> {p.address}</span>}
              </div>
            </div>
          </div>
          <StatusSelect projectId={id} current={p.status as ProjectStatus} clientId={p.client_id} />
        </div>
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
      <Card className="shadow-[var(--shadow-sm)]">
        <CardContent className="p-4 space-y-3">
          {(p.start_date || p.end_date) && (
            <div className="flex items-center gap-2 text-sm"><Calendar className="w-4 h-4 text-gray-400" /><span className="text-gray-700">{p.start_date ? formatDate(p.start_date) : '?'} → {p.end_date ? formatDate(p.end_date) : '?'}</span></div>
          )}
          {p.description && <p className="text-sm text-gray-700 whitespace-pre-line">{p.description}</p>}
          <AvancementControl projectId={id} startDate={p.start_date ?? null} endDate={p.end_date ?? null} status={p.status} />
        </CardContent>
      </Card>

      {/* Bloc financier (admin) — donut de répartition */}
      <ChantierFinancePanel
        margePct={margePct} marge={marge} facture={facture} encaisse={encaisse} reste={reste}
        revenuSigne={revenuSigne} coutMainOeuvre={coutMainOeuvre} coutDepensesHt={coutDepensesHt}
        coutSousTraitance={coutSousTraitance} totalHeures={totalHeures}
      />

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
            <span className="flex items-center gap-1.5 text-gray-600"><Clock className="w-4 h-4 text-gray-400" />{totalHeures.toFixed(1).replace('.0', '')} h pointées</span>
            {heuresPlanifiees > 0 && (
              <span className="flex items-center gap-1.5 text-gray-600">
                {heuresPlanifiees.toFixed(1).replace('.0', '')} h planifiées
                <span className={`font-semibold ${derive > 0 ? 'text-rose-600' : 'text-[#3F7A2E]'}`}>
                  ({derive > 0 ? '+' : ''}{derive.toFixed(1).replace('.0', '')} h)
                </span>
              </span>
            )}
            {projVehicles.length > 0 && (
              <span className="flex items-center gap-1.5 text-gray-600"><Truck className="w-4 h-4 text-gray-400" />{projVehicles.map(v => v!.name + (v!.plate ? ` (${v!.plate})` : '')).join(', ')}</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Réception de chantier (PV signable + réserves) */}
      <ReceptionSection
        projectId={id}
        clientName={p.clients ? clientDisplayName(p.clients) : 'Client'}
        initial={reception as Reception | null}
        signatureId={receptionSig?.id ?? null}
      />

      {/* Album photo (documents images + pointages) */}
      {photoUrls.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2"><Camera className="w-4 h-4 text-gray-400" /> Album photo <span className="text-sm font-normal text-gray-400">· {photoUrls.length}</span></CardTitle>
            <Link href={`/documents?project=${id}`}><Button variant="ghost" size="sm">Tout voir</Button></Link>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {photoUrls.map((u, i) => (
                <a key={i} href={u} target="_blank" rel="noopener noreferrer" className="block aspect-square rounded-lg overflow-hidden bg-gray-100 border border-gray-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt={`Photo ${i + 1}`} className="w-full h-full object-cover hover:scale-105 transition-transform" />
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      </div>

      {/* Colonne latérale : localisation + magasins + notes */}
      <div className="space-y-4">
      {/* Bloc localisation */}
      {addr && (
        <Card className="shadow-[var(--shadow-sm)] flex flex-col">
          <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-base flex items-center gap-2"><MapPin className="w-4 h-4 text-gray-400" /> Localisation</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4 flex-1 flex flex-col">
            <div className="relative rounded-xl overflow-hidden border border-gray-200 flex-1 min-h-[340px]">
              <iframe title="Carte du chantier" src={mapSrc} loading="lazy" className="absolute inset-0 block w-full h-full" referrerPolicy="no-referrer-when-downgrade" />
              {/* Boutons flottants façon Apple (verre dépoli) par-dessus la carte */}
              <div className="absolute bottom-3 right-3 flex flex-col gap-2 items-end z-10">
                <a href={itineraire} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 h-9 pl-3 pr-3.5 rounded-full bg-[#C14E33] text-white border border-white/25 backdrop-blur-sm shadow-[0_4px_16px_rgba(0,0,0,0.28)] text-[13px] font-semibold hover:bg-[#a8402a] transition-colors">
                  <Navigation className="w-4 h-4" /> Itinéraire
                </a>
                <a href={applePlans} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 h-9 pl-3 pr-3.5 rounded-full bg-[#0A84FF] text-white border border-white/25 backdrop-blur-sm shadow-[0_4px_16px_rgba(0,0,0,0.28)] text-[13px] font-semibold hover:bg-[#0a76e0] transition-colors">
                  <MapPin className="w-4 h-4" /> Plans
                </a>
              </div>
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

      {/* Achats & fournisseurs : comparatif devis + rapprochement Devis↔BL↔Facture */}
      <AchatsSection projectId={id} docs={achatDocs} />

      {/* Notes du chantier (admin + salariés) */}
      <NotesSection projectId={id} ownerId={user.id} authorName={ownerName} initial={(notes || []) as NoteRow[]} />

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
    </DottedPage>
  )
}
