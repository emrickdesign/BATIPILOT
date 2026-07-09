import type { LucideIcon } from 'lucide-react'
import GaugeRing from './GaugeRing'

// Tons sémantiques chauds — carte KPI dégradée + glow coloré (ADN Potentieel)
export const STAT_TONES = {
  green: { fg: '#3F7A2E', chipA: '#6AA636', chipB: '#3F7A2E', tintA: '#E9F2DB', tintB: '#F6FAEF', glow: 'rgba(76,111,24,.22)', bd: '#DDE9C9' },
  coral: { fg: '#C14E33', chipA: '#F09A80', chipB: '#D0562F', tintA: '#FCE5DC', tintB: '#FEF5F0', glow: 'rgba(224,103,76,.26)', bd: '#F4D7CA' },
  amber: { fg: '#8A5A08', chipA: '#E2A536', chipB: '#C77D0E', tintA: '#FBEFD4', tintB: '#FEF9EE', glow: 'rgba(199,125,14,.22)', bd: '#F0E1C0' },
  terre: { fg: '#8A4B24', chipA: '#BC824F', chipB: '#8A4B24', tintA: '#F4E7D8', tintB: '#FBF5ED', glow: 'rgba(138,75,36,.20)', bd: '#EAD9C7' },
  blue: { fg: '#1F5FAE', chipA: '#5B95F8', chipB: '#2F6BE8', tintA: '#E3ECFB', tintB: '#F1F6FE', glow: 'rgba(47,107,232,.22)', bd: '#CFDDF6' },
  red: { fg: '#C0392B', chipA: '#E06A5A', chipB: '#C0392B', tintA: '#FBE0DA', tintB: '#FEF2EF', glow: 'rgba(192,57,43,.22)', bd: '#F1D2CB' },
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
  const deltaCls = delta?.dir === 'up' ? 'bg-[#E9F2DB] text-[#3F7A2E]'
    : delta?.dir === 'down' ? 'bg-[#FBE0DA] text-[#C0392B]' : 'bg-white/70 text-gray-500'
  return (
    <div
      className="group relative h-full min-h-[152px] overflow-hidden rounded-xl border p-4 transition-all duration-200 hover:-translate-y-1"
      style={{
        borderColor: t.bd,
        background: `linear-gradient(150deg, ${t.tintA} 0%, ${t.tintB} 58%, #ffffff 100%)`,
        boxShadow: `0 14px 32px -16px ${t.glow}`,
      }}
    >
      <div aria-hidden className="absolute -top-10 -right-8 w-36 h-36 rounded-full pointer-events-none opacity-90"
        style={{ background: `radial-gradient(circle, ${t.glow}, transparent 70%)` }} />
      <div className="relative">
        <div className="flex items-start justify-between mb-3">
          <span className="grid place-items-center w-9 h-9 rounded-lg text-white shadow-[0_4px_10px_-3px_rgba(40,25,10,.35)] flex-shrink-0"
            style={{ background: `linear-gradient(135deg, ${t.chipA}, ${t.chipB})` }}>
            <Icon className="w-[18px] h-[18px]" strokeWidth={2} />
          </span>
          {gauge !== undefined ? (
            <GaugeRing value={gauge} size={42} strokeWidth={5} trackColor="rgba(40,25,10,.10)" fillColor={t.chipB}>
              <span className="text-[10px] font-bold" style={{ color: t.fg }}>{gauge}%</span>
            </GaugeRing>
          ) : delta ? (
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full backdrop-blur-sm ${deltaCls}`}>{delta.text}</span>
          ) : null}
        </div>
        <div className="text-[26px] font-bold text-marine leading-none tracking-tight tabular-nums">{value}</div>
        <div className="text-[12.5px] text-gray-600 mt-1.5 font-medium">{label}</div>
        {sp ? (
          <div className="-mx-4 -mb-4 mt-3">
            <svg className="w-full h-14 block" viewBox="0 0 120 40" preserveAspectRatio="none" aria-hidden>
              <defs>
                <linearGradient id={uid} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor={t.chipB} stopOpacity="0.28" />
                  <stop offset="1" stopColor={t.chipB} stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={sp.area} fill={`url(#${uid})`} />
              <path d={sp.line} fill="none" stroke={t.chipB} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            </svg>
          </div>
        ) : note ? (
          <div className="text-[11px] text-gray-500 mt-2 leading-tight">{note}</div>
        ) : null}
      </div>
    </div>
  )
}
