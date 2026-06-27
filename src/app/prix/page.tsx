import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, Tag, Upload } from 'lucide-react'
import SeedPrixButton from './SeedPrixButton'
import PrixList from './PrixList'

export default async function PrixPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: categories } = await supabase
    .from('price_categories')
    .select('*, price_items(*)')
    .eq('user_id', user.id)
    .order('sort_order')

  const isEmpty = !categories?.length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Mes prix</h1>
        <div className="flex gap-2">
          <Link href="/prix/importer">
            <Button variant="outline" className="h-10 gap-2">
              <Upload className="w-4 h-4" />
              Importer un document
            </Button>
          </Link>
          <Link href="/prix/nouveau">
            <Button className="h-10 gap-2">
              <Plus className="w-4 h-4" />
              Ajouter
            </Button>
          </Link>
        </div>
      </div>

      {isEmpty ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Tag className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="font-medium text-gray-700">Aucune prestation enregistrée</p>
            <p className="text-sm text-gray-500 mt-1 mb-6">
              Chargez une base de prix type pour démarrer, ou ajoutez vos prestations une par une
            </p>
            <SeedPrixButton />
          </CardContent>
        </Card>
      ) : (
        <PrixList initialCategories={(categories as any) || []} />
      )}
    </div>
  )
}
