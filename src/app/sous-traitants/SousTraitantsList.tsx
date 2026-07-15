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
  Handshake, Plus, Search, Phone, Mail, ShieldAlert, ShieldCheck,
  Wallet, Star, ChevronRight, TrendingUp, Coins,
} from 'lucide-react'
import type { Subcontractor, SubcontractorDocument, SubcontractorStatus } from '@/types'
import { formatCurrency } from '@/lib/utils'
import {
  tradeOptions, subStatusLabels, subInitials, complianceCheck,
} from '@/lib/soustraitants'

export type SubMeta = {
  docs: SubcontractorDocument[]
  openContracts: number
  toValidate: number
  ca: number; engage: number; facture: number; paye: number
  unpaid: number; cout: number; marge: number; margePct: number | null
  retenue: number; litiges: number; retards: number
}

const selectClass =
  'w-full h-10 rounded-md border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary'

function crewLabel(n?: number | null): string {
  if (!n || n <= 0) return ''
  return n === 1 ? 'Solo' : `${n} intervenants`
}

const statusColors: Record<SubcontractorStatus, string> = {
  actif: 'bg-emerald-50 text-emerald-700',
  inactif: 'bg-gray-100 text-gray-500',
  liste_noire: 'bg-red-50 text-red-700',
}

