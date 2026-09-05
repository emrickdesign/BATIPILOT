'use client'

import { useMemo, useState, type ComponentProps } from 'react'
import { Landmark, Receipt, Wallet } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import TresorerieView from './TresorerieView'
import BanqueClient from '@/app/banque/BanqueClient'
import DepensesLedger from '@/app/depenses/DepensesLedger'
import type { TresorerieData, PaiementsData } from '@/lib/finances-data'

type Tab = 'tresorerie' | 'paiements' | 'depenses'

export default function FinancesHub({
  tresorerie, paiements, depenses,
}: {
  tresorerie: TresorerieData
  paiements: PaiementsData
  depenses: ComponentProps<typeof DepensesLedger>
}) {
  const [tab, setTab] = useState<Tab>('tresorerie')

  // Résumés compacts pour les 3 cartes-sélecteurs.
  const netMois = tresorerie.months[tresorerie.months.length - 1]?.net ?? 0
  const nbARapprocher = paiements.transactions.length
  const { sortiesMois, nbAVerifier } = useMemo(() => {
    const now = new Date()
    const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    let s = 0, v = 0
    for (const e of depenses.expenses) {
      if ((e.expense_date || '').slice(0, 7) === key) s += Number(e.amount_ttc) || 0
      if (e.status === 'a_verifier') v++
    }
    return { sortiesMois: s, nbAVerifier: v }
  }, [depenses.expenses])

  const cards: { id: Tab; icon: typeof Landmark; iconBg: string; title: string; value: string; valueClass: string; note: string }[] = [
    {
      id: 'tresorerie', icon: Landmark, iconBg: 'bg-[#E3ECFB] text-[#1F5FAE]', title: 'Trésorerie',
      value: `${netMois >= 0 ? '+ ' : '− '}${formatCurrency(Math.abs(netMois))}`,
      valueClass: netMois >= 0 ? 'text-emerald-600' : 'text-rose-600', note: 'net ce mois',
    },
    {
      id: 'paiements', icon: Receipt, iconBg: 'bg-[#FBEFD4] text-[#8A5A08]', title: 'Paiements',
      value: formatCurrency(tresorerie.resteAEncaisser), valueClass: 'text-marine',
      note: nbARapprocher > 0 ? `${nbARapprocher} à rapprocher` : 'reste à encaisser',
    },
    {
      id: 'depenses', icon: Wallet, iconBg: 'bg-[#FBE0DA] text-[#C0392B]', title: 'Dépenses',
      value: `− ${formatCurrency(sortiesMois)}`, valueClass: 'text-rose-600',
      note: nbAVerifier > 0 ? `${nbAVerifier} à vérifier` : 'sorties du mois',
    },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-2 sm:gap-3 animate-fade-up">
        {cards.map(c => {
          const active = tab === c.id
          const Icon = c.icon
          return (
            <button
              key={c.id}
              onClick={() => setTab(c.id)}
              className={`text-left rounded-xl border p-3 sm:p-4 transition-all ${active ? 'border-marine/40 bg-white shadow-sm ring-1 ring-marine/10' : 'border-gray-200 bg-white/60 hover:bg-white hover:border-gray-300'}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className={`grid place-items-center w-8 h-8 rounded-lg flex-shrink-0 ${c.iconBg}`}><Icon className="w-4 h-4" /></span>
                <span className={`text-sm font-semibold ${active ? 'text-marine' : 'text-gray-500'}`}>{c.title}</span>
              </div>
              <div className={`text-lg sm:text-xl font-bold tabular-nums ${c.valueClass}`}>{c.value}</div>
              <div className="text-[11px] text-gray-400 truncate">{c.note}</div>
            </button>
          )
        })}
      </div>

      <div className="animate-fade-up">
        {tab === 'tresorerie' && <TresorerieView data={tresorerie} onGoToPaiements={() => setTab('paiements')} />}
        {tab === 'paiements' && <BanqueClient transactions={paiements.transactions} openInvoices={paiements.openInvoices} />}
        {tab === 'depenses' && <DepensesLedger expenses={depenses.expenses} projects={depenses.projects} />}
      </div>
    </div>
  )
}
