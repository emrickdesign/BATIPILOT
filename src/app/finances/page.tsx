import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Landmark } from 'lucide-react'
import type { Expense } from '@/types'
import { formatCurrency } from '@/lib/utils'
import { getTresorerieData, getPaiementsData } from '@/lib/finances-data'
import FinancesHub from './FinancesHub'

export default async function FinancesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [tresorerie, paiements, depRes, projRes, bankConnRes] = await Promise.all([
    getTresorerieData(user.id),
    getPaiementsData(user.id),
    supabase.from('expenses').select('*, projects(title)').eq('user_id', user.id)
      .neq('status', 'archive').order('expense_date', { ascending: false, nullsFirst: false }),
    supabase.from('projects').select('id, title').eq('user_id', user.id).neq('status', 'archive').order('created_at', { ascending: false }),
    supabase.from('bank_connections').select('id').eq('user_id', user.id).eq('status', 'linked').limit(1).maybeSingle(),
  ])

  const depenses = { expenses: (depRes.data as Expense[]) || [], projects: projRes.data || [] }
  const bankConnected = !!bankConnRes.data

  return (
    <div className="space-y-6">
      <div className="animate-fade-up flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-[28px] font-heading font-bold text-marine">Finances</h1>
          <p className="text-gray-500 mt-1 text-sm">Trésorerie, paiements et dépenses au même endroit.</p>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-400">Solde bancaire</div>
          <div className="text-3xl font-heading font-bold text-marine tabular-nums">{tresorerie.hasBalance ? formatCurrency(tresorerie.solde) : '—'}</div>
        </div>
      </div>

      {!bankConnected && (
        <Link href="/parametres/banque" className="block animate-fade-up">
          <div className="rounded-xl border border-[#CFDDF6] bg-[#EAF1FC] hover:border-[#1F5FAE]/40 p-4 flex items-center gap-3 transition-colors">
            <span className="grid place-items-center w-10 h-10 rounded-lg flex-shrink-0 bg-white text-[#1F5FAE]"><Landmark className="w-5 h-5" /></span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-[#1F5FAE]">Connecter ma banque (recommandé)</p>
              <p className="text-xs text-gray-500 mt-0.5">Entrées et sorties importées et rapprochées automatiquement, sans rien saisir.</p>
            </div>
          </div>
        </Link>
      )}

      <FinancesHub tresorerie={tresorerie} paiements={paiements} depenses={depenses} />
    </div>
  )
}
