import { cn } from '@/lib/utils'

// Carte de marque : fond crème dégradé + motif de points orangés + halo corail.
// Style partagé par les cases de Relances (sections + donut de répartition).
export default function DottedCard({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('relative overflow-hidden rounded-xl border border-[#EBD9CE] bg-gradient-to-br from-[#FFF7F2] to-[#FCEBE1] shadow-[var(--shadow-md)]', className)}>
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
      <div className="relative h-full">{children}</div>
    </div>
  )
}
