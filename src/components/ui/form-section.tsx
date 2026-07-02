import type { LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/**
 * Section de formulaire avec icône colorée + titre. La couleur identifie le TYPE
 * d'entité créée (client=bleu, devis=violet, chantier=orange, salarié=teal...),
 * partagée par toutes les sections d'un même formulaire — pas une couleur par section.
 */
export function FormSection({
  icon: Icon, color, title, description, children, className,
}: {
  icon: LucideIcon; color: string; title: string; description?: string; children: React.ReactNode; className?: string
}) {
  return (
    <Card className={cn('border-0 shadow-[var(--shadow-sm)]', className)}>
      <CardContent className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <span className="grid place-items-center w-9 h-9 rounded-lg flex-shrink-0" style={{ backgroundColor: `${color}18`, color }}>
            <Icon className="w-[18px] h-[18px]" />
          </span>
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-marine leading-tight">{title}</h3>
            {description && <p className="text-xs text-gray-400 mt-0.5">{description}</p>}
          </div>
        </div>
        {children}
      </CardContent>
    </Card>
  )
}

/** Titre de page avec badge d'icône coloré — identité visuelle cohérente avec FormSection. */
export function FormPageTitle({ icon: Icon, color, title }: { icon: LucideIcon; color: string; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid place-items-center w-10 h-10 rounded-xl flex-shrink-0" style={{ backgroundColor: `${color}18`, color }}>
        <Icon className="w-5 h-5" />
      </span>
      <h1 className="text-2xl font-heading font-bold text-marine">{title}</h1>
    </div>
  )
}
