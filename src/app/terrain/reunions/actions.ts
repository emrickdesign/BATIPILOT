'use server'

import { getEmployeeSession } from '@/lib/employeeSession'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'

/**
 * Un salarié marque SON action de réunion comme faite / à faire.
 * Sécurité : on ne fait jamais confiance à l'appelant — on vérifie la session PIN
 * (getEmployeeSession) et on n'update que les actions de CE salarié (employee_id)
 * chez CE propriétaire (user_id). Service-role car les salariés n'ont pas d'auth.uid().
 */
export async function markActionDone(actionId: string, done: boolean) {
  const session = await getEmployeeSession()
  if (!session) throw new Error('Session salarié requise')

  const service = createServiceClient()
  const { error } = await service
    .from('meeting_actions')
    .update({ status: done ? 'done' : 'todo', done_at: done ? new Date().toISOString() : null })
    .eq('id', actionId)
    .eq('user_id', session.userId)
    .eq('employee_id', session.employeeId)

  if (error) throw new Error(error.message)
  revalidatePath('/terrain/reunions')
}

/** Marque comme lues les notifications du salarié courant (à l'ouverture de son onglet). */
export async function markMyNotificationsRead() {
  const session = await getEmployeeSession()
  if (!session) return
  const service = createServiceClient()
  await service
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', session.userId)
    .eq('employee_id', session.employeeId)
    .is('read_at', null)
}
