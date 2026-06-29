'use client'

import { useState } from 'react'
import { formatCurrency } from '@/lib/utils'

type Serie = { label: string; value: number }
type PeriodKey = '7j' | 'mois' | 'trimestre' | 'annee'
type Props = { series: Record<PeriodKey, Serie[]> }

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: '7j', label: '7 jours' },
  { key: 'mois', label: 'Mois' },
  { key: 'trimestre', label: 'Trimestre' },
  { key: 'annee', label: 'Année' },
]

// Courbe lissée (Catmull-Rom → Bézier cubique)
function smooth(pts: readonly (readonly [number, number])[]): string {
  if (pts.length < 2) return pts.length ? `M${pts[0][0]},${pts[0][1]}` : ''
  return pts.reduce((d, p, i) => {
    if (i === 0) return `M${p[0].toFixed(1)},${p[1].toFixed(1)}`
    const p0 = pts[i - 2] || pts[i - 1]
    const p1 = pts[i - 1]
    const p3 = pts[i + 1] || p
    const t = 0.18
    const c1x = p1[0] + (p[0] - p0[0]) * t, c1y = p1[1] + (p[1] - p0[1]) * t
    const c2x = p[0] - (p3[0] - p1[0]) * t, c2y = p[1] - (p3[1] - p1[1]) * t
    return `${d} C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p[0].toFixed(1)},${p[1].toFixed(1)}`
  }, '')
}

export default function EncaissementsChart({ series }: Props) {
  const [period, setPeriod] = useState<PeriodKey>('mois')
  const data = series[period]
  const total = data.reduce((s, d) => s + d.value, 0)

  const W = 640, H = 150, P = 8
  const max = Math.max(...data.map(d => d.value), 1)
  const pts = data.map((d, i) => {
    const x = P + (i * (W - 2 * P)) / Math.max(data.length - 1, 1)
    const y = H - P - (d.value / max) * (H - 2 * P - 10)
    return [x, y] as const
  })
  const line = smooth(pts)
  const area = pts.length ? `${line} L${pts[pts.length - 1][0].toFixed(1)},${H} L${pts[0][0].toFixed(1)},${H} Z` : ''

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <p className="text-sm text-gray-500 font-medium">Encaissé sur la période</p>
          <p className="text-[26px] font-bold text-marine leading-none mt-1">{formatCurrency(total)}</p>
        </div>
        <div className="flex gap-1 p-1 rounded-full bg-gray-100">
          {PERIODS.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
                period === p.key ? 'bg-white text-primary shadow-[var(--shadow-xs)]' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {total === 0 ? (
        <div className="h-[150px] grid place-items-center text-sm text-gray-400 text-center px-4">
          Aucun encaissement sur cette période — il s&apos;affichera ici dès qu&apos;une facture sera payée.
        </div>
      ) : (
        <svg viewBox={`0 0 ${W} ${H + 18}`} className="w-full">
          <defs>
            <linearGradient id="encFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.20" />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#encFill)" />
          <path d={line} fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="3.5" fill="#fff" stroke="var(--primary)" strokeWidth="2" />)}
          {data.map((d, i) => (
            <text key={i} x={pts[i][0]} y={H + 14} textAnchor="middle" fontSize="11" fill="#94A3B8">{d.label}</text>
          ))}
        </svg>
      )}
    </div>
  )
}
