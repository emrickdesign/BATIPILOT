import DottedCard from '@/components/charts/DottedCard'
import { formatCurrency } from '@/lib/utils'

type Props = {
  margePct: number | null
  marge: number
  facture: number
  encaisse: number
  reste: number
  revenuSigne: number
  coutMainOeuvre: number
  coutDepensesHt: number
  coutSousTraitance: number
  totalHeures: number
}

export default function ChantierFinancePanel(p: Props) {
  const segments = [
    { label: "Main-d'œuvre", value: p.coutMainOeuvre, color: '#2F6BE8' },
    { label: 'Matériaux / dépenses', value: p.coutDepensesHt, color: '#C9820F' },
    { label: 'Sous-traitance', value: p.coutSousTraitance, color: '#D65A34' },
    { label: 'Marge', value: Math.max(p.marge, 0), color: '#4E9331' },
  ].filter(s => s.value > 0)

  const R = 58, STROKE = 20, CIRC = 2 * Math.PI * R
  const sum = segments.reduce((s, x) => s + x.value, 0)
  let cursor = 0
  const arcs = sum > 0 ? segments.map((s, i) => {
    const frac = s.value / sum
    const length = frac * CIRC
    const offset = -cursor
    cursor += frac * CIRC
    return { ...s, id: `fin-${i}`, length, offset }
  }) : []

  const chips: { label: string; value: number; cls: string }[] = [
    { label: 'Facturé', value: p.facture, cls: 'text-marine' },
    { label: 'Encaissé', value: p.encaisse, cls: 'text-[#3F7A2E]' },
    { label: 'Reste', value: p.reste, cls: p.reste > 0 ? 'text-[#8A5A08]' : 'text-gray-400' },
  ]

  return (
    <DottedCard>
      <div className="p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-heading font-semibold text-marine flex items-center gap-2">Financier</h3>
          {p.margePct !== null && (
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${p.marge >= 0 ? 'bg-[#E9F2DB] text-[#3F7A2E]' : 'bg-[#FBE0DA] text-[#C0392B]'}`}>
              marge {p.margePct} %
            </span>
          )}
        </div>

        {/* Chips cashflow */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {chips.map(c => (
            <div key={c.label} className="rounded-xl bg-white/70 border border-[#EBD9CE] px-3 py-2 text-center">
              <div className={`text-sm font-bold tabular-nums leading-tight ${c.cls}`}>{formatCurrency(c.value)}</div>
              <div className="text-[10px] uppercase tracking-wide text-gray-400 mt-0.5">{c.label}</div>
            </div>
          ))}
        </div>

        {/* Répartition (donut) */}
        {sum <= 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">Pas encore de coûts enregistrés.</p>
        ) : (
          <div className="flex items-center gap-4">
            <div className="flex-1 min-w-0 space-y-2.5">
              {segments.map((s, i) => (
                <div key={i} className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                    <span className="text-[11px] text-gray-500 truncate">{s.label}</span>
                  </div>
                  <p className="text-[14px] font-bold text-marine tabular-nums leading-tight pl-[18px]">{formatCurrency(s.value)}</p>
                </div>
              ))}
            </div>
            <div className="relative w-[168px] h-[168px] flex-shrink-0">
              <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90">
                <circle cx="100" cy="100" r={R} fill="none" stroke="rgba(138,75,36,0.10)" strokeWidth={STROKE} />
                {arcs.map(a => (
                  <circle key={a.id} cx="100" cy="100" r={R} fill="none" stroke={a.color} strokeWidth={STROKE}
                    strokeDasharray={`${a.length} ${CIRC - a.length}`} strokeDashoffset={a.offset} />
                ))}
              </svg>
              <div className="absolute inset-0 grid place-items-center text-center pointer-events-none">
                <div className="max-w-[70%]">
                  <p className="text-[9px] uppercase tracking-wider text-gray-400">CA signé</p>
                  <p className="font-bold text-marine tabular-nums leading-tight" style={{ fontSize: formatCurrency(p.revenuSigne).length <= 9 ? 15 : 12 }}>{formatCurrency(p.revenuSigne)}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        <p className="text-[11px] text-gray-400 mt-3 leading-snug">
          Marge = CA signé HT ({formatCurrency(p.revenuSigne)}) − dépenses − main-d&apos;œuvre{p.coutSousTraitance > 0 ? ' − sous-traitance' : ''}.
          {p.totalHeures > 0 && ` ${p.totalHeures.toFixed(1).replace('.0', '')} h déclarées.`}
        </p>
      </div>
    </DottedCard>
  )
}
