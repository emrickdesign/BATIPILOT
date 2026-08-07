import { Card, CardContent } from '@/components/ui/card'

export type DonutSeg = { label: string; value: number; color: string }

// Donut compact (anneau + légende à droite) qui tient dans une case de 300px.
export default function RepartitionDonut({
  title, segments, format = v => String(v),
}: { title: string; segments: DonutSeg[]; format?: (v: number) => string }) {
  const R = 58, STROKE = 18, CIRC = 2 * Math.PI * R
  const vis = segments.filter(s => s.value > 0)
  const sum = vis.reduce((s, x) => s + x.value, 0)

  let cursor = 0
  const arcs = sum > 0 ? vis.map((s, i) => {
    const frac = s.value / sum
    const length = frac * CIRC
    const offset = -cursor
    cursor += frac * CIRC
    return { ...s, id: `rd-${i}`, length, offset }
  }) : []

  return (
    <div className="animate-fade-up flex flex-col">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">{title}</h2>
      <Card className="border border-gray-200/80 bg-white">
        <CardContent className="p-3 sm:p-4 h-[300px] flex flex-col">
          {sum <= 0 ? (
            <div className="flex-1 grid place-items-center text-sm text-gray-400 text-center px-3">Aucune donnée à répartir pour le moment.</div>
          ) : (
            <div className="flex items-center gap-4 h-full">
              <div className="relative w-[132px] h-[132px] flex-shrink-0">
                <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90">
                  <circle cx="100" cy="100" r={R} fill="none" stroke="#F1EEE9" strokeWidth={STROKE} />
                  {arcs.map(a => (
                    <circle key={a.id} cx="100" cy="100" r={R} fill="none" stroke={a.color} strokeWidth={STROKE}
                      strokeDasharray={`${a.length} ${CIRC - a.length}`} strokeDashoffset={a.offset} />
                  ))}
                </svg>
                <div className="absolute inset-0 grid place-items-center text-center pointer-events-none">
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-gray-400">Total</p>
                    <p className="font-bold text-marine text-[13px] tabular-nums leading-tight">{format(sum)}</p>
                  </div>
                </div>
              </div>
              <div className="flex-1 min-w-0 space-y-2.5">
                {vis.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                    <span className="text-gray-600 truncate flex-1">{s.label}</span>
                    <b className="font-semibold text-marine tabular-nums flex-shrink-0">{format(s.value)}</b>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
