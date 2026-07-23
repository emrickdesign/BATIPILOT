import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Plus, HardHat, AlertTriangle, Banknote, TrendingUp } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import StatCard from '@/components/charts/StatCard'
import { type ChantierCard } from './ChantiersList'
import ChantiersKanban from './ChantiersKanban'
import { chantierCol, type ChantierCardData } from './kanban-config'
import { clientDisplayName } from '@/lib/chantiers'

const num = (v: unknown) => Number(v) || 0

export default async function ChantiersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: projects }, { data: quotes }, { data: expenses }, { data: assignments }, { data: times }, { data: employees }] = await Promise.all([
    supabase.from('projects').select('*, clients(type, first_name, last_name, company_name)').eq('user_id', user.id).order('created_at', { ascending: false }),
    supabase.from('quotes').select('project_id, status, total_ttc, subtotal_ht').eq('user_id', user.id),
    supabase.from('expenses').select('project_id, amount_ttc, amount_ht').eq('user_id', user.id).neq('status', 'archive'),
    supabase.from('assignments').select('project_id, employee_id').eq('user_id', user.id),
    supabase.from('time_entries').select('project_id, employee_id, hours').eq('user_id', user.id),
    supabase.from('employees').select('id, hourly_cost').eq('user_id', user.id),
  ])

  const today = new Date().toISOString().split('T')[0]
  const empCost = new Map((employees || []).map(e => [e.id, num(e.hourly_cost)]))
  const isSigned = (s: string) => s === 'accepte' || s === 'transforme'

  // Agrégats par chantier
  const devisTtc = new Map<string, number>(), signedHt = new Map<string, number>()
  for (const q of quotes || []) {
    if (!q.project_id) continue
    devisTtc.set(q.project_id, (devisTtc.get(q.project_id) || 0) + num(q.total_ttc))
    if (isSigned(q.status)) signedHt.set(q.project_id, (signedHt.get(q.project_id) || 0) + num(q.subtotal_ht))
  }
  const depTtc = new Map<string, number>(), depHt = new Map<string, number>()
  for (const e of expenses || []) {
    if (!e.project_id) continue
    depTtc.set(e.project_id, (depTtc.get(e.project_id) || 0) + num(e.amount_ttc))
    depHt.set(e.project_id, (depHt.get(e.project_id) || 0) + (num(e.amount_ht) || num(e.amount_ttc)))
  }
  const labor = new Map<string, number>()
  for (const t of times || []) {
    if (!t.project_id) continue
    labor.set(t.project_id, (labor.get(t.project_id) || 0) + num(t.hours) * (empCost.get(t.employee_id) || 0))
  }
  const equipe = new Map<string, Set<string>>()
  for (const a of assignments || []) {
    if (!a.project_id) continue
    if (!equipe.has(a.project_id)) equipe.set(a.project_id, new Set())
    equipe.get(a.project_id)!.add(a.employee_id)
  }

  const CLOSED = ['termine', 'a_facturer', 'facture', 'paye', 'archive']
  const cards: ChantierCard[] = (projects || []).map(p => {
    const signed = signedHt.get(p.id) || 0
    const cout = (depHt.get(p.id) || 0) + (labor.get(p.id) || 0)
    return {
      ...p,
      montantDevis: devisTtc.get(p.id) || 0,
      depenses: depTtc.get(p.id) || 0,
      marge: signed > 0 || cout > 0 ? signed - cout : null,
      equipeCount: equipe.get(p.id)?.size || 0,
      enRetard: !CLOSED.includes(p.status) && !!p.end_date && p.end_date < today,
    }
  })

  // KPI en-tête
  const actifs = cards.filter(c => !CLOSED.includes(c.status)).length
  const nbRetard = cards.filter(c => c.enRetard).length
  const totalSigne = [...signedHt.values()].reduce((s, v) => s + v, 0)
  const totalMarge = cards.reduce((s, c) => s + (c.marge ?? 0), 0)

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 animate-fade-up">
        <div>
          <h1 className="text-2xl md:text-[26px] font-bold font-heading text-marine">Mes chantiers</h1>
          <p className="text-gray-500 mt-1 text-sm">Pilotez vos chantiers, du devis à la facturation.</p>
        </div>
        <Link href="/chantiers/nouveau">
          <Button className="h-10 gap-2 shadow-sm"><Plus className="w-4 h-4" /> Nouveau chantier</Button>
        </Link>
      </div>

      {cards.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 animate-fade-up">
          <StatCard label="Chantiers actifs" value={String(actifs)} icon={HardHat} tone="coral" note={`${cards.length} au total`} />
          <StatCard label="En retard" value={String(nbRetard)} icon={AlertTriangle} tone="red" note={nbRetard > 0 ? 'à surveiller' : 'aucun'} />
          <StatCard label="Chiffre signé" value={formatCurrency(totalSigne)} icon={Banknote} tone="green" note="HT devis signés" />
          <StatCard label="Marge estimée" value={formatCurrency(totalMarge)} icon={TrendingUp} tone="blue" note="signé − coûts" />
        </div>
      )}

      <ChantiersKanban initialItems={cards.filter(c => c.status !== 'archive').map((c): ChantierCardData => ({
        id: c.id,
        col: chantierCol(c.status),
        title: c.title,
        clientName: c.clients ? clientDisplayName(c.clients) : null,
        amountFmt: c.montantDevis > 0 ? formatCurrency(c.montantDevis) : null,
        margeFmt: c.marge != null ? formatCurrency(c.marge) : null,
        margePos: (c.marge ?? 0) >= 0,
        enRetard: c.enRetard,
        equipeCount: c.equipeCount,
        progress: Number(c.progress) || 0,
        cta: ctaForCol(chantierCol(c.status)),
      }))} />
    </div>
  )
}

function ctaForCol(col: string): string {
  switch (col) {
    case 'a_planifier': return 'Planifier'
    case 'en_cours': return 'Suivre le chantier'
    case 'a_facturer': return 'Créer la facture'
    case 'facture': return 'Suivre le paiement'
    default: return 'Voir le chantier'
  }
}
