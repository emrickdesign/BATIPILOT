import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

/** Renommer une catégorie, ou la réordonner. */
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

    const { id, name, sort_order } = await req.json()
    if (!id) return NextResponse.json({ error: 'id manquant' }, { status: 400 })

    const updates: Record<string, unknown> = {}
    if (name !== undefined) {
      const n = String(name).trim()
      if (!n) return NextResponse.json({ error: 'Le nom ne peut pas être vide' }, { status: 400 })
      updates.name = n
    }
    if (sort_order !== undefined) updates.sort_order = Number(sort_order) || 0
    if (!Object.keys(updates).length) return NextResponse.json({ error: 'Rien à modifier' }, { status: 400 })

    const { error } = await supabase.from('price_categories')
      .update(updates).eq('id', id).eq('user_id', user.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error)?.message || 'Erreur serveur' }, { status: 500 })
  }
}

/**
 * Supprimer une catégorie.
 * Par défaut on refuse si elle contient des prestations : une suppression
 * silencieuse de 40 prix serait irrattrapable. Deux issues explicites :
 * `move_to` déplace le contenu, `force` supprime tout.
 */
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

    const { id, move_to, force } = await req.json()
    if (!id) return NextResponse.json({ error: 'id manquant' }, { status: 400 })

    const { count } = await supabase.from('price_items')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', id).eq('user_id', user.id)

    const nb = count || 0
    if (nb > 0 && !move_to && !force) {
      return NextResponse.json({ error: 'not_empty', count: nb }, { status: 409 })
    }

    if (nb > 0 && move_to) {
      const { error: mvErr } = await supabase.from('price_items')
        .update({ category_id: move_to }).eq('category_id', id).eq('user_id', user.id)
      if (mvErr) return NextResponse.json({ error: mvErr.message }, { status: 500 })
    }

    const { error } = await supabase.from('price_categories')
      .delete().eq('id', id).eq('user_id', user.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true, moved: nb > 0 && !!move_to ? nb : 0 })
  } catch (err) {
    return NextResponse.json({ error: (err as Error)?.message || 'Erreur serveur' }, { status: 500 })
  }
}
