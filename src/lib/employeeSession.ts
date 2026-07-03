import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/service'

export const EMPLOYEE_SESSION_COOKIE = 'bp_employee_session'

export async function createEmployeeSession(employeeId: string, ownerUserId: string) {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('employee_sessions')
    .insert({ employee_id: employeeId, user_id: ownerUserId })
    .select('token')
    .single()
  if (error || !data) throw new Error('Impossible de créer la session')

  const jar = await cookies()
  jar.set(EMPLOYEE_SESSION_COOKIE, data.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  })
  return data.token as string
}

/** Résout la session salarié courante (null si absente/expirée). Ne fait confiance qu'au token opaque, jamais à un paramètre d'URL. */
export async function getEmployeeSession(): Promise<{ employeeId: string; userId: string } | null> {
  const jar = await cookies()
  const token = jar.get(EMPLOYEE_SESSION_COOKIE)?.value
  if (!token) return null

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('employee_sessions')
    .select('employee_id, user_id, expires_at')
    .eq('token', token)
    .single()
  if (!data || new Date(data.expires_at) < new Date()) return null
  return { employeeId: data.employee_id, userId: data.user_id }
}

export async function clearEmployeeSession() {
  const jar = await cookies()
  const token = jar.get(EMPLOYEE_SESSION_COOKIE)?.value
  if (token) {
    const supabase = createServiceClient()
    await supabase.from('employee_sessions').delete().eq('token', token)
  }
  jar.delete(EMPLOYEE_SESSION_COOKIE)
}
