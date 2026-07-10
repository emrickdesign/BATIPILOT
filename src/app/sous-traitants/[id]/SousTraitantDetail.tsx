'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  ArrowLeft, Phone, Mail, MapPin, Star, Trash2, Pencil, Upload, Plus, FileText,
  ShieldCheck, ShieldAlert, HardHat, Wallet, MessageSquare, FileCheck2, Send,
  CheckCircle2, ExternalLink, Building2, CreditCard,
} from 'lucide-react'
import type {
  Subcontractor, SubcontractorDocument, SubcontractorContract, SubcontractorInvoice,
  SubcontractorMessage, SubDocType, SubContractStatus, SubInvoiceStatus, SubcontractorStatus,
} from '@/types'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  tradeOptions, subStatusLabels, subDocTypeLabels, requiredDocTypes,
  subContractStatusLabels, subInvoiceStatusLabels, subInitials, expiryState,
  complianceCheck, daysUntil,
} from '@/lib/soustraitants'

type Doc = SubcontractorDocument & { url: string | null }
type Inv = SubcontractorInvoice & { url: string | null }
type ProjectOption = { id: string; title: string }

const selectClass = 'w-full h-10 rounded-md border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary'

const TABS = [
  { id: 'infos', label: 'Infos', icon: Building2 },
  { id: 'conformite', label: 'Conformité', icon: ShieldCheck },
  { id: 'contrats', label: 'Contrats', icon: HardHat },
  { id: 'factures', label: 'Factures', icon: Wallet },
  { id: 'discussion', label: 'Discussion', icon: MessageSquare },
] as const

export default function SousTraitantDetail({
  sub, docs, contracts, invoices, messages, projects,
}: {
  sub: Subcontractor
  docs: Doc[]
  contracts: SubcontractorContract[]
  invoices: Inv[]
  messages: SubcontractorMessage[]
  projects: ProjectOption[]
}) {
  const router = useRouter()
  const [tab, setTab] = useState<typeof TABS[number]['id']>('infos')
  const supabase = () => createClient()
  const projTitle = useMemo(() => new Map(projects.map(p => [p.id, p.title])), [projects])

  const conf = complianceCheck(docs, sub.insurance_expiry)

  async function updateSub(patch: Partial<Subcontractor>) {
    const { error } = await supabase().from('subcontractors').update(patch).eq('id', sub.id)
    if (error) { toast.error('Erreur'); return false }
    router.refresh(); return true
  }

  async function deleteSub() {
    if (!confirm('Supprimer ce sous-traitant et toutes ses données liées ?')) return
    const { error } = await supabase().from('subcontractors').delete().eq('id', sub.id)
    if (error) { toast.error('Erreur'); return }
    toast.success('Sous-traitant supprimé')
    router.push('/sous-traitants')
  }

  return (
    <div className="space-y-5 max-w-3xl">
      {/* En-tête */}
      <div className="flex items-start gap-3">
        <Link href="/sous-traitants"><Button variant="ghost" size="sm" className="gap-1"><ArrowLeft className="w-4 h-4" /> Retour</Button></Link>
      </div>
      <div className="flex items-start gap-3 flex-wrap">
        <span className="grid place-items-center w-12 h-12 rounded-full bg-accent text-primary font-bold flex-shrink-0">{subInitials(sub.company_name)}</span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-gray-900 leading-tight truncate">{sub.company_name}</h1>
          <div className="flex items-center gap-2 flex-wrap mt-0.5">
            {sub.trade && <span className="text-sm text-gray-500">{sub.trade}</span>}
            <Badge className={`border-0 text-[11px] ${sub.status === 'actif' ? 'bg-emerald-50 text-emerald-700' : sub.status === 'liste_noire' ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-500'}`}>{subStatusLabels[sub.status]}</Badge>
            {conf.ok
              ? <Badge className="bg-emerald-50 text-emerald-700 border-0 text-[11px] gap-1"><ShieldCheck className="w-3 h-3" /> Conforme</Badge>
              : <Badge className="bg-red-50 text-red-700 border-0 text-[11px] gap-1"><ShieldAlert className="w-3 h-3" /> Non conforme</Badge>}
          </div>
          {/* Notation */}
          <div className="flex items-center gap-1 mt-1.5">
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} onClick={() => updateSub({ rating: n === sub.rating ? 0 : n })} title={`${n}/5`}>
                <Star className={`w-4 h-4 ${(sub.rating || 0) >= n ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}`} />
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {sub.phone && <a href={`tel:${sub.phone}`}><Button variant="outline" size="sm" className="gap-1"><Phone className="w-4 h-4" /> Appeler</Button></a>}
          <Button variant="destructive-soft" size="sm" onClick={deleteSub} className="gap-1"><Trash2 className="w-4 h-4" /></Button>
        </div>
      </div>

      {/* Onglets */}
      <div className="flex items-center gap-1 border-b border-gray-200 overflow-x-auto">
        {TABS.map(t => {
          const active = tab === t.id
          const count = t.id === 'conformite' ? docs.length : t.id === 'contrats' ? contracts.length : t.id === 'factures' ? invoices.length : t.id === 'discussion' ? messages.length : 0
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${active ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
              <t.icon className="w-4 h-4" />{t.label}
              {count > 0 && <span className={`text-[11px] rounded-full px-1.5 ${active ? 'bg-accent text-primary' : 'bg-gray-100 text-gray-500'}`}>{count}</span>}
            </button>
          )
        })}
      </div>

      {tab === 'infos' && <InfosTab sub={sub} onSave={updateSub} />}
      {tab === 'conformite' && <ConformiteTab sub={sub} docs={docs} conf={conf} />}
      {tab === 'contrats' && <ContratsTab sub={sub} contracts={contracts} projects={projects} projTitle={projTitle} />}
      {tab === 'factures' && <FacturesTab sub={sub} invoices={invoices} contracts={contracts} projects={projects} projTitle={projTitle} />}
      {tab === 'discussion' && <DiscussionTab sub={sub} messages={messages} />}
    </div>
  )
}

