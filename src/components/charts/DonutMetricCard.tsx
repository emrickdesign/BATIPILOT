import { Card, CardContent } from '@/components/ui/card'

export type DonutSegment = { label: string; value: number; color: string }

type Props = {
  title: string
  subtitle?: string
  total: string
  centerLabel?: string
  segments: DonutSegment[]
  emptyMessage?: string
}

const R = 78
const STROKE = 22
const CIRC = 2 * Math.PI * R
const GAP = CIRC * 0.012 // léger espace entre les segments

export default function DonutMetricCard({ title, subtitle, total, centerLabel = 'Total', segments, emptyMessage }: Props) {
  const sum = segments.reduce((s, seg) => s + Math.max(seg.value, 0), 0)

  let cursor = 0
  const arcs = sum > 0
    ? segments
      .filter(s => s.value > 0)
      .map(s => {
        const length = Math.max((s.value / sum) * CIRC - GAP, 0)
        const offset = -cursor
        cursor += (s.value / sum) * CIRC
        return { ...s, length, offset }
      })
    : []

  return (
    <Card className="border-0 bg-surface-dark text-surface-dark-foreground shadow-[var(--shadow-lg)]">
      <CardContent className="p-5 md:p-6">
        <div className="mb-5">
          <h3 className="font-heading font-semibold text-white">{title}</h3>
          {subtitle && <p className="text-sm text-surface-dark-muted mt-0.5">{subtitle}</p>}
        </div>

        {sum <= 0 ? (
          <div className="h-[220px] grid place-items-center text-center px-4">
            <p className="text-sm text-surface-dark-muted">{emptyMessage || 'Aucune donnée pour le moment.'}</p>
          </div>
        ) : (
          <>
            <div className="relative mx-auto w-[200px] h-[200px]">
              <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90">
                <circle cx="100" cy="100" r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={STROKE} />
                {arcs.map((a, i) => (
                  <circle
                    key={i}
                    cx="100" cy="100" r={R}
                    fill="none"
                    stroke={a.color}
                    strokeWidth={STROKE}
                    strokeLinecap="round"
                    strokeDasharray={`${a.length} ${CIRC - a.length}`}
                    strokeDashoffset={a.offset}
                    style={{ filter: `drop-shadow(0 0 7px ${a.color}99)` }}
                  />
                ))}
              </svg>
              <div className="absolute inset-0 grid place-items-center text-center">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-surface-dark-muted">{centerLabel}</p>
                  <p className="text-2xl font-bold text-white leading-tight mt-0.5">{total}</p>
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-2.5">
              {segments.filter(s => s.value > 0).map((s, i) => (
                <div key={i} className="flex items-center gap-2.5 text-sm">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                  <span className="text-surface-dark-muted flex-1 truncate">{s.label}</span>
                  <span className="font-semibold text-white">{Math.round((s.value / sum) * 100)}%</span>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
