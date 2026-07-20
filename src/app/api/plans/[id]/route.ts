import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { normalizeResult, moTotal, recomputeTotaux } from '@/lib/plans'

/** Enregistre le chiffrage modifié par l'artisan (lignes, main-d'œuvre, marge cible). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

    const body = await req.json().catch(() => null)
    if (!body?.result) return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })

    // On ne fait pas confiance au client : on renormalise et on recalcule les totaux
    const result = normalizeResult(body.result)
    result.totaux = recomputeTotaux(result.lignes, moTotal(result.main_oeuvre))

    const { error } = await supabase.from('plan_analyses').update({
      result,
      total_ht: result.totaux.total_ht,
      marge_eur: result.totaux.marge_estimee_eur,
      marge_pct: result.totaux.marge_estimee_pct,
      nb_lignes: result.lignes.length,
    }).eq('id', id).eq('user_id', user.id)

    if (error) {
      console.error('[plans] PATCH échoué :', error.message)
      return NextResponse.json({ error: 'Enregistrement impossible' }, { status: 500 })
    }
    return NextResponse.json({ success: true, totaux: result.totaux })
  } catch (err) {
    console.error('[plans] PATCH erreur :', err)
    return NextResponse.json({ error: (err as Error)?.message || 'Erreur serveur' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

  // Le plan stocké part avec l'analyse pour ne pas laisser de fichier orphelin
  const { data: a } = await supabase.from('plan_analyses')
    .select('plan_upload_id, plan_uploads(storage_path)')
    .eq('id', id).eq('user_id', user.id).maybeSingle()

  const path = (a?.plan_uploads as unknown as { storage_path?: string } | null)?.storage_path
  if (path) await supabase.storage.from('documents').remove([path])

  await supabase.from('plan_analyses').delete().eq('id', id).eq('user_id', user.id)
  if (a?.plan_upload_id) await supabase.from('plan_uploads').delete().eq('id', a.plan_upload_id).eq('user_id', user.id)

  return NextResponse.json({ success: true })
}
