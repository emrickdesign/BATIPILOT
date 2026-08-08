import { cn } from '@/lib/utils'

// Enveloppe de page avec fond crème pointillé (pleine largeur, derrière le contenu).
// Annule le padding du <main> (-m-4/-m-8) puis le réapplique autour du contenu.
export default function DottedPage({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="relative -m-4 md:-m-8 min-h-screen">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundColor: '#FDF3EC',
          backgroundImage: 'radial-gradient(rgba(138,75,36,0.07) 1px, transparent 1px), linear-gradient(160deg, #FFFDFB 0%, #FBEDE4 100%)',
          backgroundSize: '18px 18px, 100% 100%',
        }}
      />
      <div className={cn('relative p-4 md:p-8', className)}>{children}</div>
    </div>
  )
}
