import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { Suspense } from 'react'
import ClientForm from '../ClientForm'

export default function NouveauClientPage() {
  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/clients">
          <Button variant="ghost" size="sm" className="gap-1">
            <ArrowLeft className="w-4 h-4" /> Retour
          </Button>
        </Link>
        <h1 className="text-2xl font-heading font-bold text-marine">Nouveau client</h1>
      </div>
      <Suspense>
        <ClientForm />
      </Suspense>
    </div>
  )
}
