'use server'

import { createServiceClient } from '@/lib/supabase/service'
import { createClient } from '@/lib/supabase/server'
import { verifyPin, hashPin } from '@/lib/pin'
import { createEmployeeSession, clearEmployeeSession, getEmployeeSession } from '@/lib/employeeSession'

const MAX_ATTEMPTS = 5
const LOCK_MINUTES = 15

export async function verifyEmployeePin(employeeId: string, pin: string) {
  const supabase = createServiceClient()
  const { data: emp } = await supabase
    .from('employees')
    .select('id, user_id, full_name, active, access_pin_hash, pin_failed_attempts, pin_locked_until')
    .eq('id', employeeId)
    .single()

  if (!emp || !emp.active) return { error: 'Salarié introuvable.' }
  if (!emp.access_pin_hash) return { error: "Aucun code PIN défini pour ce compte — demande à l'administrateur d'en créer un." }

  if (emp.pin_locked_until && new Date(emp.pin_locked_until) > new Date()) {
    const mins = Math.ceil((new Date(emp.pin_locked_until).getTime() - Date.now()) / 60000)
    return { error: `Trop de tentatives. Réessaie dans ${mins} min.` }
  }

  const ok = verifyPin(pin, emp.access_pin_hash)
  if (!ok) {
    const attempts = (emp.pin_failed_attempts || 0) + 1
    const locked = attempts >= MAX_ATTEMPTS
    await supabase.from('employees').update({
      pin_failed_attempts: locked ? 0 : attempts,
      pin_locked_until: locked ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null,
    }).eq('id', employeeId)
    return { error: locked ? `Trop de tentatives. Réessaie dans ${LOCK_MINUTES} min.` : 'Code incorrect.' }
  }

  await supabase.from('employees').update({ pin_failed_attempts: 0, pin_locked_until: null }).eq('id', employeeId)
  await createEmployeeSession(emp.id, emp.user_id)
  return { success: true, fullName: emp.full_name as string }
}

export async function logoutEmployee() {
  await clearEmployeeSession()
}

export async function currentEmployeeSession() {
  return getEmployeeSession()
}

/** Réservé à l'admin (appelé depuis Équipe) : définit ou change le code PIN d'un salarié. */
export async function setEmployeePin(employeeId: string, pin: string) {
  if (!/^\d{4,6}$/.test(pin)) return { error: 'Le code doit contenir 4 à 6 chiffres.' }

  // Vérifie que l'appelant est bien connecté ET propriétaire de ce salarié avant de toucher au service role.
  const authed = await createClient()
  const { data: { user } } = await authed.auth.getUser()
  if (!user) return { error: 'Non connecté.' }
  const { data: owned } = await authed.from('employees').select('id').eq('id', employeeId).eq('user_id', user.id).single()
  if (!owned) return { error: 'Salarié introuvable.' }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('employees')
    .update({ access_pin_hash: hashPin(pin), pin_failed_attempts: 0, pin_locked_until: null })
    .eq('id', employeeId)
  if (error) return { error: 'Erreur lors de l\'enregistrement.' }
  return { success: true }
}
