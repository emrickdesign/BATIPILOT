import type { LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { FluidTexture } from '@/components/ui/fluid-texture'
import GaugeRing from '@/components/charts/GaugeRing'

type Props = {
  label: string
  value: string
  color: string
  icon?: LucideIcon
  subText?: string
  gauge?: number
  className?: string
}

export default function ColoredStatCard({ label, value, color, icon: Icon, subText, gauge, className }: Props) {
  return (
    <Card className={`card-interactive h-full relative border-0 text-white shadow-[var(--shadow-brand)] overflow-hidden ${className || ''}`} style={{ backgroundColor: color }}>
      <FluidTexture color={color} />
      <CardContent className="p-4 relative z-10">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-white/85">{label}</span>
          {gauge !== undefined ? (
            <GaugeRing value={gauge} size={44} strokeWidth={5}>
              <span className="text-[11px] font-bold text-white">{gauge}%</span>
            </GaugeRing>
          ) : Icon ? (
            <span className="grid place-items-center w-8 h-8 rounded-lg bg-white/20 text-white"><Icon className="w-4 h-4" /></span>
          ) : null}
        </div>
        <div className="text-[22px] md:text-[24px] font-bold mt-2 leading-none text-white">{value}</div>
        {subText && <div className="mt-2 text-xs font-medium text-white/85">{subText}</div>}
      </CardContent>
    </Card>
  )
}
