'use client'

import { useState } from 'react'
import { formatCurrency } from '@/lib/utils'

type Serie = { label: string; value: number }
type PeriodData = { current: Serie[]; previous: Serie[] }
type PeriodKey = '7j' | 'mois' | 'trimestre' | 'annee'
type Props = { series: Record<PeriodKey, PeriodData> }

const PERIODS: { key: PeriodKey; label: string; prev: string }[] = [
  { key: '7j', label: '7 jours', prev: '7 jours précédents' },
  { key: 'mois', label: 'Mois', prev: 'Mois précédent' },
  { key: 'trimestre', label: 'Trimestre', prev: 'Trimestre précédent' },
  { key: 'annee', label: 'Année', prev: 'Année précédente' },
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

// Arrondi « propre » supérieur pour l'échelle Y (15234 → 20000, 3200 → 5000…)
function niceCeil(x: number): number {
  if (x <= 0) return 1
  const p = Math.pow(10, Math.floor(Math.log10(x)))
  const n = x / p
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10
  return nice * p
}

// Format compact pour l'axe Y : 15000 → 15k, 400000 → 400k, 1200000 → 1,2M
function fmtAxis(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(v % 1_000_000 ? 1 : 0).replace('.', ',')}M`
  if (v >= 1_000) return `${Math.round(v / 1_000)}k`
  return String(Math.round(v))
}

export default function EncaissementsChart({ series }: Props) {
  const [period, setPeriod] = useState<PeriodKey>('mois')
  const cur = series[period].current
  const prev = series[period].previous
  const total = cur.reduce((s, d) => s + d.value, 0)
  const prevTotal = prev.reduce((s, d) => s + d.value, 0)
  const meta = PERIODS.find(p => p.key === period)!

  // Delta vs période précédente
  const deltaPct = prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : null

  // Géométrie (marges : gauche pour l'axe Y, bas pour les mois)
  const W = 640, H = 168
  const ML = 42, MR = 12, MT = 12, MB = 22
  const plotW = W - ML - MR, plotH = H - MT - MB

  const rawMax = Math.max(...cur.map(d => d.value), ...prev.map(d => d.value), 1)
  const niceMax = niceCeil(rawMax)
  const ticks = [0, 0.25, 0.5, 0.75, 1]

  const project = (arr: Serie[]) =>
    arr.map((d, i) => {
      const x = ML + (i * plotW) / Math.max(arr.length - 1, 1)
      const y = MT + plotH - (d.value / niceMax) * plotH
      return [x, y] as const
    })
  const ptsCur = project(cur)
  const ptsPrev = project(prev)
  const lineCur = smooth(ptsCur)
  const areaCur = ptsCur.length ? `${lineCur} L${ptsCur[ptsCur.length - 1][0].toFixed(1)},${MT + plotH} L${ptsCur[0][0].toFixed(1)},${MT + plotH} Z` : ''
  const linePrev = smooth(ptsPrev)

  // Labels X clairsemés si la série est longue (évite le chevauchement)
  const n = cur.length
  const step = n <= 8 ? 1 : Math.ceil(n / 7)

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <p className="text-sm text-gray-500 font-medium">Encaissé sur la période</p>
          <div className="flex items-baseline gap-2 mt-1">
            <p className="text-[26px] font-bold text-marine leading-none">{formatCurrency(total)}</p>
            {deltaPct !== null && (
              <span className={`text-[13px] font-semibold ${deltaPct >= 0 ? 'text-[#4C6F18]' : 'text-[#C0392B]'}`}>
                {deltaPct >= 0 ? '+' : ''}{deltaPct}%
              </span>
            )}
          </div>
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

      {/* Légende */}
      <div className="flex items-center gap-4 mb-1 text-[12px] text-gray-500">
        <span className="flex items-center gap-1.5">
          <svg width="18" height="8" aria-hidden><line x1="0" y1="4" x2="18" y2="4" stroke="var(--primary)" strokeWidth="2.75" strokeLinecap="round" /></svg>
          Période actuelle
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="18" height="8" aria-hidden><line x1="0" y1="4" x2="18" y2="4" stroke="#94A3B8" strokeWidth="2" strokeDasharray="4 3" strokeLinecap="round" /></svg>
          {meta.prev}
        </span>
      </div>

      {total === 0 && prevTotal === 0 ? (
        <div className="h-[150px] grid place-items-center text-sm text-gray-400 text-center px-4">
          Aucun encaissement sur cette période — il s&apos;affichera ici dès qu&apos;une facture sera payée.
        </div>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
          <defs>
            <linearGradient id="encFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.32" />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* Grille + échelle Y */}
          {ticks.map(f => {
            const y = MT + plotH * (1 - f)
            return (
              <g key={f}>
                <line x1={ML} x2={W - MR} y1={y} y2={y} stroke="#E2E8F0" strokeWidth="1" strokeDasharray={f === 0 ? undefined : '3 4'} />
                <text x={ML - 8} y={y + 3.5} textAnchor="end" fontSize="10" fill="#94A3B8">{fmtAxis(niceMax * f)}</text>
              </g>
            )
          })}
          {/* Courbe période précédente (pointillés) */}
          <path d={linePrev} fill="none" stroke="#94A3B8" strokeWidth="2" strokeDasharray="5 5" strokeLinecap="round" strokeLinejoin="round" />
          {/* Courbe actuelle */}
          <path d={areaCur} fill="url(#encFill)" />
          <path d={lineCur} fill="none" stroke="var(--primary)" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" />
          {/* Labels X (ancrage aux bords pour éviter la coupe) */}
          {cur.map((d, i) => {
            if (i % step !== 0 && i !== n - 1) return null
            const anchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'
            return <text key={i} x={ptsCur[i][0]} y={H - 6} textAnchor={anchor} fontSize="11" fill="#94A3B8">{d.label}</text>
          })}
        </svg>
      )}
    </div>
  )
}
