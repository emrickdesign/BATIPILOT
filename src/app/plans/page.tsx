import { Card, CardContent } from '@/components/ui/card'
import { Search } from 'lucide-react'

export default function PlansPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Analyser un plan</h1>
      <Card>
        <CardContent className="py-12 text-center">
          <Search className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="font-medium text-gray-700">Module en cours de développement</p>
          <p className="text-sm text-gray-500 mt-1">
            Bientôt disponible : importez un plan PDF et l&apos;IA vous aide à calculer les surfaces et préparer votre devis
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
