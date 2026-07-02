import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft, UserPlus } from 'lucide-react'
import { Suspense } from 'react'
import ClientForm from '../ClientForm'
import { FormPageTitle } from '@/components/ui/form-section'
import { entityColors } from '@/lib/entityColors'

export default function NouveauClientPage() {
  return (
    <div className="space-y-4 max-w-2xl">
      <Link href="/clients">
        <Button variant="ghost" size="sm" className="gap-1 -ml-2">
          <ArrowLeft className="w-4 h-4" /> Retour
        </Button>
      </Link>
      <FormPageTitle icon={UserPlus} color={entityColors.client} title="Nouveau client" />
      <Suspense>
        <ClientForm />
      </Suspense>
    </div>
  )
}
