import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft, HardHat } from 'lucide-react'
import { Suspense } from 'react'
import ChantierForm from '../ChantierForm'
import { FormPageTitle } from '@/components/ui/form-section'
import { entityColors } from '@/lib/entityColors'

export default function NouveauChantierPage() {
  return (
    <div className="space-y-4 max-w-2xl">
      <Link href="/chantiers">
        <Button variant="ghost" size="sm" className="gap-1 -ml-2">
          <ArrowLeft className="w-4 h-4" /> Retour
        </Button>
      </Link>
      <FormPageTitle icon={HardHat} color={entityColors.chantier} title="Nouveau chantier" />
      <Suspense>
        <ChantierForm />
      </Suspense>
    </div>
  )
}
