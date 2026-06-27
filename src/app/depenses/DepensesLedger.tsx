'use client'

import { useMemo, useState } from 'react'
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
  Landmark, Plus, Trash2, Search, HardHat, ReceiptText, Wallet, Download, TrendingDown,
} from 'lucide-react'
import type { Expense } from '@/types'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  expenseCategoryOptions, paymentMethodOptions, expenseSourceLabels, expensesToCsv,
} from '@/lib/depenses'

type Exp = Expense & { projects?: { title?: string } | null }
type ProjectOption = { id: string; title: string }

const selectClass =
  'w-full h-10 rounded-md border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6A00]'

const sourceColors: Record<string, string> = {
  ticket: 'bg-orange-100 text-orange-700',
  banque: 'bg-blue-100 text-blue-700',
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

  const filtered = useMemo(() => expenses.filter(e => {
    if (sourceFilter !== 'tous' && e.source !== sourceFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (!(e.supplier?.toLowerCase().includes(q) || e.category?.toLowerCase().includes(q))) return false
    }
    return true
  }), [expenses, search, sourceFilter])

  const total = filtered.reduce((s, e) => s + (Number(e.amount_ttc) || 0), 0)
  const byCategory = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of filtered) {
      const k = e.category || 'Non classé'
      m.set(k, (m.get(k) || 0) + (Number(e.amount_ttc) || 0))
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  }, [filtered])

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
        <div className="flex items-center gap-2">
          <Button variant="outline" className="h-10 gap-2" onClick={handleExport}>
            <Download className="w-4 h-4" /> Exporter
          </Button>
          <Button className="h-10 gap-2 shadow-sm" onClick={() => setShowAdd(v => !v)}>
            <Plus className="w-4 h-4" /> Ajouter une dépense
          </Button>
        </div>
      </div>

      {/* Connexion bancaire (à venir) */}
      <Card className="border border-blue-100 bg-blue-50/50">
        <CardContent className="p-4 flex items-center gap-3">
          <span className="grid place-items-center w-11 h-11 rounded-xl bg-blue-100 text-blue-600 flex-shrink-0">
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
        <div className="grid md:grid-cols-3 gap-3">
          <Card className="border border-gray-200/80">
            <CardContent className="p-4">
              <span className="grid place-items-center w-9 h-9 rounded-lg bg-rose-100 text-rose-600"><TrendingDown className="w-4 h-4" /></span>
              <div className="text-2xl font-bold text-[#0F172A] mt-2 leading-none">{formatCurrency(total)}</div>
              <div className="text-xs text-gray-500 mt-1">Total dépenses {sourceFilter !== 'tous' ? `(${expenseSourceLabels[sourceFilter]})` : ''}</div>
            </CardContent>
          </Card>
          <Card className="border border-gray-200/80 md:col-span-2">
            <CardContent className="p-4">
              <div className="text-xs font-medium text-gray-400 mb-2">Répartition par catégorie</div>
              {byCategory.length === 0 ? (
                <p className="text-sm text-gray-400">—</p>
              ) : (
                <div className="space-y-1.5">
                  {byCategory.map(([cat, amount]) => {
                    const pct = total > 0 ? Math.round((amount / total) * 100) : 0
                    return (
                      <div key={cat} className="flex items-center gap-2 text-sm">
                        <span className="w-32 truncate text-gray-600">{cat}</span>
                        <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                          <div className="h-full bg-[#FF6A00]/70" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-20 text-right font-medium tabular-nums">{formatCurrency(amount)}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
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
              <Button variant="outline" onClick={() => setShowAdd(false)} disabled={saving}>Annuler</Button>
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
                    sourceFilter === s ? 'border-[#FF6A00] bg-[#FFF1E6] text-[#FF6A00]' : 'border-gray-200 text-gray-600 hover:border-gray-300'
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
                      <Link href={`/chantiers/${exp.project_id}`} className="flex items-center gap-1 hover:text-blue-600">
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
