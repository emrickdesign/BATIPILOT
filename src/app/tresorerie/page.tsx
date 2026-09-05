import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Landmark, ArrowDownToLine, ArrowUpFromLine, Wallet, Link2, TrendingUp, TrendingDown } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import StatCard from '@/components/charts/StatCard'
import TresorerieReleve, { type Mouvement } from './TresorerieClient'

const num = (v: unknown) => Number(v) || 0
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

async function getData(userId: string) {
  const supabase = await createClient()
  const now = new Date()
  // Fenêtre : 6 mois glissants (mois courant inclus).
  const start = new Date(now.getFullYear(), now.getMonth() - 5, 1)
  const startIso = start.toISOString().split('T')[0]

  const [accRes, txRes, openInvRes, subToPayRes] = await Promise.all([
    supabase.from('bank_accounts').select('balance, balance_updated_at').eq('user_id', userId),
    supabase.from('bank_transactions')
      .select('id, tx_date, label, amount, status, match_method, matched_invoice_id, matched_expense_id')
      .eq('user_id', userId).neq('status', 'ignore')
      .gte('tx_date', startIso).order('tx_date', { ascending: false }),
    supabase.from('invoices').select('amount_due, total_ttc')
      .eq('user_id', userId).in('status', ['envoyee', 'en_retard', 'payee_partiellement']),
    supabase.from('subcontractor_invoices').select('amount_ttc, amount_ht, status')
      .eq('user_id', userId).in('status', ['a_valider', 'validee']),
  ])

  const accounts = accRes.data || []
  const solde = accounts.reduce((s, a) => s + num(a.balance), 0)
  const hasBalance = accounts.some(a => a.balance !== null && a.balance !== undefined)
  const soldeMaj = accounts.map(a => a.balance_updated_at).filter(Boolean).sort().pop() as string | undefined

  const txns = txRes.data || []

  // Résout les libellés de rapprochement : n° facture (entrées) / fournisseur (sorties).
  const invIds = [...new Set(txns.map(t => t.matched_invoice_id).filter(Boolean))] as string[]
  const expIds = [...new Set(txns.map(t => t.matched_expense_id).filter(Boolean))] as string[]
  const [invRefRes, expRefRes] = await Promise.all([
    invIds.length ? supabase.from('invoices').select('id, invoice_number').in('id', invIds) : Promise.resolve({ data: [] }),
    expIds.length ? supabase.from('expenses').select('id, supplier').in('id', expIds) : Promise.resolve({ data: [] }),
  ])
  const invRef = new Map((invRefRes.data || []).map(i => [i.id, i.invoice_number as string]))
  const expRef = new Map((expRefRes.data || []).map(e => [e.id, (e.supplier as string) || 'Dépense']))

  const mouvements: Mouvement[] = txns.map(t => {
    const amount = num(t.amount)
    const ref = t.matched_invoice_id ? invRef.get(t.matched_invoice_id) || null
      : t.matched_expense_id ? expRef.get(t.matched_expense_id) || null : null
    return {
      id: t.id, date: t.tx_date, label: t.label, amount,
      status: t.status as string, method: (t.match_method as string) || null, ref,
      kind: amount >= 0 ? 'in' : 'out',
    }
  })

  // Agrégats mensuels (6 mois) depuis le flux bancaire = vérité cash.
  const months: { key: string; label: string; in: number; out: number; net: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push({ key: monthKey(d), label: MONTHS[d.getMonth()], in: 0, out: 0, net: 0 })
  }
  const monthByKey = new Map(months.map(m => [m.key, m]))
  for (const t of txns) {
    if (!t.tx_date) continue
    const m = monthByKey.get(String(t.tx_date).slice(0, 7))
    if (!m) continue
    const a = num(t.amount)
    if (a >= 0) m.in += a; else m.out += a
  }
  for (const m of months) m.net = m.in + m.out

  const cur = months[months.length - 1]
  const resteAEncaisser = (openInvRes.data || []).reduce((s, i) => s + (num(i.amount_due) || num(i.total_ttc)), 0)
  const aDecaisser = (subToPayRes.data || []).reduce((s, i) => s + (num(i.amount_ttc) || num(i.amount_ht) * 1.2), 0)
  const nbARapprocher = mouvements.filter(m => m.status === 'a_rapprocher').length

  return { solde, hasBalance, soldeMaj, mouvements, months, cur, resteAEncaisser, aDecaisser, nbARapprocher }
}

