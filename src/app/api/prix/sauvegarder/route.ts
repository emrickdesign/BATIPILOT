import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

  const { categories } = await req.json()

  let totalItems = 0
  for (const cat of categories) {
    if (!cat.items?.length) continue

    // Créer ou trouver la catégorie
    let catId: string
    const { data: existing } = await supabase
      .from('price_categories')
      .select('id')
      .eq('user_id', user.id)
      .eq('name', cat.name)
      .single()

    if (existing) {
      catId = existing.id
    } else {
      const { data: newCat } = await supabase
        .from('price_categories')
        .insert({ user_id: user.id, name: cat.name, sort_order: 99 })
        .select('id')
        .single()
      catId = newCat!.id
    }

    // Insérer les prestations
    const items = cat.items.map((item: any) => ({
      user_id: user.id,
      category_id: catId,
      name: item.name,
      description: item.description || null,
      unit: item.unit || 'u',
      unit_price_ht: parseFloat(item.price) || 0,
      vat_rate: 10,
      supply_included: true,
      labor_included: true,
      is_active: true,
    }))

    await supabase.from('price_items').insert(items)
    totalItems += items.length
  }

  return NextResponse.json({ success: true, count: totalItems })
}
