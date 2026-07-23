import { createClient } from '@/lib/supabase/server'
import { ArrowDownToLine, Wallet, Link2 } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { clientDisplayName } from '@/lib/clients'
import StatCard from '@/components/charts/StatCard'
import BanqueClient, { type TxItem } from './BanqueClient'

const num = (v: unknown) => Number(v) || 0
type ClientLite = { type: string; first_name: string | null; last_name: string | null; company_name: string | null } | null

async function getData(userId: string) {
  const supabase = await createClient()
  const now = new Date()
  const [txRes, invRes, paidRes, subToPayRes] = await Promise.all([
    supabase.from('bank_transactions').select('id, tx_date, label, amount')
      .eq('user_id', userId).eq('status', 'a_rapprocher').order('tx_date', { ascending: false }),
    supabase.from('invoices').select('id, invoice_number, status, total_ttc, amount_due, due_date, client_id, clients(type, first_name, last_name, company_name)')
      .eq('user_id', userId).in('status', ['envoyee', 'en_retard', 'payee_partiellement']),
    supabase.from('invoices').select('id, total_ttc, issue_date').eq('user_id', userId).eq('status', 'payee'),
    supabase.from('subcontractor_invoices').select('amount_ttc, amount_ht, status').eq('user_id', userId).in('status', ['a_valider', 'validee']),
  ])

  const txns = txRes.data || []
  const rawInv = invRes.data || []
  const invoices = rawInv.map(inv => ({
    id: inv.id,
    invoice_number: inv.invoice_number as string,
    due: num(inv.amount_due) || num(inv.total_ttc),
    due_date: (inv.due_date as string | null) || null,
    client_id: inv.client_id as string | null,
    clientName: clientDisplayName(inv.clients as unknown as ClientLite),
  }))
  const resteAEncaisser = invoices.reduce((s, i) => s + i.due, 0)

  // Prévision de trésorerie : encaissements attendus par échéance − décaissements ST connus.
  const isoToday = now.toISOString().split('T')[0]
  const iso7 = new Date(now.getTime() + 7 * 86400000).toISOString().split('T')[0]
  const iso30 = new Date(now.getTime() + 30 * 86400000).toISOString().split('T')[0]
  const forecast = { retard: 0, semaine: 0, mois: 0, plusTard: 0 }
  for (const i of invoices) {
    const d = i.due_date
    if (d && d < isoToday) forecast.retard += i.due
    else if (!d || d <= iso7) forecast.semaine += i.due
    else if (d <= iso30) forecast.mois += i.due
    else forecast.plusTard += i.due
  }
  const decaissementsST = (subToPayRes.data || []).reduce((s, i) => s + (num(i.amount_ttc) || num(i.amount_ht) * 1.2), 0)
  const partiels = rawInv.filter(i => i.status === 'payee_partiellement').length
  const payeesMois = (paidRes.data || []).filter(i => {
    if (!i.issue_date) return false
    const d = new Date(i.issue_date); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  })
  const montantPayeMois = payeesMois.reduce((s, i) => s + num(i.total_ttc), 0)

  const used = new Set<string>()
  const transactions: TxItem[] = txns.map(tx => {
    const amount = num(tx.amount)
    let suggestion: TxItem['suggestion'] = null
    if (amount > 0) {
      const label = (tx.label || '').toUpperCase()
      const candidates = invoices.filter(i => !used.has(i.id))
      const byAmount = candidates.filter(i => Math.abs(i.due - amount) <= 1)
      const nameMatch = (i: typeof invoices[number]) => {
        const token = i.clientName.toUpperCase().split(/\s+/).find(w => w.length >= 4)
        return token ? label.includes(token) : false
      }
      const best = byAmount.find(nameMatch) || byAmount[0] || candidates.find(nameMatch)
      if (best) {
        used.add(best.id)
        suggestion = { invoiceId: best.id, invoiceNumber: best.invoice_number, clientName: best.clientName, clientId: best.client_id, amountDue: best.due }
      }
    }
    return { id: tx.id, tx_date: tx.tx_date, label: tx.label, amount, suggestion }
  })

  const totalEntrees = transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
  const nbSuggestions = transactions.filter(t => t.suggestion).length
  return { transactions, totalEntrees, nbSuggestions, resteAEncaisser, partiels, nbPayeesMois: payeesMois.length, montantPayeMois, openInvoices: invoices, forecast, decaissementsST }
}

export default async function BanquePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const d = await getData(user.id)

  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <h1 className="text-2xl md:text-[28px] font-heading font-bold text-marine">Paiements</h1>
        <p className="text-gray-500 mt-1 text-sm">Le client a-t-il payé ? Importe ton relevé, rapproche les virements de tes factures, ou marque un paiement à la main.</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 animate-fade-up">
        <StatCard label="Reste à encaisser" value={formatCurrency(d.resteAEncaisser)} icon={Wallet} tone="amber" note="factures ouvertes" />
        <StatCard label="Encaissé ce mois" value={formatCurrency(d.montantPayeMois)} icon={ArrowDownToLine} tone="green" note={`${d.nbPayeesMois} facture${d.nbPayeesMois > 1 ? 's' : ''}`} />
        <StatCard label="À rapprocher" value={String(d.transactions.length)} icon={Link2} tone="coral" note={`${d.nbSuggestions} suggestion${d.nbSuggestions > 1 ? 's' : ''}`} />
        <StatCard label="Paiements partiels" value={String(d.partiels)} icon={Wallet} tone="blue" />
      </div>
      {(d.forecast.retard + d.forecast.semaine + d.forecast.mois + d.forecast.plusTard > 0 || d.decaissementsST > 0) && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 animate-fade-up">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-marine">Prévision de trésorerie</h2>
            <span className="text-xs text-gray-400">encaissements attendus par échéance</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Prev label="En retard" value={d.forecast.retard} tone="rose" />
            <Prev label="Sous 7 jours" value={d.forecast.semaine} tone="amber" />
            <Prev label="Sous 30 jours" value={d.forecast.mois} tone="marine" />
            <Prev label="Plus tard" value={d.forecast.plusTard} tone="gray" />
          </div>
          {d.decaissementsST > 0 && (
            <p className="text-sm text-gray-500 mt-3 pt-3 border-t border-gray-100">
              À décaisser (factures sous-traitants à régler) : <span className="font-semibold text-rose-600">− {formatCurrency(d.decaissementsST)}</span>
            </p>
          )}
        </div>
      )}
      <BanqueClient transactions={d.transactions} openInvoices={d.openInvoices} />
    </div>
  )
}

function Prev({ label, value, tone }: { label: string; value: number; tone: 'rose' | 'amber' | 'marine' | 'gray' }) {
  const col = tone === 'rose' ? 'text-rose-600' : tone === 'amber' ? 'text-amber-600' : tone === 'marine' ? 'text-marine' : 'text-gray-500'
  return (
    <div className="rounded-lg bg-gray-50 p-3">
      <div className="text-[11px] text-gray-400">{label}</div>
      <div className={`text-lg font-bold tabular-nums mt-0.5 ${col}`}>{formatCurrency(value)}</div>
    </div>
  )
}
