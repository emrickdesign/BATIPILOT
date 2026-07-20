import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Révision en masse des prix : le geste annuel de l'artisan.
 * `pct` s'applique au prix de vente ; `target` limite la portée à une catégorie.
 * On arrondit au centime et on ne touche jamais aux prestations sans prix
 * (0 × 1,05 = 0 : les faire passer dans la révision n'a aucun sens).
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

    const { pct, category_id, include_cost } = await req.json()
    const p = Number(pct)
    if (!Number.isFinite(p) || p === 0) return NextResponse.json({ error: 'Pourcentage invalide' }, { status: 400 })
    if (p < -90 || p > 200) return NextResponse.json({ error: 'Pourcentage hors limites' }, { status: 400 })

    let q = supabase.from('price_items')
      .select('id, unit_price_ht, supplier_cost')
      .eq('user_id', user.id).eq('is_active', true)
    if (category_id) q = q.eq('category_id', category_id)

    const { data: items, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const factor = 1 + p / 100
    const round2 = (n: number) => Math.round(n * 100) / 100
    const cibles = (items || []).filter(i => Number(i.unit_price_ht) > 0)

    if (cibles.length === 0) return NextResponse.json({ error: 'Aucun prix à réviser ici' }, { status: 400 })

    // Pas de bulk update natif : on applique ligne par ligne (volumes faibles)
    let done = 0
    for (const it of cibles) {
      const updates: Record<string, number> = { unit_price_ht: round2(Number(it.unit_price_ht) * factor) }
      if (include_cost && Number(it.supplier_cost) > 0) {
        updates.supplier_cost = round2(Number(it.supplier_cost) * factor)
      }
      const { error: uErr } = await supabase.from('price_items')
        .update(updates).eq('id', it.id).eq('user_id', user.id)
      if (!uErr) done++
    }

    return NextResponse.json({ success: true, count: done })
  } catch (err) {
    return NextResponse.json({ error: (err as Error)?.message || 'Erreur serveur' }, { status: 500 })
  }
}
