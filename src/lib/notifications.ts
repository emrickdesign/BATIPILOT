import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Crée une notification in-app.
 * - employee_id null  → destinée à l'admin (propriétaire).
 * - employee_id défini → destinée à ce salarié (lue via service-role côté /terrain).
 * - dedup_key → idempotence (les rappels quotidiens ne créent qu'une notif par clé).
 * Passer le client Supabase adéquat (server admin ou service-role selon le contexte).
 */
export async function notify(
  db: SupabaseClient,
  n: {
    user_id: string
    employee_id?: string | null
    kind?: string
    title: string
    body?: string | null
    href?: string | null
    meeting_id?: string | null
    dedup_key?: string | null
  },
) {
  const row = {
    user_id: n.user_id,
    employee_id: n.employee_id ?? null,
    kind: n.kind ?? 'info',
    title: n.title,
    body: n.body ?? null,
    href: n.href ?? null,
    meeting_id: n.meeting_id ?? null,
    dedup_key: n.dedup_key ?? null,
  }
  try {
    if (row.dedup_key) {
      await db.from('notifications').upsert(row, { onConflict: 'user_id,dedup_key', ignoreDuplicates: true })
    } else {
      await db.from('notifications').insert(row)
    }
  } catch {
    // une notif ratée ne doit jamais casser l'action métier
  }
}
