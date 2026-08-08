import DottedCard from './DottedCard'

export type DonutSeg = { label: string; value: number; color: string }

// Répartition : légende (chiffres clés) à gauche, gros anneau à droite.
// Layout horizontal → carte peu haute, alignée sur les sections de Relances.
export default function RelanceDonutPanel({
  title, subtitle, segments, format = v => String(v),
}: { title: string; subtitle?: string; segments: DonutSeg[]; format?: (v: number) => string }) {
  const R = 58, STROKE = 20, CIRC = 2 * Math.PI * R
  const vis = segments.filter(s => s.value > 0)
  const sum = vis.reduce((s, x) => s + x.value, 0)

  let cursor = 0
  const arcs = sum > 0 ? vis.map((s, i) => {
    const frac = s.value / sum
    const length = frac * CIRC
    const offset = -cursor
    cursor += frac * CIRC
    return { ...s, id: `rdp-${i}`, length, offset }
  }) : []

  return (
    <DottedCard className="h-[320px]">
      <div className="p-4 sm:p-5 h-full flex flex-col">
        <div className="mb-3">
          <h3 className="font-heading font-semibold text-marine">{title}</h3>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>

        {sum <= 0 ? (
          <div className="flex-1 grid place-items-center text-sm text-gray-400 text-center px-3">Aucun montant à répartir pour le moment.</div>
        ) : (
          <div className="flex-1 flex items-center gap-4 min-h-0">
            {/* Légende — chiffres clés à gauche */}
            <div className="flex-1 min-w-0 space-y-3">
              {vis.map((s, i) => (
                <div key={i} className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                    <span className="text-[11px] text-gray-500 truncate">{s.label}</span>
                  </div>
                  <p className="text-[15px] font-bold text-marine tabular-nums leading-tight pl-[18px]">{format(s.value)}</p>
                </div>
              ))}
            </div>

            {/* Anneau — plus gros à droite */}
            <div className="relative h-full aspect-square max-h-[220px] flex-shrink-0 self-center">
              <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90">
                <circle cx="100" cy="100" r={R} fill="none" stroke="rgba(138,75,36,0.10)" strokeWidth={STROKE} />
                {arcs.map(a => (
                  <circle key={a.id} cx="100" cy="100" r={R} fill="none" stroke={a.color} strokeWidth={STROKE}
                    strokeDasharray={`${a.length} ${CIRC - a.length}`} strokeDashoffset={a.offset} />
                ))}
              </svg>
              <div className="absolute inset-0 grid place-items-center text-center pointer-events-none">
                <div className="max-w-[64%]">
                  <p className="text-[9px] uppercase tracking-wider text-gray-400">Total</p>
                  <p className="font-bold text-marine tabular-nums leading-tight whitespace-nowrap"
                    style={{ fontSize: format(sum).length <= 9 ? 16 : format(sum).length <= 12 ? 14 : 12 }}>
                    {format(sum)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DottedCard>
  )
}