export default function SousTraitantsList({ subs, meta }: { subs: Subcontractor[]; meta: Record<string, SubMeta> }) {
  const router = useRouter()
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'tous' | SubcontractorStatus>('tous')

  const [companyName, setCompanyName] = useState('')
  const [trade, setTrade] = useState('')
  const [contactName, setContactName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [siret, setSiret] = useState('')

  const filtered = useMemo(() => subs.filter(s => {
    if (statusFilter !== 'tous' && s.status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (!(s.company_name?.toLowerCase().includes(q) || s.trade?.toLowerCase().includes(q) || s.contact_name?.toLowerCase().includes(q))) return false
    }
    return true
  }), [subs, search, statusFilter])

  // KPIs — rentabilité en tête
  const nonConformes = subs.filter(s => !complianceCheck(meta[s.id]?.docs || [], s.insurance_expiry).ok).length
  const totalDu = subs.reduce((t, s) => t + (meta[s.id]?.unpaid || 0), 0)
  const totalCa = subs.reduce((t, s) => t + (meta[s.id]?.ca || 0), 0)
  const totalCout = subs.reduce((t, s) => t + (meta[s.id]?.cout || 0), 0)
  const totalMarge = totalCa - totalCout
  const margePct = totalCa > 0 ? Math.round((totalMarge / totalCa) * 100) : null
  const totalRetenue = subs.reduce((t, s) => t + (meta[s.id]?.retenue || 0), 0)

  async function handleAdd() {
    if (!companyName.trim()) { toast.error('Indiquez le nom de l\'entreprise'); return }
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    const { error } = await supabase.from('subcontractors').insert({
      user_id: user.id,
      company_name: companyName.trim(),
      trade: trade || null,
      contact_name: contactName || null,
      phone: phone || null,
      email: email || null,
      siret: siret || null,
      status: 'actif',
    })
    if (error) { toast.error('Erreur lors de l\'enregistrement'); setSaving(false); return }
    toast.success('Sous-traitant ajouté !')
    setCompanyName(''); setTrade(''); setContactName(''); setPhone(''); setEmail(''); setSiret('')
    setShowAdd(false); setSaving(false)
    router.refresh()
  }

  return (
    <div className="space-y-5">
      {/* En-tête */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="grid place-items-center w-11 h-11 rounded-2xl bg-accent text-primary flex-shrink-0"><Handshake className="w-5 h-5" /></span>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 leading-tight">Sous-traitants</h1>
            <p className="text-sm text-gray-500">Répertoire, conformité, contrats, factures et échanges.</p>
          </div>
        </div>
        <Button onClick={() => setShowAdd(v => !v)} className="gap-1.5"><Plus className="w-4 h-4" /> Ajouter</Button>
      </div>

      {/* KPIs — combien ils rapportent vs combien on les paye */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={<TrendingUp className="w-4 h-4" />} label="CA sous-traité" value={formatCurrency(totalCa)} tone="neutral" />
        <KpiCard icon={<Coins className="w-4 h-4" />} label="Coût sous-traitance" value={formatCurrency(totalCout)} tone="neutral" />
        <KpiCard icon={<Wallet className="w-4 h-4" />} label={margePct !== null ? `Marge (${margePct} %)` : 'Marge'} value={formatCurrency(totalMarge)} tone={totalMarge >= 0 ? 'ok' : 'danger'} />
        <KpiCard icon={<Wallet className="w-4 h-4" />} label="Restant à payer" value={formatCurrency(totalDu)} tone={totalDu > 0 ? 'warn' : 'neutral'} />
      </div>

      {/* Alertes conformité / retenues (secondaires) */}
      {(nonConformes > 0 || totalRetenue > 0) && (
        <div className="flex flex-wrap gap-2 text-xs">
          {nonConformes > 0 && <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-50 text-red-700"><ShieldAlert className="w-3.5 h-3.5" /> {nonConformes} non conforme{nonConformes > 1 ? 's' : ''}</span>}
          {totalRetenue > 0 && <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 text-amber-700"><Coins className="w-3.5 h-3.5" /> {formatCurrency(totalRetenue)} de retenues de garantie</span>}
        </div>
      )}

      {/* Formulaire ajout */}
      {showAdd && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <Label>Entreprise *</Label>
                <Input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Ex : SARL Dupont Plomberie" />
              </div>
              <div>
                <Label>Spécialité</Label>
                <select className={selectClass} value={trade} onChange={e => setTrade(e.target.value)}>
                  <option value="">—</option>
                  {tradeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <Label>Contact</Label>
                <Input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Nom du responsable" />
              </div>
              <div>
                <Label>Téléphone</Label>
                <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="06 12 34 56 78" />
              </div>
              <div>
                <Label>Email</Label>
                <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="contact@entreprise.fr" />
              </div>
              <div className="sm:col-span-2">
                <Label>SIRET</Label>
                <Input value={siret} onChange={e => setSiret(e.target.value)} placeholder="123 456 789 00012" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowAdd(false)}>Annuler</Button>
              <Button onClick={handleAdd} disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recherche + filtre */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un sous-traitant, un métier…" className="pl-9" />
        </div>
        <select className={`${selectClass} w-auto`} value={statusFilter} onChange={e => setStatusFilter(e.target.value as 'tous' | SubcontractorStatus)}>
          <option value="tous">Tous les statuts</option>
          <option value="actif">Actifs</option>
          <option value="inactif">Inactifs</option>
          <option value="liste_noire">Liste noire</option>
        </select>
      </div>

      {/* Liste */}
      {filtered.length === 0 ? (
        <Card><CardContent className="p-10 text-center text-gray-400">
          <Handshake className="w-8 h-8 mx-auto mb-2 opacity-40" />
          {subs.length === 0 ? 'Aucun sous-traitant pour l\'instant. Ajoutez-en un pour commencer.' : 'Aucun résultat.'}
        </CardContent></Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(s => {
            const m = meta[s.id] || { docs: [], openContracts: 0, unpaid: 0, toValidate: 0 }
            const conf = complianceCheck(m.docs, s.insurance_expiry)
            return (
              <Link key={s.id} href={`/sous-traitants/${s.id}`}>
                <Card className="h-full hover:shadow-[var(--shadow-md)] transition-shadow">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <span className="grid place-items-center w-10 h-10 rounded-full bg-accent text-primary font-bold text-sm flex-shrink-0">{subInitials(s.company_name)}</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-gray-900 truncate leading-tight">{s.company_name}</p>
                        {(s.trade || s.crew_size) && <p className="text-xs text-gray-500 truncate">{[s.trade, crewLabel(s.crew_size)].filter(Boolean).join(' · ')}</p>}
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge className={`${statusColors[s.status]} border-0 text-[11px]`}>{subStatusLabels[s.status]}</Badge>
                      {conf.ok ? (
                        <Badge className="bg-emerald-50 text-emerald-700 border-0 text-[11px] gap-1"><ShieldCheck className="w-3 h-3" /> Conforme</Badge>
                      ) : (
                        <Badge className="bg-red-50 text-red-700 border-0 text-[11px] gap-1"><ShieldAlert className="w-3 h-3" /> {conf.missing.length > 0 ? `${conf.missing.length} pièce(s) manquante(s)` : 'Doc expiré'}</Badge>
                      )}
                      {typeof s.rating === 'number' && s.rating > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-[11px] text-amber-600"><Star className="w-3 h-3 fill-amber-400 text-amber-400" />{s.rating}</span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      {s.phone && <span className="inline-flex items-center gap-1 truncate"><Phone className="w-3 h-3" />{s.phone}</span>}
                      {s.email && <span className="inline-flex items-center gap-1 truncate"><Mail className="w-3 h-3" />{s.email}</span>}
                    </div>

                    {/* Rentabilité : ce qu'il rapporte vs ce qu'on le paye */}
                    {(m.ca > 0 || m.cout > 0) && (
                      <div className="grid grid-cols-3 gap-1 pt-2 border-t border-gray-100 text-center">
                        <div><p className="text-[10px] text-gray-400">CA</p><p className="text-xs font-semibold text-gray-800 tabular-nums">{formatCurrency(m.ca)}</p></div>
                        <div><p className="text-[10px] text-gray-400">Coût</p><p className="text-xs font-semibold text-gray-800 tabular-nums">{formatCurrency(m.cout)}</p></div>
                        <div><p className="text-[10px] text-gray-400">Marge</p><p className={`text-xs font-bold tabular-nums ${m.marge >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatCurrency(m.marge)}</p></div>
                      </div>
                    )}
                    {(m.toValidate > 0 || m.unpaid > 0 || m.litiges > 0) && (
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500">
                        {m.toValidate > 0 && <span className="text-amber-600">{m.toValidate} à valider</span>}
                        {m.unpaid > 0 && <span className="text-gray-700 font-medium">{formatCurrency(m.unpaid)} dû</span>}
                        {m.litiges > 0 && <span className="text-red-600">{m.litiges} litige(s)</span>}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

function KpiCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: 'neutral' | 'ok' | 'warn' | 'danger' }) {
  const toneCls = {
    neutral: 'text-gray-500 bg-gray-100',
    ok: 'text-emerald-600 bg-emerald-50',
    warn: 'text-amber-600 bg-amber-50',
    danger: 'text-red-600 bg-red-50',
  }[tone]
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className={`grid place-items-center w-7 h-7 rounded-lg ${toneCls}`}>{icon}</span>
          <span className="text-xs text-gray-500">{label}</span>
        </div>
        <p className="text-2xl font-bold text-gray-900 tabular-nums">{value}</p>
      </CardContent>
    </Card>
  )
}
