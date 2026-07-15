'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  Landmark, Plus, Trash2, Search, HardHat, ReceiptText, Wallet, Download, TrendingDown, Camera, Loader2,
} from 'lucide-react'
import type { Expense } from '@/types'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  expenseCategoryOptions, paymentMethodOptions, expenseSourceLabels, expensesToCsv,
} from '@/lib/depenses'

type Exp = Expense & { projects?: { title?: string } | null }
type ProjectOption = { id: string; title: string }

type ScanDraft = {
  storage_path: string; signedUrl?: string
  supplier: string; date: string
  amount_ttc: string; amount_ht: string; vat_amount: string; vat_rate: string
  category: string; payment_method: string; ticket_number: string
  project_id: string; notes: string
}

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))

const selectClass =
  'w-full h-10 rounded-md border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary'

const sourceColors: Record<string, string> = {
  ticket: 'bg-accent text-primary',
  banque: 'bg-[#FCE7DE] text-[#B0472F]',
  manuel: 'bg-gray-100 text-gray-600',
}

export default function DepensesLedger({
  expenses, projects,
}: { expenses: Exp[]; projects: ProjectOption[] }) {
  const router = useRouter()
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState<'tous' | 'ticket' | 'banque' | 'manuel'>('tous')

  // Formulaire manuel
  const [supplier, setSupplier] = useState('')
  const [date, setDate] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [payment, setPayment] = useState('')
  const [projectId, setProjectId] = useState('')

  // Scan de ticket (OCR) → crée une dépense source=ticket
  const scanRef = useRef<HTMLInputElement>(null)
  const [scanning, setScanning] = useState(false)
  const [draft, setDraft] = useState<ScanDraft | null>(null)
  const setDraftField = (k: keyof ScanDraft, v: string) => setDraft(d => (d ? { ...d, [k]: v } : d))

  async function handleScan(file: File) {
    setScanning(true)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch('/api/tickets/scan', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok && !json.storage_path) { toast.error(json.error || 'Lecture du ticket impossible'); return }
      const d = json.data || {}
      let signedUrl: string | undefined
      if (json.storage_path) {
        const { data } = await createClient().storage.from('documents').createSignedUrl(json.storage_path, 3600)
        signedUrl = data?.signedUrl
      }
      setDraft({
        storage_path: json.storage_path || '', signedUrl,
        supplier: str(d.supplier), date: str(d.date),
        amount_ttc: str(d.amount_ttc), amount_ht: str(d.amount_ht),
        vat_amount: str(d.vat_amount), vat_rate: str(d.vat_rate),
        category: expenseCategoryOptions.includes(d.category) ? d.category : '',
        payment_method: paymentMethodOptions.includes(d.payment_method) ? d.payment_method : '',
        ticket_number: str(d.ticket_number), project_id: '', notes: '',
      })
      if (json.error) toast.warning('Ticket enregistré, lecture partielle — vérifiez les champs')
      else toast.success('Ticket lu — vérifiez puis enregistrez')
    } catch { toast.error('Erreur réseau pendant le scan') }
    finally { setScanning(false); if (scanRef.current) scanRef.current.value = '' }
  }

  async function saveDraft() {
    if (!draft) return
    if (!draft.amount_ttc) { toast.error('Indiquez au moins le montant TTC'); return }
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    const num = (v: string) => (v === '' ? null : Number(v.replace(',', '.')))
    const { error } = await supabase.from('expenses').insert({
      user_id: user.id, source: 'ticket', status: 'a_verifier',
      project_id: draft.project_id || null, supplier: draft.supplier || null, expense_date: draft.date || null,
      amount_ttc: num(draft.amount_ttc) ?? 0, amount_ht: num(draft.amount_ht) ?? 0,
      vat_amount: num(draft.vat_amount) ?? 0, vat_rate: num(draft.vat_rate),
      category: draft.category || null, payment_method: draft.payment_method || null,
      ticket_number: draft.ticket_number || null, storage_path: draft.storage_path || null, notes: draft.notes || null,
    })
    setSaving(false)
    if (error) { toast.error('Erreur lors de l\'enregistrement'); return }
    toast.success('Ticket enregistré !')
    setDraft(null); router.refresh()
  }

  const filtered = useMemo(() => expenses.filter(e => {
    if (sourceFilter !== 'tous' && e.source !== sourceFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (!(e.supplier?.toLowerCase().includes(q) || e.category?.toLowerCase().includes(q))) return false
    }
    return true
  }), [expenses, search, sourceFilter])

  const total = filtered.reduce((s, e) => s + (Number(e.amount_ttc) || 0), 0)
  const groupBy = (key: (e: Exp) => string) => {
    const m = new Map<string, number>()
    for (const e of filtered) { const k = key(e); m.set(k, (m.get(k) || 0) + (Number(e.amount_ttc) || 0)) }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  }
  const byCategory = groupBy(e => e.category || 'Non classé')
  const byProject = groupBy(e => e.projects?.title || 'Sans chantier')
  const bySupplier = groupBy(e => e.supplier || 'Inconnu')

  const now = new Date()
  const thisMonth = filtered.filter(e => {
    if (!e.expense_date) return false
    const d = new Date(e.expense_date); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  }).reduce((s, e) => s + (Number(e.amount_ttc) || 0), 0)
  const aValider = expenses.filter(e => e.status === 'a_verifier').length
  const sansJustif = filtered.filter(e => !e.storage_path).length

  async function handleAdd() {
    if (!amount) { toast.error('Indiquez un montant'); return }
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    const ttc = Number(amount.replace(',', '.'))
    const { error } = await supabase.from('expenses').insert({
      user_id: user.id,
      project_id: projectId || null,
      supplier: supplier || null,
      expense_date: date || null,
      amount_ttc: ttc,
      amount_ht: 0,
      vat_amount: 0,
      category: category || null,
      payment_method: payment || null,
      status: 'valide',
      source: 'manuel',
    })
    setSaving(false)
    if (error) { toast.error('Erreur lors de l\'ajout'); return }
    toast.success('Dépense ajoutée !')
    setSupplier(''); setDate(''); setAmount(''); setCategory(''); setPayment(''); setProjectId('')
    setShowAdd(false)
    router.refresh()
  }

  async function handleDelete(exp: Exp) {
    if (!confirm('Supprimer cette dépense ?')) return
    const supabase = createClient()
    if (exp.storage_path) await supabase.storage.from('documents').remove([exp.storage_path])
    const { error } = await supabase.from('expenses').delete().eq('id', exp.id)
    if (error) { toast.error('Erreur'); return }
    toast.success('Dépense supprimée')
    router.refresh()
  }

  function handleExport() {
    if (!filtered.length) { toast.error('Aucune dépense à exporter'); return }
    const csv = expensesToCsv(filtered as unknown as Parameters<typeof expensesToCsv>[0])
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `depenses-${new Date().toISOString().slice(0, 10)}.csv`; a.click()
    URL.revokeObjectURL(url)
    toast.success(`${filtered.length} dépense(s) exportée(s)`)
  }

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-[26px] font-bold font-heading text-marine">Dépenses</h1>
          <p className="text-gray-500 mt-1 text-sm">Toutes vos sorties d&apos;argent au même endroit : tickets, banque et saisies.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="info" className="h-10 gap-2" onClick={handleExport}>
            <Download className="w-4 h-4" /> Exporter
          </Button>
          <input ref={scanRef} type="file" accept="image/*,.pdf,.png,.jpg,.jpeg,.webp" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleScan(f) }} />
          <Button variant="outline" className="h-10 gap-2" disabled={scanning} onClick={() => scanRef.current?.click()}>
            {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
            {scanning ? 'Lecture…' : 'Scanner un ticket'}
          </Button>
          <Button className="h-10 gap-2 shadow-sm" onClick={() => setShowAdd(v => !v)}>
            <Plus className="w-4 h-4" /> Ajouter une dépense
          </Button>
        </div>
      </div>

      {/* Validation du ticket scanné */}
      {draft && (
        <Card className="border-2 border-primary/30">
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-primary">
              <Camera className="w-4 h-4" /> Vérifiez les informations lues, puis enregistrez
            </div>
            <div className="grid md:grid-cols-[1fr_220px] gap-4">
              <div className="space-y-3">
                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="Fournisseur"><Input value={draft.supplier} onChange={e => setDraftField('supplier', e.target.value)} placeholder="Ex: Leroy Merlin" /></Field>
                  <Field label="Date"><Input type="date" value={draft.date} onChange={e => setDraftField('date', e.target.value)} /></Field>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Field label="TTC (€)"><Input type="number" step="0.01" value={draft.amount_ttc} onChange={e => setDraftField('amount_ttc', e.target.value)} /></Field>
                  <Field label="HT (€)"><Input type="number" step="0.01" value={draft.amount_ht} onChange={e => setDraftField('amount_ht', e.target.value)} /></Field>
                  <Field label="TVA (€)"><Input type="number" step="0.01" value={draft.vat_amount} onChange={e => setDraftField('vat_amount', e.target.value)} /></Field>
                  <Field label="Taux %"><Input type="number" step="0.5" value={draft.vat_rate} onChange={e => setDraftField('vat_rate', e.target.value)} /></Field>
                </div>
                <div className="grid sm:grid-cols-3 gap-3">
                  <Field label="Catégorie">
                    <select value={draft.category} onChange={e => setDraftField('category', e.target.value)} className={selectClass}>
                      <option value="">— À classer —</option>
                      {expenseCategoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </Field>
                  <Field label="Paiement">
                    <select value={draft.payment_method} onChange={e => setDraftField('payment_method', e.target.value)} className={selectClass}>
                      <option value="">—</option>
                      {paymentMethodOptions.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </Field>
                  <Field label="Chantier">
                    <select value={draft.project_id} onChange={e => setDraftField('project_id', e.target.value)} className={selectClass}>
                      <option value="">— Aucun —</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label="Note (optionnel)"><Input value={draft.notes} onChange={e => setDraftField('notes', e.target.value)} placeholder="Précision éventuelle" /></Field>
              </div>
              {draft.signedUrl && (
                <a href={draft.signedUrl} target="_blank" rel="noopener noreferrer"
                  className="block rounded-lg border border-gray-200 overflow-hidden bg-gray-50 hover:border-primary transition-colors">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={draft.signedUrl} alt="Ticket" className="w-full h-[220px] object-contain" />
                </a>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="destructive-outline" onClick={() => setDraft(null)} disabled={saving}>Annuler</Button>
              <Button onClick={saveDraft} disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer le ticket'}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Connexion bancaire (à venir) */}
      <Card className="border border-[#F3D9CF] bg-[#FBEDE7]/50">
        <CardContent className="p-4 flex items-center gap-3">
          <span className="grid place-items-center w-11 h-11 rounded-xl bg-[#FCE7DE] text-[#C14E33] flex-shrink-0">
            <Landmark className="w-5 h-5" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-marine">Connexion bancaire</div>
            <p className="text-sm text-gray-600">Bientôt : reliez votre banque pour détecter automatiquement vos dépenses et les rapprocher de vos tickets.</p>
          </div>
          <Button variant="outline" size="sm" disabled className="flex-shrink-0">Connecter ma banque</Button>
        </CardContent>
      </Card>

      {/* Synthèse */}
      {expenses.length > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label={`Total${sourceFilter !== 'tous' ? ` (${expenseSourceLabels[sourceFilter]})` : ''}`} value={formatCurrency(total)} tile="bg-rose-100 text-rose-600" icon={<TrendingDown className="w-4 h-4" />} />
            <Stat label="Ce mois" value={formatCurrency(thisMonth)} tile="bg-accent text-primary" icon={<Wallet className="w-4 h-4" />} />
            <button type="button" onClick={() => setSourceFilter('ticket')} className="text-left"><Stat label="Tickets à valider" value={String(aValider)} tile="bg-amber-100 text-amber-600" icon={<ReceiptText className="w-4 h-4" />} interactive /></button>
            <Stat label="Sans justificatif" value={String(sansJustif)} tile="bg-gray-100 text-gray-500" icon={<Search className="w-4 h-4" />} />
          </div>
          <div className="grid md:grid-cols-3 gap-3">
            <Breakdown title="Par catégorie" rows={byCategory} total={total} />
            <Breakdown title="Par chantier" rows={byProject} total={total} />
            <Breakdown title="Par fournisseur" rows={bySupplier} total={total} />
          </div>
        </>
      )}

      {/* Ajout manuel */}
      {showAdd && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
              <div className="space-y-1"><Label className="text-xs text-gray-500">Fournisseur</Label><Input value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="Ex: EDF" /></div>
              <div className="space-y-1"><Label className="text-xs text-gray-500">Montant TTC (€) *</Label><Input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs text-gray-500">Date</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs text-gray-500">Catégorie</Label>
                <select value={category} onChange={e => setCategory(e.target.value)} className={selectClass}>
                  <option value="">— À classer —</option>
                  {expenseCategoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-1"><Label className="text-xs text-gray-500">Paiement</Label>
                <select value={payment} onChange={e => setPayment(e.target.value)} className={selectClass}>
                  <option value="">—</option>
                  {paymentMethodOptions.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-1"><Label className="text-xs text-gray-500">Chantier</Label>
                <select value={projectId} onChange={e => setProjectId(e.target.value)} className={selectClass}>
                  <option value="">— Aucun —</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="destructive-outline" onClick={() => setShowAdd(false)} disabled={saving}>Annuler</Button>
              <Button onClick={handleAdd} disabled={saving}>{saving ? 'Ajout...' : 'Ajouter'}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filtres */}
      {expenses.length > 0 && (
        <div className="space-y-2">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher (fournisseur, catégorie)..." className="pl-9" />
          </div>
          <div className="flex flex-wrap gap-2">
            {(['tous', 'ticket', 'manuel', 'banque'] as const).map(s => {
              const n = s === 'tous' ? expenses.length : expenses.filter(e => e.source === s).length
              if (s !== 'tous' && !n) return null
              return (
                <button key={s} type="button" onClick={() => setSourceFilter(s)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    sourceFilter === s ? 'border-primary bg-accent text-primary' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}>
                  {s === 'tous' ? 'Toutes' : expenseSourceLabels[s]} ({n})
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Liste */}
      {expenses.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            <Wallet className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="font-medium">Aucune dépense pour l&apos;instant</p>
            <p className="text-sm mt-1">Scannez un ticket, ajoutez une dépense, ou connectez votre banque.</p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-400 py-6 text-center">Aucune dépense ne correspond.</p>
      ) : (
        <div className="grid gap-2">
          {filtered.map(exp => (
            <Card key={exp.id} className="card-interactive border border-gray-200/80">
              <CardContent className="p-3 flex items-center gap-3">
                <span className="grid place-items-center w-10 h-10 rounded-lg bg-gray-50 text-gray-400 flex-shrink-0">
                  {exp.source === 'ticket' ? <ReceiptText className="w-5 h-5" /> : exp.source === 'banque' ? <Landmark className="w-5 h-5" /> : <Wallet className="w-5 h-5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-gray-900 truncate">{exp.supplier || 'Dépense'}</div>
                  <div className="flex items-center flex-wrap gap-2 mt-1 text-xs text-gray-500">
                    <Badge className={`${sourceColors[exp.source]} border-0 text-[11px]`}>{expenseSourceLabels[exp.source]}</Badge>
                    {exp.category && <Badge variant="outline" className="text-xs">{exp.category}</Badge>}
                    {exp.expense_date && <span>{formatDate(exp.expense_date)}</span>}
                    {exp.projects && (
                      <Link href={`/chantiers/${exp.project_id}`} className="flex items-center gap-1 hover:text-[#C14E33]">
                        <HardHat className="w-3 h-3" />{exp.projects.title}
                      </Link>
                    )}
                  </div>
                </div>
                <div className="font-semibold text-gray-900 tabular-nums flex-shrink-0">{formatCurrency(Number(exp.amount_ttc) || 0)}</div>
                <button onClick={() => handleDelete(exp)} title="Supprimer"
                  className="grid place-items-center w-8 h-8 rounded-md text-gray-400 hover:text-red-500 hover:bg-gray-50 flex-shrink-0"><Trash2 className="w-4 h-4" /></button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs text-gray-500">{label}</Label>{children}</div>
}

function Stat({ label, value, tile, icon, interactive }: { label: string; value: string; tile: string; icon: React.ReactNode; interactive?: boolean }) {
  return (
    <Card className={`border border-gray-200/80 ${interactive ? 'card-interactive h-full' : ''}`}>
      <CardContent className="p-3">
        <span className={`grid place-items-center w-8 h-8 rounded-lg ${tile}`}>{icon}</span>
        <div className="text-xl font-bold text-[#0F172A] mt-2 leading-none">{value}</div>
        <div className="text-[11px] text-gray-500 mt-1">{label}</div>
      </CardContent>
    </Card>
  )
}

function Breakdown({ title, rows, total }: { title: string; rows: [string, number][]; total: number }) {
  return (
    <Card className="border border-gray-200/80">
      <CardContent className="p-4">
        <div className="text-xs font-medium text-gray-400 mb-2">{title}</div>
        {rows.length === 0 ? <p className="text-sm text-gray-400">—</p> : (
          <div className="space-y-1.5">
            {rows.map(([k, amount]) => {
              const pct = total > 0 ? Math.round((amount / total) * 100) : 0
              return (
                <div key={k} className="flex items-center gap-2 text-sm">
                  <span className="w-24 truncate text-gray-600">{k}</span>
                  <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden"><div className="h-full bg-primary/70" style={{ width: `${pct}%` }} /></div>
                  <span className="w-20 text-right font-medium tabular-nums">{formatCurrency(amount)}</span>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