export default async function TresoreriePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const d = await getData(user.id)
  const { data: bankConn } = await supabase.from('bank_connections')
    .select('id').eq('user_id', user.id).eq('status', 'linked').limit(1).maybeSingle()
  const bankConnected = !!bankConn

  const maxBar = Math.max(1, ...d.months.map(m => Math.abs(m.net)))
  const inMonth = d.cur.in, outMonth = Math.abs(d.cur.out), totMonth = inMonth + outMonth || 1

  return (
    <div className="space-y-6">
      <div className="animate-fade-up flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-[28px] font-heading font-bold text-marine">Trésorerie</h1>
          <p className="text-gray-500 mt-1 text-sm">Tout ce qui entre et sort de l’entreprise, en un coup d’œil.</p>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-400">Solde bancaire{d.soldeMaj ? ' · à jour' : ''}</div>
          <div className="text-3xl font-heading font-bold text-marine tabular-nums">
            {d.hasBalance ? formatCurrency(d.solde) : '—'}
          </div>
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 animate-fade-up">
        <StatCard label="Entrées du mois" value={`+ ${formatCurrency(inMonth)}`} icon={ArrowDownToLine} tone="green" note={`net ${d.cur.net >= 0 ? '+' : ''}${formatCurrency(d.cur.net)}`} />
        <StatCard label="Sorties du mois" value={`− ${formatCurrency(outMonth)}`} icon={ArrowUpFromLine} tone="red" />
        <StatCard label="Reste à encaisser" value={formatCurrency(d.resteAEncaisser)} icon={Wallet} tone="amber" note="factures ouvertes" />
        <StatCard label="À décaisser" value={formatCurrency(d.aDecaisser)} icon={Link2} tone="blue" note="sous-traitants" />
      </div>

      {/* Barre entrées vs sorties du mois courant */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 animate-fade-up">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-marine">Ce mois-ci</h2>
          <span className={`text-sm font-semibold tabular-nums ${d.cur.net >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            Net {d.cur.net >= 0 ? '+' : ''}{formatCurrency(d.cur.net)}
          </span>
        </div>
        <div className="flex h-5 rounded-md overflow-hidden bg-gray-100">
          <div className="bg-emerald-500" style={{ width: `${(inMonth / totMonth) * 100}%` }} />
          <div className="bg-rose-500" style={{ width: `${(outMonth / totMonth) * 100}%` }} />
        </div>
        <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
          <span className="flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> Entrées {formatCurrency(inMonth)}</span>
          <span className="flex items-center gap-1.5">Sorties {formatCurrency(outMonth)} <TrendingDown className="w-3.5 h-3.5 text-rose-500" /></span>
        </div>
      </div>

      {/* Évolution du net sur 6 mois */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 animate-fade-up">
        <h2 className="font-semibold text-marine mb-4">Évolution du net · 6 mois</h2>
        <div className="flex items-end justify-between gap-2 sm:gap-4 h-28">
          {d.months.map(m => {
            const h = Math.round((Math.abs(m.net) / maxBar) * 88) + 4
            const pos = m.net >= 0
            return (
              <div key={m.key} className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
                <span className={`text-[10px] tabular-nums ${pos ? 'text-emerald-600' : 'text-rose-500'}`}>
                  {pos ? '+' : '−'}{Math.abs(Math.round(m.net / 1000))}k
                </span>
                <div className="w-full rounded-md" style={{ height: `${h}px`, background: pos ? '#4E9331' : '#E24B4A' }} />
                <span className="text-[11px] text-gray-400">{m.label}</span>
              </div>
            )
          })}
        </div>
      </div>

      <TresorerieReleve mouvements={d.mouvements} nbARapprocher={d.nbARapprocher} />
    </div>
  )
}
