type Props = {
  value: number // 0-100
  size?: number
  strokeWidth?: number
  trackColor?: string
  fillColor?: string
  children?: React.ReactNode
}

export default function GaugeRing({ value, size = 72, strokeWidth = 8, trackColor = 'rgba(255,255,255,0.35)', fillColor = '#ffffff', children }: Props) {
  const pct = Math.max(0, Math.min(100, value))
  const r = (size - strokeWidth) / 2
  const circ = 2 * Math.PI * r
  const filled = (pct / 100) * circ

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke={fillColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circ - filled}`}
        />
      </svg>
      {children && <div className="absolute inset-0 grid place-items-center">{children}</div>}
    </div>
  )
}