/* ─── Onglet Infos ─────────────────────────────────────────────────────── */
function InfosTab({ sub, onSave }: { sub: Subcontractor; onSave: (p: Partial<Subcontractor>) => Promise<boolean> }) {
  const [edit, setEdit] = useState(false)
  const [saving, setSaving] = useState(false)
  const [f, setF] = useState({
    trade: sub.trade || '', contact_name: sub.contact_name || '', phone: sub.phone || '',
    email: sub.email || '', address: sub.address || '', siret: sub.siret || '',
    vat_number: sub.vat_number || '', iban: sub.iban || '',
    insurance_decennale: sub.insurance_decennale || '', insurance_expiry: sub.insurance_expiry || '',
    hourly_rate: sub.hourly_rate != null ? String(sub.hourly_rate) : '',
    status: sub.status as SubcontractorStatus, notes: sub.notes || '',
  })
  const set = (k: keyof typeof f, v: string) => setF(p => ({ ...p, [k]: v }))

  async function save() {
    setSaving(true)
    const ok = await onSave({
      trade: f.trade || null, contact_name: f.contact_name || null, phone: f.phone || null,
      email: f.email || null, address: f.address || null, siret: f.siret || null,
      vat_number: f.vat_number || null, iban: f.iban || null,
      insurance_decennale: f.insurance_decennale || null, insurance_expiry: f.insurance_expiry || null,
      hourly_rate: f.hourly_rate ? Number(f.hourly_rate) : null, status: f.status, notes: f.notes || null,
    })
    setSaving(false)
    if (ok) { toast.success('Enregistré'); setEdit(false) }
  }

  if (!edit) {
    const insState = expiryState(sub.insurance_expiry)
    return (
      <Card><CardContent className="p-5 space-y-4">
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => setEdit(true)} className="gap-1"><Pencil className="w-3.5 h-3.5" /> Modifier</Button>
        </div>
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <Info label="Contact" value={sub.contact_name} />
          <Info label="Téléphone" value={sub.phone} icon={<Phone className="w-3.5 h-3.5" />} href={sub.phone ? `tel:${sub.phone}` : undefined} />
          <Info label="Email" value={sub.email} icon={<Mail className="w-3.5 h-3.5" />} href={sub.email ? `mailto:${sub.email}` : undefined} />
          <Info label="Adresse" value={sub.address} icon={<MapPin className="w-3.5 h-3.5" />} />
          <Info label="SIRET" value={sub.siret} />
          <Info label="N° TVA" value={sub.vat_number} />
          <Info label="IBAN" value={sub.iban} icon={<CreditCard className="w-3.5 h-3.5" />} />
          <Info label="Taux horaire" value={sub.hourly_rate != null ? `${sub.hourly_rate} €/h` : null} />
          <Info label="Assurance décennale" value={sub.insurance_decennale} />
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Échéance décennale</p>
            {sub.insurance_expiry ? (
              <p className={`font-medium ${insState === 'expire' ? 'text-red-600' : insState === 'bientot' ? 'text-amber-600' : 'text-gray-800'}`}>
                {formatDate(sub.insurance_expiry)}{insState === 'expire' ? ' · expirée' : insState === 'bientot' ? ` · dans ${daysUntil(sub.insurance_expiry)} j` : ''}
              </p>
            ) : <p className="text-gray-400">—</p>}
          </div>
        </div>
        {sub.notes && <div className="pt-3 border-t border-gray-100"><p className="text-sm text-gray-500 italic whitespace-pre-line">{sub.notes}</p></div>}
      </CardContent></Card>
    )
  }

  return (
    <Card><CardContent className="p-5 space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <div><Label>Spécialité</Label>
          <select className={selectClass} value={f.trade} onChange={e => set('trade', e.target.value)}>
            <option value="">—</option>{tradeOptions.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div><Label>Statut</Label>
          <select className={selectClass} value={f.status} onChange={e => set('status', e.target.value)}>
            <option value="actif">Actif</option><option value="inactif">Inactif</option><option value="liste_noire">Liste noire</option>
          </select>
        </div>
        <div><Label>Contact</Label><Input value={f.contact_name} onChange={e => set('contact_name', e.target.value)} /></div>
        <div><Label>Téléphone</Label><Input value={f.phone} onChange={e => set('phone', e.target.value)} /></div>
        <div><Label>Email</Label><Input value={f.email} onChange={e => set('email', e.target.value)} /></div>
        <div><Label>Taux horaire (€/h)</Label><Input type="number" value={f.hourly_rate} onChange={e => set('hourly_rate', e.target.value)} /></div>
        <div className="sm:col-span-2"><Label>Adresse</Label><Input value={f.address} onChange={e => set('address', e.target.value)} /></div>
        <div><Label>SIRET</Label><Input value={f.siret} onChange={e => set('siret', e.target.value)} /></div>
        <div><Label>N° TVA</Label><Input value={f.vat_number} onChange={e => set('vat_number', e.target.value)} /></div>
        <div><Label>IBAN</Label><Input value={f.iban} onChange={e => set('iban', e.target.value)} /></div>
        <div><Label>N° assurance décennale</Label><Input value={f.insurance_decennale} onChange={e => set('insurance_decennale', e.target.value)} /></div>
        <div><Label>Échéance décennale</Label><Input type="date" value={f.insurance_expiry} onChange={e => set('insurance_expiry', e.target.value)} /></div>
        <div className="sm:col-span-2"><Label>Notes</Label><Textarea value={f.notes} onChange={e => set('notes', e.target.value)} rows={3} /></div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => setEdit(false)}>Annuler</Button>
        <Button onClick={save} disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Button>
      </div>
    </CardContent></Card>
  )
}

