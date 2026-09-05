'use client'

import { useMemo, useState } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, Wallet, Link2 } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import StatCard from '@/components/charts/StatCard'
import TresorerieReleve from './TresorerieReleve'
import type { TresorerieData } from '@/lib/finances-data'

export default function TresorerieView({ data }: { data: TresorerieData }) {
  const { months, mouvements } = data
  // 'r6' = 6 derniers mois, sinon une clé 'YYYY-MM'.
  const [periode, setPeriode] = useState<string>('r6')

  const barMonths = useMemo(() => months.slice(-6), [months])
  const win6Start = barMonths[0]?.key || '0000-00'

  const view = useMemo(() => {
    const inWindow = (d: string | null) => {
      const k = (d || '').slice(0, 7)
      return periode === 'r6' ? k >= win6Start : k === periode
    }
    const mv = mouvements.filter(m => inWindow(m.date))
    let entrees = 0, sorties = 0
    if (periode === 'r6') {
      for (const m of barMonths) { entrees += m.in; sorties += m.out }
    } else {
      const m = months.find(x => x.key === periode)
      if (m) { entrees = m.in; sorties = m.out }
    }
    return { mv, entrees, sorties, net: entrees + sorties }
  }, [periode, mouvements, months, barMonths, win6Start])

  const maxBar = Math.max(1, ...barMonths.map(m => Math.abs(m.net)))
  const outAbs = Math.abs(view.sorties)
  const tot = view.entrees + outAbs || 1

  const options = [
    { value: 'r6', label: '6 derniers mois' },
    ...[...months].reverse().map(m => ({ value: m.key, label: `${m.label} ${m.key.slice(0, 4)}` })),
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="font-heading font-bold text-marine text-lg">Trésorerie</h2>
        <select
          value={periode}
          onChange={e => setPeriode(e.target.value)}
          className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-marine focus:outline-none focus:ring-2 focus:ring-primary"
        >
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Entrées" value={`+ ${formatCurrency(view.entrees)}`} icon={ArrowDownToLine} tone="green" note={`net ${view.net >= 0 ? '+' : ''}${formatCurrency(view.net)}`} />
        <StatCard label="Sorties" value={`− ${formatCurrency(outAbs)}`} icon={ArrowUpFromLine} tone="red" />
        <StatCard label="Reste à encaisser" value={formatCurrency(data.resteAEncaisser)} icon={Wallet} tone="amber" note="factures ouvertes" />
        <StatCard label="À décaisser" value={formatCurrency(data.aDecaisser)} icon={Link2} tone="blue" note="sous-traitants" />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-marine">{periode === 'r6' ? '6 derniers mois' : options.find(o => o.value === periode)?.label}</h3>
          <span className={`text-sm font-semibold tabular-nums ${view.net >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            Net {view.net >= 0 ? '+' : ''}{formatCurrency(view.net)}
          </span>
        </div>
        <div className="flex h-5 rounded-md overflow-hidden bg-gray-100">
          <div className="bg-emerald-500" style={{ width: `${(view.entrees / tot) * 100}%` }} />
          <div className="bg-rose-500" style={{ width: `${(outAbs / tot) * 100}%` }} />
        </div>
        <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
          <span>Entrées {formatCurrency(view.entrees)}</span>
          <span>Sorties {formatCurrency(outAbs)}</span>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="font-semibold text-marine mb-4">Évolution du net · 6 mois</h3>
        <div className="flex items-end justify-between gap-2 sm:gap-4 h-28">
          {barMonths.map(m => {
            const h = Math.round((Math.abs(m.net) / maxBar) * 88) + 4
            const pos = m.net >= 0
            const selected = periode === m.key
            return (
              <button key={m.key} onClick={() => setPeriode(m.key)} className="flex flex-col items-center gap-1.5 flex-1 min-w-0 group">
                <span className={`text-[10px] tabular-nums ${pos ? 'text-emerald-600' : 'text-rose-500'}`}>{pos ? '+' : '−'}{Math.abs(Math.round(m.net / 1000))}k</span>
                <div className="w-full rounded-md transition-opacity" style={{ height: `${h}px`, background: pos ? '#4E9331' : '#E24B4A', opacity: periode === 'r6' || selected ? 1 : 0.35 }} />
                <span className={`text-[11px] ${selected ? 'text-marine font-medium' : 'text-gray-400'}`}>{m.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      <TresorerieReleve mouvements={view.mv} nbARapprocher={data.nbARapprocher} />
    </div>
  )
}
