import type { LucideIcon } from 'lucide-react'
import GaugeRing from './GaugeRing'

// Tons sémantiques chauds — carte KPI PLEINE couleur, texte blanc (ADN Potentieel).
// base → deep = dégradé du fond ; glow = ombre colorée. Anciennes clés conservées
// (fg/chip/tint/bd) pour compat, mais le rendu n'utilise plus que base/deep/glow.
export const STAT_TONES = {
  green: { base: '#4E9331', deep: '#356420', glow: 'rgba(76,111,24,.35)', fg: '#3F7A2E', chipA: '#6AA636', chipB: '#3F7A2E', tintA: '#E9F2DB', tintB: '#F6FAEF', bd: '#DDE9C9' },
  coral: { base: '#D65A34', deep: '#B23F22', glow: 'rgba(224,103,76,.38)', fg: '#C14E33', chipA: '#F09A80', chipB: '#D0562F', tintA: '#FCE5DC', tintB: '#FEF5F0', bd: '#F4D7CA' },
  amber: { base: '#C9820F', deep: '#9A5E07', glow: 'rgba(199,125,14,.35)', fg: '#8A5A08', chipA: '#E2A536', chipB: '#C77D0E', tintA: '#FBEFD4', tintB: '#FEF9EE', bd: '#F0E1C0' },
  terre: { base: '#96542A', deep: '#6E3A1B', glow: 'rgba(138,75,36,.34)', fg: '#8A4B24', chipA: '#BC824F', chipB: '#8A4B24', tintA: '#F4E7D8', tintB: '#FBF5ED', bd: '#EAD9C7' },
  blue: { base: '#2F6BE8', deep: '#1E56A0', glow: 'rgba(47,107,232,.35)', fg: '#1F5FAE', chipA: '#5B95F8', chipB: '#2F6BE8', tintA: '#E3ECFB', tintB: '#F1F6FE', bd: '#CFDDF6' },
  red: { base: '#CA4133', deep: '#A02A1F', glow: 'rgba(192,57,43,.35)', fg: '#C0392B', chipA: '#E06A5A', chipB: '#C0392B', tintA: '#FBE0DA', tintB: '#FEF2EF', bd: '#F1D2CB' },
} as const
export type StatTone = keyof typeof STAT_TONES

// Courbe lissée (Catmull-Rom → Bézier) pour un mini-sparkline arrondi
export function sparkPath(vals: number[], w = 120, h = 40, pad = 5) {
  if (vals.length < 2) return null
  const max = Math.max(...vals), min = Math.min(...vals)
  const rng = max - min || 1
  const step = w / (vals.length - 1)
  const pts = vals.map((v, i) => [+(i * step).toFixed(1), +(h - pad - ((v - min) / rng) * (h - 2 * pad)).toFixed(1)] as const)
  let line = `M${pts[0][0]},${pts[0][1]}`
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 2] || pts[i - 1], p1 = pts[i - 1], p = pts[i], p3 = pts[i + 1] || p
    const t = 0.2
    const c1x = (p1[0] + (p[0] - p0[0]) * t).toFixed(1), c1y = (p1[1] + (p[1] - p0[1]) * t).toFixed(1)
    const c2x = (p[0] - (p3[0] - p1[0]) * t).toFixed(1), c2y = (p[1] - (p3[1] - p1[1]) * t).toFixed(1)
    line += ` C${c1x},${c1y} ${c2x},${c2y} ${p[0]},${p[1]}`
  }
  return { line, area: `${line} L${w},${h} L0,${h} Z` }
}

export type StatCardProps = {
  label: string
  value: string
  icon: LucideIcon
  tone: StatTone
  delta?: { text: string; dir: 'up' | 'down' | 'flat' }
  gauge?: number
  note?: string
  spark?: number[]
}

/** Carte KPI partagée : chip coloré + gros chiffre + jauge/badge + sparkline dégradé. */
export default function StatCard({ label, value, icon: Icon, tone, delta, gauge, note, spark }: StatCardProps) {
  const t = STAT_TONES[tone]
  const sp = spark ? sparkPath(spark, 120, 40, 5) : null
  const uid = `sp-${label.replace(/\W/g, '')}-${tone}`
  const deltaCls = delta?.dir === 'up' ? 'bg-white/25 text-white'
    : delta?.dir === 'down' ? 'bg-black/20 text-white' : 'bg-white/15 text-white'
  return (
    <div
      className="group relative h-full min-h-[152px] overflow-hidden rounded-xl p-4 text-white transition-all duration-200 hover:-translate-y-1"
      style={{
        background: `linear-gradient(140deg, ${t.base} 0%, ${t.deep} 100%)`,
        boxShadow: `0 16px 34px -16px ${t.glow}`,
      }}
    >
      {/* Lueur claire en haut-droite pour le relief */}
      <div aria-hidden className="absolute -top-12 -right-10 w-40 h-40 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,.22), transparent 70%)' }} />
      <div className="relative">
        <div className="flex items-start justify-between mb-3">
          <span className="grid place-items-center w-9 h-9 rounded-lg bg-white/20 text-white flex-shrink-0 backdrop-blur-sm">
            <Icon className="w-[18px] h-[18px]" strokeWidth={2} />
          </span>
          {gauge !== undefined ? (
            <GaugeRing value={gauge} size={42} strokeWidth={5} trackColor="rgba(255,255,255,.30)" fillColor="#ffffff">
              <span className="text-[10px] font-bold text-white">{gauge}%</span>
            </GaugeRing>
          ) : delta ? (
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full backdrop-blur-sm ${deltaCls}`}>{delta.text}</span>
          ) : null}
        </div>
        <div className="text-[26px] font-bold text-white leading-none tracking-tight tabular-nums">{value}</div>
        <div className="text-[12.5px] text-white/85 mt-1.5 font-medium">{label}</div>
        {sp ? (
          <div className="-mx-4 -mb-4 mt-3">
            <svg className="w-full h-14 block" viewBox="0 0 120 40" preserveAspectRatio="none" aria-hidden>
              <defs>
                <linearGradient id={uid} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="#ffffff" stopOpacity="0.35" />
                  <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={sp.area} fill={`url(#${uid})`} />
              <path d={sp.line} fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            </svg>
          </div>
        ) : note ? (
          <div className="text-[11px] text-white/70 mt-2 leading-tight">{note}</div>
        ) : null}
      </div>
    </div>
  )
}
