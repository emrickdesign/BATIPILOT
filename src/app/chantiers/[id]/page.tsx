import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ArrowLeft, MapPin, User, Calendar, FileText, Receipt, ScanLine, HardHat,
  FolderOpen, ReceiptText, Clock, Navigation, Users2, Truck, Plus,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Project, ProjectStatus } from '@/types'
import { clientDisplayName } from '@/lib/chantiers'
import { getOwnerName } from '@/lib/profile'
import DottedPage from '@/components/PageDottedBg'
import DottedCard from '@/components/charts/DottedCard'
import ChantierFinancePanel from './ChantierFinancePanel'
import StatusSelect from '../StatusSelect'
import AchatsSection, { type AchatDoc } from './AchatsSection'
import AddTicketDialog from './AddTicketDialog'
import AddDocumentDialog from './AddDocumentDialog'
import AvancementControl from './AvancementControl'
import NotesSection, { type NoteRow } from './NotesSection'
import ReceptionSection, { type Reception } from './ReceptionSection'

const num = (v: unknown) => Number(v) || 0

// Pastille d'action style Apple (verre dépoli, arrondi, ombre douce)
const pillCls = 'inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-white/80 backdrop-blur-sm border border-gray-200/80 shadow-[0_2px_8px_rgba(0,0,0,0.06)] text-sm font-medium text-gray-700 hover:bg-white hover:shadow-[0_4px_12px_rgba(0,0,0,0.10)] transition-all'
// Bouton d'action coloré (pill plein) — utilisé pour les CTA « + » des sections
const pillColor = 'inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-primary text-white text-[13px] font-semibold shadow-[0_2px_8px_rgba(193,78,51,0.28)] hover:bg-[#a8402a] transition-colors'
// Chip d'icône coloré pour les titres de section
const titleCls = 'text-[17px] font-bold font-heading text-marine flex items-center gap-2'

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
    supabase.from('assignments').select('employee_id,start_hour,end_hour,date').eq('project_id', id).eq('user_id', user.id),
    supabase.from('vehicle_logs').select('vehicle_id').eq('project_id', id),
    supabase.from('vehicles').select('id,name,plate').eq('user_id', user.id),
    supabase.from('subcontractor_invoices').select('amount_ht,amount_ttc,status').eq('project_id', id).eq('user_id', user.id),
    supabase.from('supplier_documents')
      .select('id,doc_type,supplier,doc_number,doc_date,total_ht,total_ttc,is_selected,consultation_label,storage_path,source,created_at, supplier_document_lines(id,designation,quantity,unit,unit_price_ht,total_ht,quality,sort_order)')
      .eq('project_id', id).eq('user_id', user.id).order('created_at', { ascending: false }),
  ])

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

  // ── Aperçu planning de la semaine (lundi → dimanche) ──
  const nowD = new Date()
  const dowMon = (nowD.getDay() + 6) % 7 // 0 = lundi
  const monday = new Date(nowD); monday.setDate(nowD.getDate() - dowMon)
  const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const weekDays = Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return { iso: isoDay(d), label: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'][i], dayNum: d.getDate(), isToday: isoDay(d) === isoDay(nowD) } })
  const weekAssign = new Map<string, typeof team>()
  for (const a of (assignments || []) as { employee_id: string; date: string | null }[]) {
    if (!a.date) continue
    const emp = empById.get(a.employee_id)
    if (!emp) continue
    const arr = weekAssign.get(a.date) || []
    if (!arr.some(e => e.id === emp.id)) arr.push(emp)
    weekAssign.set(a.date, arr)
  }
  const hasWeek = weekDays.some(d => (weekAssign.get(d.iso)?.length ?? 0) > 0)

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


      {/* Haut : Financier (gauche) · Devis/Factures/Dépenses/Documents (milieu) · Localisation (droite) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
      {/* Colonne gauche : infos + financier (le financier s'étire pour aligner son bas sur Documents) */}
      <div className="flex flex-col gap-4">
        {/* Infos */}
        <DottedCard>
          <div className="p-4 space-y-3">
            {(p.start_date || p.end_date) && (
              <div className="flex items-center gap-2 text-sm"><Calendar className="w-4 h-4 text-gray-400" /><span className="text-gray-700">{p.start_date ? formatDate(p.start_date) : '?'} → {p.end_date ? formatDate(p.end_date) : '?'}</span></div>
            )}
            {p.description && <p className="text-sm text-gray-700 whitespace-pre-line">{p.description}</p>}
            <AvancementControl projectId={id} startDate={p.start_date ?? null} endDate={p.end_date ?? null} status={p.status} />
          </div>
        </DottedCard>

        {/* Financier — donut de répartition (s'étire pour aligner son bas) */}
        <div className="flex-1 [&>*]:h-full">
          <ChantierFinancePanel
            margePct={margePct} marge={marge} facture={facture} encaisse={encaisse} reste={reste}
            revenuSigne={revenuSigne} coutMainOeuvre={coutMainOeuvre} coutDepensesHt={coutDepensesHt}
            coutSousTraitance={coutSousTraitance} totalHeures={totalHeures}
          />
        </div>
      </div>

      {/* Colonne milieu : Devis · Factures · Dépenses · Documents */}
      <div className="space-y-4">
        {/* Devis liés */}
        <DottedCard>
          <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between">
            <CardTitle className={titleCls}><span className="grid place-items-center w-7 h-7 rounded-lg bg-[#8A3FA0]/12 text-[#8A3FA0]"><FileText className="w-4 h-4" /></span> Devis ({quotes?.length || 0})</CardTitle>
            <Link href={devisLink} className={pillColor}><Plus className="w-3.5 h-3.5" /> Devis</Link>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {!quotes?.length ? <p className="text-sm text-gray-400 py-2">Aucun devis rattaché</p> : (
              <div className="space-y-2">
                {quotes.map(q => (
                  <Link key={q.id} href={`/devis/${q.id}`}>
                    <div className="flex items-center justify-between py-2 hover:bg-white/60 rounded px-2 -mx-2">
                      <div><span className="font-mono text-xs text-gray-400">{q.quote_number}</span><span className="ml-2 text-sm text-gray-700">{formatDate(q.issue_date)}</span></div>
                      <span className="text-sm font-semibold">{formatCurrency(q.total_ttc)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </DottedCard>

        {/* Factures liées */}
        <DottedCard>
          <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between">
            <CardTitle className={titleCls}><span className="grid place-items-center w-7 h-7 rounded-lg bg-[#C14E33]/12 text-[#C14E33]"><Receipt className="w-4 h-4" /></span> Factures ({invoices?.length || 0})</CardTitle>
            <Link href={factureLink} className={pillColor}><Plus className="w-3.5 h-3.5" /> Facture</Link>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {!invoices?.length ? <p className="text-sm text-gray-400 py-2">Aucune facture rattachée</p> : (
              <div className="space-y-2">
                {invoices.map(inv => (
                  <Link key={inv.id} href={`/factures/${inv.id}`}>
                    <div className="flex items-center justify-between py-2 hover:bg-white/60 rounded px-2 -mx-2">
                      <span className="font-mono text-xs text-gray-400">{inv.invoice_number}</span>
                      <span className="text-sm font-semibold">{formatCurrency(num(inv.amount_due) || num(inv.total_ttc))}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </DottedCard>

        {/* Dépenses liées */}
        <DottedCard>
          <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between">
            <CardTitle className={titleCls}><span className="grid place-items-center w-7 h-7 rounded-lg bg-[#B5811E]/12 text-[#B5811E]"><ReceiptText className="w-4 h-4" /></span> Dépenses ({expenses?.length || 0}){totalDepenses > 0 && <span className="text-[13px] font-normal text-gray-500">· {formatCurrency(totalDepenses)}</span>}</CardTitle>
            <AddTicketDialog projectId={id} pillClassName={pillColor} />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {!expenses?.length ? <p className="text-sm text-gray-400 py-2">Aucune dépense rattachée</p> : (
              <div className="space-y-2">
                {expenses.map(exp => (
                  <Link key={exp.id} href="/depenses">
                    <div className="flex items-center justify-between py-2 hover:bg-white/60 rounded px-2 -mx-2">
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
        </DottedCard>

        {/* Documents liés */}
        <DottedCard>
          <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between">
            <CardTitle className={titleCls}><span className="grid place-items-center w-7 h-7 rounded-lg bg-[#1F7A6E]/12 text-[#1F7A6E]"><FolderOpen className="w-4 h-4" /></span> Documents ({documents?.length || 0})</CardTitle>
            <AddDocumentDialog projectId={id} pillClassName={pillColor} />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {!documents?.length ? <p className="text-sm text-gray-400 py-2">Aucun document rattaché</p> : (
              <div className="space-y-2">
                {documents.map(doc => (
                  <Link key={doc.id} href={`/documents?project=${id}`}>
                    <div className="flex items-center justify-between py-2 hover:bg-white/60 rounded px-2 -mx-2">
                      <div className="flex items-center gap-2 min-w-0"><FileText className="w-4 h-4 text-gray-400 flex-shrink-0" /><span className="text-sm text-gray-700 truncate">{doc.name}</span></div>
                      {doc.category && <Badge variant="outline" className="text-xs flex-shrink-0">{doc.category}</Badge>}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </DottedCard>
      </div>

      {/* Colonne droite : localisation */}
      <div>
      {addr && (
        <DottedCard>
          <div className="p-4">
            <h3 className={titleCls + ' mb-3'}><span className="grid place-items-center w-7 h-7 rounded-lg bg-[#C14E33]/12 text-[#C14E33]"><MapPin className="w-4 h-4" /></span> Localisation</h3>
            <div className="relative rounded-xl overflow-hidden border border-white/60 min-h-[420px] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)]">
              {/* Décalé vers le haut : le conteneur (overflow-hidden) masque le petit encart blanc « Agrandir le plan » de Google en haut à gauche */}
              <iframe title="Carte du chantier" src={mapSrc} loading="lazy" className="absolute -top-[58px] left-0 block w-full h-[calc(100%+58px)]" referrerPolicy="no-referrer-when-downgrade" />
              {/* Boutons flottants façon Apple par-dessus la carte */}
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
          </div>
        </DottedCard>
      )}
      </div>
      </div>

      {/* Équipe (moitié) + Notes de chantier (moitié) */}
      <div className="grid lg:grid-cols-2 gap-4 items-stretch">
        <DottedCard>
          <div className="p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className={titleCls}><span className="grid place-items-center w-7 h-7 rounded-lg bg-[#2F6BE8]/12 text-[#2F6BE8]"><Users2 className="w-4 h-4" /></span> Équipe ({team.length})</h3>
              <Link href="/planning" className={pillColor}>Affecter</Link>
            </div>
            {team.length === 0 ? (
              <p className="text-sm text-gray-400 py-1">Aucun salarié affecté. <Link href="/planning" className="text-primary hover:underline">Affecter une équipe</Link></p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {team.map(e => (
                  <span key={e.id} className="inline-flex items-center gap-1.5 rounded-full bg-white/70 border border-[#EBD9CE] pl-1.5 pr-2.5 py-1 text-sm">
                    <span className="w-5 h-5 rounded-full flex-shrink-0" style={{ backgroundColor: e.color || '#94A3B8' }} />
                    {e.full_name}
                    {e.id === chef?.id && <Badge className="bg-[#F3E5D6] text-[#7A4220] border-0 text-[10px]">chef</Badge>}
                  </span>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-4 text-sm pt-3">
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

            {/* Aperçu planning de la semaine */}
            <div className="mt-4 pt-3 border-t border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Cette semaine</p>
                <Link href="/planning" className="text-[11px] font-medium text-primary hover:underline">Planning complet</Link>
              </div>
              <div className="grid grid-cols-7 gap-1.5">
                {weekDays.map(d => {
                  const emps = weekAssign.get(d.iso) || []
                  return (
                    <div key={d.iso} className={`rounded-lg border p-1.5 text-center min-h-[60px] ${d.isToday ? 'border-primary/40 bg-primary/[0.05]' : 'border-gray-100 bg-white/50'}`}>
                      <div className={`text-[10px] font-medium ${d.isToday ? 'text-primary' : 'text-gray-400'}`}>{d.label}</div>
                      <div className={`text-[13px] font-bold leading-tight ${d.isToday ? 'text-primary' : 'text-marine'}`}>{d.dayNum}</div>
                      <div className="flex flex-wrap justify-center gap-0.5 mt-1">
                        {emps.slice(0, 4).map(e => (
                          <span key={e.id} className="w-4 h-4 rounded-full text-[7px] font-bold text-white grid place-items-center flex-shrink-0" style={{ backgroundColor: e.color || '#94A3B8' }} title={e.full_name}>
                            {(e.full_name || '').split(' ').map((w: string) => w[0]).slice(0, 2).join('')}
                          </span>
                        ))}
                        {emps.length > 4 && <span className="text-[8px] text-gray-400 self-center">+{emps.length - 4}</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
              {!hasWeek && <p className="text-[11px] text-gray-400 mt-2">Personne d&apos;affecté cette semaine. <Link href="/planning" className="text-primary hover:underline">Planifier</Link></p>}
            </div>
          </div>
        </DottedCard>

        <NotesSection projectId={id} ownerId={user.id} authorName={ownerName} initial={(notes || []) as NoteRow[]} />
      </div>

      {/* Achats & fournisseurs — pleine largeur (import devis → BL → facture → rapprochement) */}
      <AchatsSection projectId={id} docs={achatDocs} />

      {/* Réception de chantier — en fin de chantier (ou si un PV a déjà été démarré) */}
      {(['termine', 'a_facturer', 'facture', 'paye'].includes(p.status) || reception) && (
        <ReceptionSection
          projectId={id}
          clientName={p.clients ? clientDisplayName(p.clients) : 'Client'}
          initial={reception as Reception | null}
          signatureId={receptionSig?.id ?? null}
        />
      )}

      {/* Plans liés */}
      {!!plans?.length && (
        <DottedCard>
          <CardHeader className="pb-2 pt-4 px-4"><CardTitle className={titleCls}><span className="grid place-items-center w-7 h-7 rounded-lg bg-gray-200/70 text-gray-500"><ScanLine className="w-4 h-4" /></span> Plans ({plans.length})</CardTitle></CardHeader>
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
        </DottedCard>
      )}
    </DottedPage>
  )
}
