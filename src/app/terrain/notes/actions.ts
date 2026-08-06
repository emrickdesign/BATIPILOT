'use server'

import { getEmployeeSession } from '@/lib/employeeSession'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'

/**
 * Un salarié ajoute une note sur un chantier. Service-role (pas d'auth.uid()),
 * sécurisé par la session PIN : on n'écrit que chez CE propriétaire (user_id),
 * sur un de SES chantiers, en signant avec l'employee_id du salarié.
 */
export async function addTerrainNote(projectId: string, body: string) {
  const session = await getEmployeeSession()
  if (!session) throw new Error('Session salarié requise')
  const text = body.trim()
  if (!projectId || !text) throw new Error('Chantier et note requis')

  const service = createServiceClient()
  const { data: proj } = await service.from('projects').select('id').eq('id', projectId).eq('user_id', session.userId).single()
  if (!proj) throw new Error('Chantier introuvable')

  const { data: emp } = await service.from('employees').select('full_name').eq('id', session.employeeId).eq('user_id', session.userId).single()

  const { error } = await service.from('notes').insert({
    user_id: session.userId,
    project_id: projectId,
    author_employee_id: session.employeeId,
    author_name: emp?.full_name || 'Salarié',
    body: text,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/terrain/notes')
}

/** Un salarié supprime UNE de SES propres notes. */
export async function deleteTerrainNote(noteId: string) {
  const session = await getEmployeeSession()
  if (!session) throw new Error('Session salarié requise')
  const service = createServiceClient()
  const { error } = await service.from('notes').delete()
    .eq('id', noteId).eq('user_id', session.userId).eq('author_employee_id', session.employeeId)
  if (error) throw new Error(error.message)
  revalidatePath('/terrain/notes')
}
