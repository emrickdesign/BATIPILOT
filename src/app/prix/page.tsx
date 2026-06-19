import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Plus, Tag, Upload } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import SeedPrixButton from './SeedPrixButton'

export default async function PrixPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: categories } = await supabase
    .from('price_categories')
    .select('*, price_items(*)')
    .eq('user_id', user.id)
    .order('sort_order')

  const unitLabels: Record<string, string> = {
    m2: 'm²', ml: 'ml', u: 'unité', forfait: 'forfait', h: 'heure', j: 'jour', piece: 'pièce'
  }

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
        <div className="space-y-4">
          {categories?.map(cat => {
            const items = (cat.price_items as any[]).filter(i => i.is_active)
            if (!items.length) return null
            return (
              <Card key={cat.id}>
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-base font-semibold text-gray-800">{cat.name}</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="space-y-2">
                    {items.map((item: any) => (
                      <Link key={item.id} href={`/prix/${item.id}`}>
                        <div className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
                          <div className="min-w-0">
                            <span className="text-sm font-medium text-gray-900">{item.name}</span>
                            {item.description && (
                              <span className="text-xs text-gray-400 ml-2">{item.description}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                            <Badge variant="outline" className="text-xs">
                              {unitLabels[item.unit] || item.unit}
                            </Badge>
                            <span className="font-semibold text-sm text-gray-900 w-20 text-right">
                              {item.unit_price_ht > 0 ? formatCurrency(item.unit_price_ht) : '—'}
                            </span>
                            <span className="text-xs text-gray-400">HT</span>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
