import { Card, CardContent } from '@/components/ui/card'

export type DonutSegment = { label: string; value: number; color: string }

type Props = {
  title: string
  subtitle?: string
  total: string
  centerLabel?: string
  segments: DonutSegment[]
  emptyMessage?: string
  /** Formate la valeur affichée dans la pastille autour de l'anneau. Défaut : nombre brut. */
  format?: (v: number) => string
}

const R = 58
const STROKE = 17
const CIRC = 2 * Math.PI * R
const GAP = 0 // pas d'écart : les couleurs se touchent

function hexToRgb(hex: string) {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}
function lighten(hex: string, amt: number) {
  const { r, g, b } = hexToRgb(hex)
  const m = (c: number) => Math.round(c + (255 - c) * amt)
  return `rgb(${m(r)}, ${m(g)}, ${m(b)})`
}

export default function DonutMetricCard({
  title, subtitle, total, centerLabel = 'Total', segments, emptyMessage, format = v => String(v),
}: Props) {
  const vis = segments.filter(s => s.value > 0)
  const sum = vis.reduce((s, seg) => s + seg.value, 0)

  let cursor = 0
  const arcs = sum > 0
    ? vis.map((s, i) => {
      const frac = s.value / sum
      const length = Math.max(frac * CIRC - GAP, 0)
      const offset = -cursor
      cursor += frac * CIRC
      return { ...s, id: `dseg-${i}`, length, offset }
    })
    : []

  return (
    <Card className="relative h-full overflow-hidden border border-[#EBD9CE] bg-gradient-to-br from-[#FFF7F2] to-[#FCEBE1] shadow-[var(--shadow-md)]">
      {/* motifs : pointillés + halo corail */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: [
            'radial-gradient(60% 55% at 100% 0%, rgba(224,103,76,0.12), transparent 60%)',
            'radial-gradient(rgba(138,75,36,0.10) 1px, transparent 1px)',
          ].join(', '),
          backgroundSize: '100% 100%, 15px 15px',
        }}
      />
      <CardContent className="relative p-5 md:p-6">
        <div className="mb-4">
          <h3 className="font-heading font-semibold text-marine">{title}</h3>
          {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
        </div>

        {sum <= 0 ? (
          <div className="h-[200px] grid place-items-center text-center px-4">
            <p className="text-sm text-gray-400">{emptyMessage || 'Aucune donnée pour le moment.'}</p>
          </div>
        ) : (
          <>
            <div className="relative mx-auto w-full max-w-[248px] aspect-square">
              <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90">
                <defs>
                  {arcs.map(a => (
                    <linearGradient key={a.id} id={a.id} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={lighten(a.color, 0.28)} />
                      <stop offset="100%" stopColor={a.color} />
                    </linearGradient>
                  ))}
                </defs>
                <circle cx="100" cy="100" r={R} fill="none" stroke="rgba(138,75,36,0.10)" strokeWidth={STROKE} />
                {arcs.map(a => (
                  <circle
                    key={a.id}
                    cx="100" cy="100" r={R}
                    fill="none"
                    stroke={`url(#${a.id})`}
                    strokeWidth={STROKE}
                    strokeLinecap="butt"
                    strokeDasharray={`${a.length} ${CIRC - a.length}`}
                    strokeDashoffset={a.offset}
                  />
                ))}
              </svg>

              {/* centre — la police rétrécit quand le total s'allonge (ne touche plus l'anneau) */}
              <div className="absolute inset-0 grid place-items-center text-center pointer-events-none">
                <div className="max-w-[58%]">
                  <p className="text-[10px] uppercase tracking-wider text-gray-400">{centerLabel}</p>
                  <p
                    className="font-bold text-marine leading-tight mt-0.5 tabular-nums whitespace-nowrap"
                    style={{
                      fontSize:
                        total.length <= 4 ? 26
                          : total.length <= 7 ? 22
                            : total.length <= 10 ? 18
                              : total.length <= 13 ? 15 : 13,
                    }}
                  >
                    {total}
                  </p>
                </div>
              </div>

            </div>

            {/* légende avec chiffres */}
            <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-2.5">
              {vis.map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-[12.5px] min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                  <span className="truncate">
                    <b className="font-bold text-marine tabular-nums">{format(s.value)}</b>{' '}
                    <span className="text-gray-600">{s.label}</span>
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
