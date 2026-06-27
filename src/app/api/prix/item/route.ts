import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

const ALLOWED_UNITS = ['m2', 'ml', 'u', 'forfait', 'h', 'j', 'piece']

// Modifier une prestation
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

    const { id, name, unit, unit_price_ht, description } = await req.json()
    if (!id) return NextResponse.json({ error: 'id manquant' }, { status: 400 })

    const updates: Record<string, any> = {}
    if (name !== undefined) updates.name = String(name).trim()
    if (description !== undefined) updates.description = description ? String(description).trim() : null
    if (unit !== undefined && ALLOWED_UNITS.includes(unit)) updates.unit = unit
    if (unit_price_ht !== undefined) updates.unit_price_ht = parseFloat(unit_price_ht) || 0

    if (!Object.keys(updates).length) return NextResponse.json({ error: 'Rien à modifier' }, { status: 400 })

    const { error } = await supabase
      .from('price_items')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Erreur serveur' }, { status: 500 })
  }
}

// Supprimer une prestation
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'id manquant' }, { status: 400 })

    const { error } = await supabase
      .from('price_items')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Erreur serveur' }, { status: 500 })
  }
}
