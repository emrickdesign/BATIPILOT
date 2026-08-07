import type { User } from '@supabase/supabase-js'
import type { createClient } from '@/lib/supabase/server'

type ServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * Nom d'affichage de l'artisan (propriétaire du compte) : nom + prénom saisis à
 * l'inscription. Ordre : profils.full_name → user_metadata.full_name → part locale de l'email.
 * Utilisé pour signer les notes/messages côté admin (pas le préfixe email).
 */
export async function getOwnerName(supabase: ServerClient, user: User): Promise<string> {
  const { data } = await supabase.from('profiles').select('full_name').eq('id', user.id).single()
  const fromProfile = (data?.full_name as string | undefined)?.trim()
  const fromMeta = (user.user_metadata?.full_name as string | undefined)?.trim()
  return fromProfile || fromMeta || user.email?.split('@')[0] || 'Admin'
}
