import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowDownToLine, Wallet, Link2 } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { clientDisplayName } from '@/lib/clients'
import BanqueClient, { type TxItem } from './BanqueClient'

const num = (v: unknown) => Number(v) || 0
type ClientLite = { type: string; first_name: string | null; last_name: string | null; company_name: string | null } | null

async function getData(userId: string) {
  const supabase = await createClient()
  const [txRes, invRes] = await Promise.all([
    supabase.from('bank_transactions').select('id, tx_date, label, amount')
      .eq('user_id', userId).eq('status', 'a_rapprocher').order('tx_date', { ascending: false }),
    supabase.from('invoices').select('id, invoice_number, total_ttc, amount_due, client_id, clients(type, first_name, last_name, company_name)')
      .eq('user_id', userId).in('status', ['envoyee', 'en_retard', 'payee_partiellement']),
  ])

  const txns = txRes.data || []
  const invoices = (invRes.data || []).map(inv => ({
    id: inv.id,
    invoice_number: inv.invoice_number as string,
    due: num(inv.amount_due) || num(inv.total_ttc),
    client_id: inv.client_id as string | null,
    clientName: clientDisplayName(inv.clients as unknown as ClientLite),
  }))

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
  return { transactions, totalEntrees, nbSuggestions }
}

function Kpi({ label, value, icon: Icon, tile }: { label: string; value: string; icon: typeof Wallet; tile: string }) {
  return (
    <Card className="border border-gray-200/80 bg-white">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500 font-medium">{label}</span>
          <span className={`grid place-items-center w-8 h-8 rounded-lg ${tile}`}><Icon className="w-4 h-4" /></span>
        </div>
        <div className="text-[24px] font-bold text-marine mt-2 leading-none">{value}</div>
      </CardContent>
    </Card>
  )
}

export default async function BanquePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const d = await getData(user.id)

  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <h1 className="text-2xl md:text-[28px] font-heading font-bold text-marine">Rapprochement bancaire</h1>
        <p className="text-gray-500 mt-1 text-sm">Importe ton relevé, BatiPilot rapproche les paiements de tes factures. Validation manuelle à chaque fois.</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 animate-fade-up">
        <Kpi label="À rapprocher" value={String(d.transactions.length)} icon={ArrowDownToLine} tile="bg-blue-100 text-blue-600" />
        <Kpi label="Entrées détectées" value={formatCurrency(d.totalEntrees)} icon={Wallet} tile="bg-emerald-100 text-emerald-600" />
        <Kpi label="Rapprochements suggérés" value={String(d.nbSuggestions)} icon={Link2} tile="bg-violet-100 text-violet-600" />
      </div>
      <BanqueClient transactions={d.transactions} />
    </div>
  )
}