function Info({ label, value, icon, href }: { label: string; value?: string | null; icon?: React.ReactNode; href?: string }) {
  return (
    <div>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      {value ? (
        href ? <a href={href} className="text-primary inline-flex items-center gap-1.5 font-medium">{icon}{value}</a>
          : <p className="text-gray-800 inline-flex items-center gap-1.5 font-medium">{icon}{value}</p>
      ) : <p className="text-gray-400">—</p>}
    </div>
  )
}

/* ─── Onglet Conformité (documents) ────────────────────────────────────── */
function ConformiteTab({ sub, docs, conf }: { sub: Subcontractor; docs: Doc[]; conf: ReturnType<typeof complianceCheck> }) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [type, setType] = useState<SubDocType>('attestation_vigilance')
  const [expiry, setExpiry] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)

  async function add() {
    setUploading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setUploading(false); return }
    let storage_path: string | null = null
    if (file) {
      const safe = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')
      storage_path = `st/${user.id}/${sub.id}/${Date.now()}-${safe}`
      const { error } = await supabase.storage.from('documents').upload(storage_path, file, { contentType: file.type || undefined, upsert: false })
      if (error) { toast.error('Erreur envoi fichier'); setUploading(false); return }
    }
    const { error } = await supabase.from('subcontractor_documents').insert({
      user_id: user.id, subcontractor_id: sub.id, type,
      name: file?.name || subDocTypeLabels[type], storage_path, expiry_date: expiry || null,
    })
    if (error) { toast.error('Erreur'); setUploading(false); return }
    toast.success('Document ajouté')
    setFile(null); setExpiry(''); if (fileRef.current) fileRef.current.value = ''
    setUploading(false); router.refresh()
  }

  async function del(d: Doc) {
    if (!confirm('Supprimer ce document ?')) return
    const supabase = createClient()
    if (d.storage_path) await supabase.storage.from('documents').remove([d.storage_path])
    await supabase.from('subcontractor_documents').delete().eq('id', d.id)
    toast.success('Supprimé'); router.refresh()
  }

  return (
    <div className="space-y-4">
      {/* Bandeau conformité */}
      <Card><CardContent className={`p-4 ${conf.ok ? 'bg-emerald-50/50' : 'bg-red-50/50'}`}>
        <div className="flex items-start gap-3">
          {conf.ok ? <ShieldCheck className="w-5 h-5 text-emerald-600 mt-0.5" /> : <ShieldAlert className="w-5 h-5 text-red-600 mt-0.5" />}
          <div className="text-sm">
            <p className={`font-semibold ${conf.ok ? 'text-emerald-700' : 'text-red-700'}`}>{conf.ok ? 'Obligation de vigilance respectée' : 'Dossier incomplet'}</p>
            {conf.missing.length > 0 && <p className="text-gray-600 mt-0.5">Pièces manquantes : {conf.missing.map(t => subDocTypeLabels[t]).join(', ')}</p>}
            {conf.expired > 0 && <p className="text-red-600 mt-0.5">{conf.expired} document(s) expiré(s).</p>}
            {conf.ok && <p className="text-gray-500 mt-0.5">Toutes les pièces obligatoires sont présentes et valides.</p>}
          </div>
        </div>
      </CardContent></Card>

      {/* Ajout document */}
      <Card><CardContent className="p-4 space-y-3">
        <p className="text-sm font-semibold text-gray-800">Ajouter une pièce</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><Label>Type</Label>
            <select className={selectClass} value={type} onChange={e => setType(e.target.value as SubDocType)}>
              {Object.entries(subDocTypeLabels).map(([k, v]) => <option key={k} value={k}>{v}{requiredDocTypes.includes(k as SubDocType) ? ' *' : ''}</option>)}
            </select>
          </div>
          <div><Label>Date d&apos;expiration</Label><Input type="date" value={expiry} onChange={e => setExpiry(e.target.value)} /></div>
          <div className="sm:col-span-2"><Label>Fichier (PDF, image…)</Label>
            <input ref={fileRef} type="file" onChange={e => setFile(e.target.files?.[0] || null)} className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-full file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-primary file:text-sm" />
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={add} disabled={uploading} className="gap-1.5"><Upload className="w-4 h-4" />{uploading ? 'Envoi…' : 'Ajouter'}</Button>
        </div>
      </CardContent></Card>

      {/* Liste documents */}
      {docs.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">Aucune pièce enregistrée.</p>
      ) : (
        <div className="space-y-2">
          {docs.map(d => {
            const st = expiryState(d.expiry_date)
            return (
              <Card key={d.id}><CardContent className="p-3 flex items-center gap-3">
                <span className="grid place-items-center w-9 h-9 rounded-lg bg-gray-100 text-gray-500 flex-shrink-0"><FileText className="w-4 h-4" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800 truncate">{subDocTypeLabels[d.type]}</p>
                  <p className="text-xs text-gray-400 truncate">{d.name}{d.expiry_date ? ` · échéance ${formatDate(d.expiry_date)}` : ''}</p>
                </div>
                {st && <Badge className={`border-0 text-[11px] ${st === 'expire' ? 'bg-red-50 text-red-700' : st === 'bientot' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>{st === 'expire' ? 'Expiré' : st === 'bientot' ? 'Bientôt' : 'Valide'}</Badge>}
                {d.url && <a href={d.url} target="_blank" rel="noopener noreferrer"><Button variant="ghost" size="icon-sm"><ExternalLink className="w-4 h-4" /></Button></a>}
                <Button variant="ghost" size="icon-sm" onClick={() => del(d)}><Trash2 className="w-4 h-4 text-gray-400" /></Button>
              </CardContent></Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ─── Onglet Contrats / missions ───────────────────────────────────────── */
function ContratsTab({ sub, contracts, projects, projTitle }: {
  sub: Subcontractor; contracts: SubcontractorContract[]; projects: ProjectOption[]; projTitle: Map<string, string>
}) {
  const router = useRouter()
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [f, setF] = useState({ title: '', project_id: '', amount_ht: '', retention_pct: '5', start_date: '', end_date: '', description: '' })
  const set = (k: keyof typeof f, v: string) => setF(p => ({ ...p, [k]: v }))

  async function add() {
    if (!f.title.trim()) { toast.error('Indiquez un intitulé'); return }
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    const { error } = await supabase.from('subcontractor_contracts').insert({
      user_id: user.id, subcontractor_id: sub.id, title: f.title.trim(),
      project_id: f.project_id || null, amount_ht: f.amount_ht ? Number(f.amount_ht) : null,
      retention_pct: f.retention_pct ? Number(f.retention_pct) : 0,
      start_date: f.start_date || null, end_date: f.end_date || null,
      description: f.description || null, status: 'en_preparation', progress: 0,
    })
    if (error) { toast.error('Erreur'); setSaving(false); return }
    toast.success('Contrat créé')
    setF({ title: '', project_id: '', amount_ht: '', retention_pct: '5', start_date: '', end_date: '', description: '' })
    setShowAdd(false); setSaving(false); router.refresh()
  }

  async function update(id: string, patch: Partial<SubcontractorContract>) {
    await createClient().from('subcontractor_contracts').update(patch).eq('id', id)
    router.refresh()
  }
  async function del(id: string) {
    if (!confirm('Supprimer ce contrat ?')) return
    await createClient().from('subcontractor_contracts').delete().eq('id', id)
    toast.success('Supprimé'); router.refresh()
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowAdd(v => !v)} className="gap-1.5"><Plus className="w-4 h-4" /> Nouveau contrat</Button>
      </div>

      {showAdd && (
        <Card><CardContent className="p-4 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2"><Label>Intitulé *</Label><Input value={f.title} onChange={e => set('title', e.target.value)} placeholder="Ex : Lot plomberie – rénovation Villa Martin" /></div>
            <div><Label>Chantier</Label>
              <select className={selectClass} value={f.project_id} onChange={e => set('project_id', e.target.value)}>
                <option value="">— Aucun</option>{projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </div>
            <div><Label>Montant HT (€)</Label><Input type="number" value={f.amount_ht} onChange={e => set('amount_ht', e.target.value)} /></div>
            <div><Label>Retenue de garantie (%)</Label><Input type="number" value={f.retention_pct} onChange={e => set('retention_pct', e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Début</Label><Input type="date" value={f.start_date} onChange={e => set('start_date', e.target.value)} /></div>
              <div><Label>Fin</Label><Input type="date" value={f.end_date} onChange={e => set('end_date', e.target.value)} /></div>
            </div>
            <div className="sm:col-span-2"><Label>Description</Label><Textarea value={f.description} onChange={e => set('description', e.target.value)} rows={2} /></div>
          </div>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setShowAdd(false)}>Annuler</Button><Button onClick={add} disabled={saving}>{saving ? 'Enregistrement…' : 'Créer'}</Button></div>
        </CardContent></Card>
      )}

      {contracts.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">Aucun contrat. Créez-en un pour suivre une mission sur un chantier.</p>
      ) : contracts.map(c => (
        <Card key={c.id}><CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold text-gray-900">{c.title}</p>
              {c.project_id && <Link href={`/chantiers/${c.project_id}`} className="text-xs text-primary inline-flex items-center gap-1"><HardHat className="w-3 h-3" />{projTitle.get(c.project_id) || 'Chantier'}</Link>}
            </div>
            <Button variant="ghost" size="icon-sm" onClick={() => del(c.id)}><Trash2 className="w-4 h-4 text-gray-400" /></Button>
          </div>
          {c.description && <p className="text-sm text-gray-500 whitespace-pre-line">{c.description}</p>}
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-600">
            {c.amount_ht != null && <span>Montant : <b className="text-gray-800">{formatCurrency(c.amount_ht)}</b> HT</span>}
            {c.retention_pct > 0 && <span>Retenue : {c.retention_pct}%{c.amount_ht != null ? ` (${formatCurrency(c.amount_ht * c.retention_pct / 100)})` : ''}</span>}
            {(c.start_date || c.end_date) && <span>{c.start_date ? formatDate(c.start_date) : '?'} → {c.end_date ? formatDate(c.end_date) : '?'}</span>}
          </div>
          {/* Avancement */}
          <div>
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1"><span>Avancement</span><span className="font-medium">{c.progress}%</span></div>
            <input type="range" min={0} max={100} step={5} value={c.progress} onChange={e => update(c.id, { progress: Number(e.target.value) })} className="w-full accent-[var(--primary)]" />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select className="h-8 rounded-full border border-gray-200 bg-white px-3 text-xs" value={c.status} onChange={e => update(c.id, { status: e.target.value as SubContractStatus })}>
              {(Object.keys(subContractStatusLabels) as SubContractStatus[]).map(k => <option key={k} value={k}>{subContractStatusLabels[k]}</option>)}
            </select>
          </div>
        </CardContent></Card>
      ))}
    </div>
  )
}

/* ─── Onglet Factures reçues ───────────────────────────────────────────── */
function FacturesTab({ sub, invoices, contracts, projects, projTitle }: {
  sub: Subcontractor; invoices: Inv[]; contracts: SubcontractorContract[]; projects: ProjectOption[]; projTitle: Map<string, string>
}) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [f, setF] = useState({ number: '', amount_ht: '', amount_ttc: '', issue_date: '', due_date: '', project_id: '', contract_id: '' })
  const [file, setFile] = useState<File | null>(null)
  const set = (k: keyof typeof f, v: string) => setF(p => ({ ...p, [k]: v }))

  const totalDu = invoices.filter(i => i.status !== 'payee').reduce((t, i) => t + (Number(i.amount_ttc) || 0), 0)
  const totalPaye = invoices.filter(i => i.status === 'payee').reduce((t, i) => t + (Number(i.amount_ttc) || 0), 0)

  async function add() {
    if (!f.amount_ttc && !f.amount_ht) { toast.error('Indiquez un montant'); return }
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    let storage_path: string | null = null
    if (file) {
      const safe = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')
      storage_path = `st/${user.id}/${sub.id}/facture-${Date.now()}-${safe}`
      const { error } = await supabase.storage.from('documents').upload(storage_path, file, { contentType: file.type || undefined, upsert: false })
      if (error) { toast.error('Erreur envoi fichier'); setSaving(false); return }
    }
    const { error } = await supabase.from('subcontractor_invoices').insert({
      user_id: user.id, subcontractor_id: sub.id,
      number: f.number || null, amount_ht: f.amount_ht ? Number(f.amount_ht) : null,
      amount_ttc: f.amount_ttc ? Number(f.amount_ttc) : (f.amount_ht ? Number(f.amount_ht) * 1.2 : null),
      issue_date: f.issue_date || null, due_date: f.due_date || null,
      project_id: f.project_id || null, contract_id: f.contract_id || null,
      storage_path, status: 'a_valider',
    })
    if (error) { toast.error('Erreur'); setSaving(false); return }
    toast.success('Facture enregistrée')
    setF({ number: '', amount_ht: '', amount_ttc: '', issue_date: '', due_date: '', project_id: '', contract_id: '' })
    setFile(null); if (fileRef.current) fileRef.current.value = ''
    setShowAdd(false); setSaving(false); router.refresh()
  }

  async function update(id: string, patch: Partial<SubcontractorInvoice>) {
    await createClient().from('subcontractor_invoices').update(patch).eq('id', id)
    router.refresh()
  }
  async function del(inv: Inv) {
    if (!confirm('Supprimer cette facture ?')) return
    const supabase = createClient()
    if (inv.storage_path) await supabase.storage.from('documents').remove([inv.storage_path])
    await supabase.from('subcontractor_invoices').delete().eq('id', inv.id)
    toast.success('Supprimée'); router.refresh()
  }

  const statusBadge: Record<SubInvoiceStatus, string> = {
    a_valider: 'bg-amber-50 text-amber-700', validee: 'bg-blue-50 text-blue-700',
    payee: 'bg-emerald-50 text-emerald-700', litige: 'bg-red-50 text-red-700',
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Card><CardContent className="p-4"><p className="text-xs text-gray-500">Restant à payer</p><p className="text-xl font-bold text-gray-900">{formatCurrency(totalDu)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-gray-500">Déjà payé</p><p className="text-xl font-bold text-emerald-600">{formatCurrency(totalPaye)}</p></CardContent></Card>
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowAdd(v => !v)} className="gap-1.5"><Plus className="w-4 h-4" /> Enregistrer une facture</Button>
      </div>

      {showAdd && (
        <Card><CardContent className="p-4 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div><Label>N° facture</Label><Input value={f.number} onChange={e => set('number', e.target.value)} /></div>
            <div><Label>Chantier</Label>
              <select className={selectClass} value={f.project_id} onChange={e => set('project_id', e.target.value)}>
                <option value="">—</option>{projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </div>
            <div><Label>Montant HT (€)</Label><Input type="number" value={f.amount_ht} onChange={e => set('amount_ht', e.target.value)} /></div>
            <div><Label>Montant TTC (€)</Label><Input type="number" value={f.amount_ttc} onChange={e => set('amount_ttc', e.target.value)} placeholder="auto si vide" /></div>
            <div><Label>Date facture</Label><Input type="date" value={f.issue_date} onChange={e => set('issue_date', e.target.value)} /></div>
            <div><Label>Échéance</Label><Input type="date" value={f.due_date} onChange={e => set('due_date', e.target.value)} /></div>
            {contracts.length > 0 && (
              <div className="sm:col-span-2"><Label>Rattacher à un contrat</Label>
                <select className={selectClass} value={f.contract_id} onChange={e => set('contract_id', e.target.value)}>
                  <option value="">—</option>{contracts.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </div>
            )}
            <div className="sm:col-span-2"><Label>Fichier de la facture</Label>
              <input ref={fileRef} type="file" onChange={e => setFile(e.target.files?.[0] || null)} className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-full file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-primary file:text-sm" />
            </div>
          </div>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setShowAdd(false)}>Annuler</Button><Button onClick={add} disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Button></div>
        </CardContent></Card>
      )}

      {invoices.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">Aucune facture reçue.</p>
      ) : invoices.map(inv => {
        const overdue = inv.status !== 'payee' && inv.due_date && (daysUntil(inv.due_date) ?? 0) < 0
        return (
          <Card key={inv.id}><CardContent className="p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-gray-900">{inv.number ? `N° ${inv.number}` : 'Facture'}</p>
                  <Badge className={`border-0 text-[11px] ${statusBadge[inv.status]}`}>{subInvoiceStatusLabels[inv.status]}</Badge>
                  {overdue && <Badge className="bg-red-50 text-red-700 border-0 text-[11px]">En retard</Badge>}
                </div>
                <p className="text-xs text-gray-400">
                  {inv.issue_date ? formatDate(inv.issue_date) : 'Sans date'}
                  {inv.due_date ? ` · échéance ${formatDate(inv.due_date)}` : ''}
                  {inv.project_id ? ` · ${projTitle.get(inv.project_id) || 'Chantier'}` : ''}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-bold text-gray-900">{formatCurrency(Number(inv.amount_ttc) || 0)}</p>
                {inv.amount_ht != null && <p className="text-[11px] text-gray-400">{formatCurrency(inv.amount_ht)} HT</p>}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap pt-1">
              <select className="h-8 rounded-full border border-gray-200 bg-white px-3 text-xs" value={inv.status}
                onChange={e => update(inv.id, { status: e.target.value as SubInvoiceStatus, paid_at: e.target.value === 'payee' ? new Date().toISOString().slice(0, 10) : null })}>
                {(Object.keys(subInvoiceStatusLabels) as SubInvoiceStatus[]).map(k => <option key={k} value={k}>{subInvoiceStatusLabels[k]}</option>)}
              </select>
              {inv.status !== 'payee' && <Button variant="success" size="sm" className="gap-1" onClick={() => update(inv.id, { status: 'payee', paid_at: new Date().toISOString().slice(0, 10) })}><CheckCircle2 className="w-3.5 h-3.5" /> Marquer payée</Button>}
              {inv.url && <a href={inv.url} target="_blank" rel="noopener noreferrer"><Button variant="ghost" size="sm" className="gap-1"><FileCheck2 className="w-3.5 h-3.5" /> Voir</Button></a>}
              <Button variant="ghost" size="icon-sm" onClick={() => del(inv)}><Trash2 className="w-4 h-4 text-gray-400" /></Button>
            </div>
          </CardContent></Card>
        )
      })}
    </div>
  )
}

/* ─── Onglet Discussion ────────────────────────────────────────────────── */
function DiscussionTab({ sub, messages }: { sub: Subcontractor; messages: SubcontractorMessage[] }) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [direction, setDirection] = useState<'sortant' | 'entrant'>('sortant')
  const [sending, setSending] = useState(false)

  async function send() {
    if (!body.trim()) return
    setSending(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSending(false); return }
    const { error } = await supabase.from('subcontractor_messages').insert({
      user_id: user.id, subcontractor_id: sub.id, body: body.trim(), direction,
    })
    if (error) { toast.error('Erreur'); setSending(false); return }
    setBody(''); setSending(false); router.refresh()
  }

  return (
    <div className="space-y-4">
      <Card><CardContent className="p-4">
        {messages.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">Aucun échange enregistré. Consignez ici vos appels, mails et notes avec ce sous-traitant.</p>
        ) : (
          <div className="space-y-2.5 max-h-[420px] overflow-y-auto">
            {messages.map(m => (
              <div key={m.id} className={`flex ${m.direction === 'sortant' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 ${m.direction === 'sortant' ? 'bg-primary text-primary-foreground' : 'bg-gray-100 text-gray-800'}`}>
                  <p className="text-sm whitespace-pre-line break-words">{m.body}</p>
                  <p className={`text-[10px] mt-1 ${m.direction === 'sortant' ? 'text-white/70' : 'text-gray-400'}`}>{formatDate(m.created_at)} {new Date(m.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent></Card>

      <Card><CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setDirection('sortant')} className={`px-3 py-1 rounded-full text-xs font-medium ${direction === 'sortant' ? 'bg-primary text-primary-foreground' : 'bg-gray-100 text-gray-600'}`}>Moi → eux</button>
          <button onClick={() => setDirection('entrant')} className={`px-3 py-1 rounded-full text-xs font-medium ${direction === 'entrant' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600'}`}>Eux → moi</button>
        </div>
        <Textarea value={body} onChange={e => setBody(e.target.value)} rows={2} placeholder="Noter un échange, un appel, une relance…" />
        <div className="flex justify-end"><Button onClick={send} disabled={sending} className="gap-1.5"><Send className="w-4 h-4" /> Ajouter</Button></div>
      </CardContent></Card>
    </div>
  )
}
