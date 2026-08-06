import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Transfère les visites de repérage VALIDÉES d'un client (pas encore rattachées à un
 * chantier) vers un chantier : photos → documents (album du chantier), notes → notes du
 * chantier. Marque ensuite la visite comme rattachée (project_id) pour ne pas la re-transférer.
 * Idempotent : ne prend que les visites status='valide' et project_id null.
 */
export async function transferClientVisitsToProject(
  supabase: SupabaseClient,
  userId: string,
  clientId: string,
  projectId: string,
): Promise<number> {
  const { data: visits } = await supabase.from('site_visits')
    .select('id, title, transcript')
    .eq('user_id', userId).eq('client_id', clientId).eq('status', 'valide').is('project_id', null)
  if (!visits?.length) return 0

  for (const v of visits as { id: string; title: string | null; transcript: string | null }[]) {
    const { data: photos } = await supabase.from('site_visit_photos')
      .select('storage_path, caption').eq('visit_id', v.id).eq('user_id', userId)
    if (photos?.length) {
      await supabase.from('documents').insert((photos as { storage_path: string; caption: string | null }[]).map(p => ({
        user_id: userId, project_id: projectId, client_id: clientId,
        name: p.caption || `Photo visite — ${v.title || ''}`.trim(), category: 'photo',
        storage_path: p.storage_path, file_type: 'image/jpeg',
      })))
    }
    const body = (v.transcript || '').trim()
    if (body) {
      await supabase.from('notes').insert({
        user_id: userId, project_id: projectId, author_employee_id: null,
        author_name: `Visite — ${v.title || 'repérage'}`, body,
      })
    }
    await supabase.from('site_visits').update({ project_id: projectId }).eq('id', v.id)
  }
  return visits.length
}
