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
  ReceiptText, Camera, Upload, Trash2, Search, HardHat, FileText, Check, Send, Loader2, Download,
} from 'lucide-react'
import type { Expense, ExpenseStatus } from '@/types'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  expenseStatusLabels, expenseStatusColors, expenseCategoryOptions, paymentMethodOptions, expensesToCsv,
} from '@/lib/depenses'

type Exp = Expense & { signedUrl?: string }
type ProjectOption = { id: string; title: string }

type Draft = {
  storage_path: string; signedUrl?: string
  supplier: string; date: string
  amount_ttc: string; amount_ht: string; vat_amount: string; vat_rate: string
  category: string; payment_method: string; ticket_number: string
  project_id: string; notes: string
}

const selectClass =
  'w-full h-10 rounded-md border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6A00]'

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))

export default function TicketsManager({
  expenses, projects, preselectProject,
}: { expenses: Exp[]; projects: ProjectOption[]; preselectProject?: string }) {
  const router = useRouter()
  const cameraRef = useRef<HTMLInputElement>(null)
  const importRef = useRef<HTMLInputElement>(null)

  const [scanning, setScanning] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<ExpenseStatus | 'tous'>('tous')

  const filtered = useMemo(() => expenses.filter(e => {
    if (statusFilter !== 'tous' && e.status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (!(e.supplier?.toLowerCase().includes(q) || e.category?.toLowerCase().includes(q))) return false
    }
    return true
  }), [expenses, search, statusFilter])

  const totalTTC = filtered.reduce((s, e) => s + (Number(e.amount_ttc) || 0), 0)
  const aVerifier = expenses.filter(e => e.status === 'a_verifier').length

  async function handleScan(file: File) {
    setScanning(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/tickets/scan', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok && !json.storage_path) {
        toast.error(json.error || 'Lecture du ticket impossible')
        setScanning(false); return
      }
      const d = json.data || {}
      let signedUrl: string | undefined
      if (json.storage_path) {
        const supabase = createClient()
        const { data } = await supabase.storage.from('documents').createSignedUrl(json.storage_path, 3600)
        signedUrl = data?.signedUrl
      }
      setDraft({
        storage_path: json.storage_path, signedUrl,
        supplier: str(d.supplier), date: str(d.date),
        amount_ttc: str(d.amount_ttc), amount_ht: str(d.amount_ht),
        vat_amount: str(d.vat_amount), vat_rate: str(d.vat_rate),
        category: expenseCategoryOptions.includes(d.category) ? d.category : '',
        payment_method: paymentMethodOptions.includes(d.payment_method) ? d.payment_method : '',
        ticket_number: str(d.ticket_number),
        project_id: preselectProject || '', notes: '',
      })
      if (json.error) toast.warning('Ticket enregistré, lecture partielle — vérifiez les champs')
      else toast.success('Ticket lu — vérifiez puis enregistrez')
    } catch {
      toast.error('Erreur réseau pendant le scan')
    }
    setScanning(false)
    if (cameraRef.current) cameraRef.current.value = ''
    if (importRef.current) importRef.current.value = ''
  }

  function setField(k: keyof Draft, v: string) { setDraft(d => (d ? { ...d, [k]: v } : d)) }

  async function handleSave() {
    if (!draft) return
    if (!draft.amount_ttc) { toast.error('Indiquez au moins le montant TTC'); return }
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    const num = (v: string) => (v === '' ? null : Number(v.replace(',', '.')))
    const { error } = await supabase.from('expenses').insert({
      user_id: user.id,
      project_id: draft.project_id || null,
      supplier: draft.supplier || null,
      expense_date: draft.date || null,
      amount_ttc: num(draft.amount_ttc) ?? 0,
      amount_ht: num(draft.amount_ht) ?? 0,
      vat_amount: num(draft.vat_amount) ?? 0,
      vat_rate: num(draft.vat_rate),
      category: draft.category || null,
      payment_method: draft.payment_method || null,
      ticket_number: draft.ticket_number || null,
      storage_path: draft.storage_path || null,
      notes: draft.notes || null,
      status: 'a_verifier',
      source: 'ticket',
    })
    setSaving(false)
    if (error) { toast.error('Erreur lors de l\'enregistrement'); return }
    toast.success('Ticket enregistré !')
    setDraft(null)
    router.refresh()
  }

  async function changeStatus(exp: Exp, status: ExpenseStatus) {
    const supabase = createClient()
    const { error } = await supabase.from('expenses').update({ status }).eq('id', exp.id)
    if (error) { toast.error('Erreur'); return }
    toast.success(status === 'valide' ? 'Ticket validé' : status === 'envoye_comptable' ? 'Marqué envoyé à la comptable' : 'Mis à jour')
    router.refresh()
  }

  async function handleDelete(exp: Exp) {
    if (!confirm('Supprimer ce ticket ?')) return
    const supabase = createClient()
    if (exp.storage_path) await supabase.storage.from('documents').remove([exp.storage_path])
    const { error } = await supabase.from('expenses').delete().eq('id', exp.id)
    if (error) { toast.error('Erreur lors de la suppression'); return }
    toast.success('Ticket supprimé')
    router.refresh()
  }

  function handleExport() {
    if (!filtered.length) { toast.error('Aucun ticket à exporter'); return }
    const csv = expensesToCsv(filtered as unknown as Parameters<typeof expensesToCsv>[0])
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tickets-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`${filtered.length} ticket(s) exporté(s)`)
  }

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-[26px] font-bold font-heading text-marine">Scan tickets</h1>
          <p className="text-gray-500 mt-1 text-sm">Photographiez vos tickets : on lit le montant et la TVA, et on garde le justificatif.</p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleScan(f) }} />
          <input ref={importRef} type="file" accept="image/*,.pdf,.png,.jpg,.jpeg,.webp" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleScan(f) }} />
          <Button variant="outline" className="h-10 gap-2" disabled={scanning} onClick={() => importRef.current?.click()}>
            <Upload className="w-4 h-4" /> Importer
          </Button>
          <Button className="h-10 gap-2 shadow-sm" disabled={scanning} onClick={() => cameraRef.current?.click()}>
            {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
            {scanning ? 'Lecture...' : 'Prendre en photo'}
          </Button>
        </div>
      </div>

      {/* Totaux + export */}
      {expenses.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MiniStat label="Total tickets" value={formatCurrency(totalTTC)} tile="bg-orange-100 text-orange-600" icon={<ReceiptText className="w-4 h-4" />} />
          <MiniStat label="À vérifier" value={String(aVerifier)} tile="bg-amber-100 text-amber-600" icon={<Search className="w-4 h-4" />} />
          <MiniStat label="Tickets" value={String(expenses.length)} tile="bg-violet-100 text-violet-600" icon={<FileText className="w-4 h-4" />} />
          <button onClick={handleExport} className="text-left">
            <Card className="card-interactive border border-gray-200/80 h-full">
              <CardContent className="p-3">
                <span className="grid place-items-center w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600"><Download className="w-4 h-4" /></span>
                <div className="text-sm font-bold text-[#0F172A] mt-2 leading-tight">Exporter</div>
                <div className="text-[11px] text-gray-500 mt-1">CSV pour la comptable</div>
              </CardContent>
            </Card>
          </button>
        </div>
      )}

      {/* Formulaire de validation */}
      {draft && (
        <Card className="border-2 border-[#FF6A00]/30">
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-[#FF6A00]">
              <Camera className="w-4 h-4" /> Vérifiez les informations lues, puis enregistrez
            </div>
            <div className="grid md:grid-cols-[1fr_220px] gap-4">
              <div className="space-y-3">
                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="Fournisseur"><Input value={draft.supplier} onChange={e => setField('supplier', e.target.value)} placeholder="Ex: Leroy Merlin" /></Field>
                  <Field label="Date"><Input type="date" value={draft.date} onChange={e => setField('date', e.target.value)} /></Field>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Field label="TTC (€)"><Input type="number" step="0.01" value={draft.amount_ttc} onChange={e => setField('amount_ttc', e.target.value)} /></Field>
                  <Field label="HT (€)"><Input type="number" step="0.01" value={draft.amount_ht} onChange={e => setField('amount_ht', e.target.value)} /></Field>
                  <Field label="TVA (€)"><Input type="number" step="0.01" value={draft.vat_amount} onChange={e => setField('vat_amount', e.target.value)} /></Field>
                  <Field label="Taux %"><Input type="number" step="0.5" value={draft.vat_rate} onChange={e => setField('vat_rate', e.target.value)} /></Field>
                </div>
                <div className="grid sm:grid-cols-3 gap-3">
                  <Field label="Catégorie">
                    <select value={draft.category} onChange={e => setField('category', e.target.value)} className={selectClass}>
                      <option value="">— À classer —</option>
                      {expenseCategoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </Field>
                  <Field label="Paiement">
                    <select value={draft.payment_method} onChange={e => setField('payment_method', e.target.value)} className={selectClass}>
                      <option value="">—</option>
                      {paymentMethodOptions.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </Field>
                  <Field label="Chantier">
                    <select value={draft.project_id} onChange={e => setField('project_id', e.target.value)} className={selectClass}>
                      <option value="">— Aucun —</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label="Note (optionnel)"><Input value={draft.notes} onChange={e => setField('notes', e.target.value)} placeholder="Précision éventuelle" /></Field>
              </div>
              {draft.signedUrl && (
                <a href={draft.signedUrl} target="_blank" rel="noopener noreferrer"
                  className="block rounded-lg border border-gray-200 overflow-hidden bg-gray-50 hover:border-[#FF6A00] transition-colors">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={draft.signedUrl} alt="Ticket" className="w-full h-[220px] object-contain" />
                </a>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDraft(null)} disabled={saving}>Annuler</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? 'Enregistrement...' : 'Enregistrer le ticket'}</Button>
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
            <Chip active={statusFilter === 'tous'} onClick={() => setStatusFilter('tous')}>Tous ({expenses.length})</Chip>
            {(Object.keys(expenseStatusLabels) as ExpenseStatus[]).filter(s => s !== 'archive').map(s => {
              const n = expenses.filter(e => e.status === s).length
              if (!n) return null
              return <Chip key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>{expenseStatusLabels[s]} ({n})</Chip>
            })}
          </div>
        </div>
      )}

      {/* Liste */}
      {expenses.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            <ReceiptText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="font-medium">Aucun ticket pour l&apos;instant</p>
            <p className="text-sm mt-1">Prenez votre premier ticket en photo — fini les justificatifs perdus.</p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-400 py-6 text-center">Aucun ticket ne correspond.</p>
      ) : (
        <div className="grid gap-2">
          {filtered.map(exp => {
            const pr = exp.projects
            return (
              <Card key={exp.id} className="card-interactive border border-gray-200/80">
                <CardContent className="p-3 flex items-center gap-3">
                  {exp.signedUrl ? (
                    <a href={exp.signedUrl} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={exp.signedUrl} alt="" className="w-10 h-10 rounded-lg object-cover bg-gray-100" />
                    </a>
                  ) : (
                    <span className="grid place-items-center w-10 h-10 rounded-lg bg-gray-50 text-gray-400 flex-shrink-0">
                      <ReceiptText className="w-5 h-5" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-gray-900 truncate">{exp.supplier || 'Fournisseur inconnu'}</div>
                    <div className="flex items-center flex-wrap gap-2 mt-1 text-xs text-gray-500">
                      {exp.category && <Badge variant="outline" className="text-xs">{exp.category}</Badge>}
                      {exp.expense_date && <span>{formatDate(exp.expense_date)}</span>}
                      {pr && (
                        <Link href={`/chantiers/${exp.project_id}`} className="flex items-center gap-1 hover:text-blue-600">
                          <HardHat className="w-3 h-3" />{pr.title}
                        </Link>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-semibold text-gray-900 tabular-nums">{formatCurrency(Number(exp.amount_ttc) || 0)}</div>
                    <Badge className={`${expenseStatusColors[exp.status]} border-0 text-[11px] mt-0.5`}>{expenseStatusLabels[exp.status]}</Badge>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {exp.status === 'a_verifier' && (
                      <button onClick={() => changeStatus(exp, 'valide')} title="Valider"
                        className="grid place-items-center w-8 h-8 rounded-md text-gray-400 hover:text-green-600 hover:bg-gray-50"><Check className="w-4 h-4" /></button>
                    )}
                    {exp.status === 'valide' && (
                      <button onClick={() => changeStatus(exp, 'envoye_comptable')} title="Marquer envoyé à la comptable"
                        className="grid place-items-center w-8 h-8 rounded-md text-gray-400 hover:text-violet-600 hover:bg-gray-50"><Send className="w-4 h-4" /></button>
                    )}
                    <button onClick={() => handleDelete(exp)} title="Supprimer"
                      className="grid place-items-center w-8 h-8 rounded-md text-gray-400 hover:text-red-500 hover:bg-gray-50"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs text-gray-500">{label}</Label>{children}</div>
}

function MiniStat({ label, value, tile, icon }: { label: string; value: string; tile: string; icon: React.ReactNode }) {
  return (
    <Card className="border border-gray-200/80">
      <CardContent className="p-3">
        <span className={`grid place-items-center w-8 h-8 rounded-lg ${tile}`}>{icon}</span>
        <div className="text-xl font-bold text-[#0F172A] mt-2 leading-none">{value}</div>
        <div className="text-[11px] text-gray-500 mt-1">{label}</div>
      </CardContent>
    </Card>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
        active ? 'border-[#FF6A00] bg-[#FFF1E6] text-[#FF6A00]' : 'border-gray-200 text-gray-600 hover:border-gray-300'
      }`}>
      {children}
    </button>
  )
}
