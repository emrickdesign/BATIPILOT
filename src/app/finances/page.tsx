import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Landmark, Receipt, Wallet, ChevronRight } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

const num = (v: unknown) => Number(v) || 0

async function getData(userId: string) {
  const supabase = await createClient()
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  const sixStart = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString().split('T')[0]

  const [accRes, txRes, openInvRes, arappRes, expMonthRes, expVerifRes] = await Promise.all([
    supabase.from('bank_accounts').select('balance').eq('user_id', userId),
    supabase.from('bank_transactions').select('tx_date, amount')
      .eq('user_id', userId).neq('status', 'ignore').gte('tx_date', sixStart),
    supabase.from('invoices').select('amount_due, total_ttc')
      .eq('user_id', userId).in('status', ['envoyee', 'en_retard', 'payee_partiellement']),
    supabase.from('bank_transactions').select('id', { count: 'exact', head: true })
      .eq('user_id', userId).eq('status', 'a_rapprocher'),
    supabase.from('expenses').select('amount_ttc').eq('user_id', userId).gte('expense_date', monthStart),
    supabase.from('expenses').select('id', { count: 'exact', head: true })
      .eq('user_id', userId).eq('status', 'a_verifier'),
  ])

  const accounts = accRes.data || []
  const solde = accounts.reduce((s, a) => s + num(a.balance), 0)
  const hasBalance = accounts.some(a => a.balance !== null && a.balance !== undefined)

  // Net par mois (6) depuis le flux bancaire — pour le mini-spark + net du mois.
  const spark: number[] = []
  const keys: string[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    spark.push(0)
  }
  for (const t of txRes.data || []) {
    if (!t.tx_date) continue
    const idx = keys.indexOf(String(t.tx_date).slice(0, 7))
    if (idx >= 0) spark[idx] += num(t.amount)
  }
  const netMois = spark[spark.length - 1]

  const resteAEncaisser = (openInvRes.data || []).reduce((s, i) => s + (num(i.amount_due) || num(i.total_ttc)), 0)
  const nbARapprocher = arappRes.count || 0
  const sortiesMois = (expMonthRes.data || []).reduce((s, e) => s + num(e.amount_ttc), 0)
  const nbAVerifier = expVerifRes.count || 0

  return { solde, hasBalance, spark, netMois, resteAEncaisser, nbARapprocher, sortiesMois, nbAVerifier }
}

export default async function FinancesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const d = await getData(user.id)
  const maxSpark = Math.max(1, ...d.spark.map(Math.abs))

  return (
    <div className="space-y-6">
      <div className="animate-fade-up flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-[28px] font-heading font-bold text-marine">Finances</h1>
          <p className="text-gray-500 mt-1 text-sm">Trésorerie, paiements et dépenses au même endroit.</p>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-400">Solde bancaire</div>
          <div className="text-3xl font-heading font-bold text-marine tabular-nums">{d.hasBalance ? formatCurrency(d.solde) : '—'}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-fade-up">
        {/* Trésorerie */}
        <Link href="/tresorerie" className="group rounded-2xl border border-gray-200 bg-white p-5 hover:border-marine/30 hover:shadow-sm transition-all">
          <div className="flex items-center justify-between mb-4">
            <span className="grid place-items-center w-10 h-10 rounded-xl bg-[#E3ECFB] text-[#1F5FAE]"><Landmark className="w-5 h-5" /></span>
            <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-marine transition-colors" />
          </div>
          <div className="text-sm font-semibold text-marine">Trésorerie</div>
          <div className="text-xs text-gray-400 mb-3">Entrées − sorties du compte</div>
          <div className={`text-2xl font-bold tabular-nums ${d.netMois >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {d.netMois >= 0 ? '+ ' : '− '}{formatCurrency(Math.abs(d.netMois))}
          </div>
          <div className="text-[11px] text-gray-400 mb-2">net ce mois</div>
          <div className="flex items-end gap-1 h-8">
            {d.spark.map((v, i) => {
              const h = Math.round((Math.abs(v) / maxSpark) * 26) + 2
              return <div key={i} className="flex-1 rounded-sm" style={{ height: `${h}px`, background: v >= 0 ? '#4E9331' : '#E24B4A' }} />
            })}
          </div>
        </Link>

        {/* Paiements */}
        <Link href="/banque" className="group rounded-2xl border border-gray-200 bg-white p-5 hover:border-marine/30 hover:shadow-sm transition-all">
          <div className="flex items-center justify-between mb-4">
            <span className="grid place-items-center w-10 h-10 rounded-xl bg-[#FBEFD4] text-[#8A5A08]"><Receipt className="w-5 h-5" /></span>
            <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-marine transition-colors" />
          </div>
          <div className="text-sm font-semibold text-marine">Paiements</div>
          <div className="text-xs text-gray-400 mb-3">Factures à encaisser</div>
          <div className="text-2xl font-bold tabular-nums text-marine">{formatCurrency(d.resteAEncaisser)}</div>
          <div className="text-[11px] text-gray-400 mb-2">reste à encaisser</div>
          {d.nbARapprocher > 0
            ? <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">{d.nbARapprocher} paiement{d.nbARapprocher > 1 ? 's' : ''} à rapprocher</span>
            : <span className="text-xs text-gray-400">Tout est rapproché</span>}
        </Link>

        {/* Dépenses */}
        <Link href="/depenses" className="group rounded-2xl border border-gray-200 bg-white p-5 hover:border-marine/30 hover:shadow-sm transition-all">
          <div className="flex items-center justify-between mb-4">
            <span className="grid place-items-center w-10 h-10 rounded-xl bg-[#FBE0DA] text-[#C0392B]"><Wallet className="w-5 h-5" /></span>
            <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-marine transition-colors" />
          </div>
          <div className="text-sm font-semibold text-marine">Dépenses</div>
          <div className="text-xs text-gray-400 mb-3">Sorties du mois</div>
          <div className="text-2xl font-bold tabular-nums text-rose-600">− {formatCurrency(d.sortiesMois)}</div>
          <div className="text-[11px] text-gray-400 mb-2">ce mois-ci</div>
          {d.nbAVerifier > 0
            ? <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">{d.nbAVerifier} à vérifier</span>
            : <span className="text-xs text-gray-400">Rien à vérifier</span>}
        </Link>
      </div>
    </div>
  )
}
