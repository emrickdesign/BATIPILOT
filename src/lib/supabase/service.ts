import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * Client Supabase avec la clé service_role — contourne la RLS.
 * SERVEUR UNIQUEMENT (route handlers / server actions). Ne jamais importer côté client.
 * Sert à faire agir les salariés (pas de compte auth.users) après vérification
 * manuelle de leur session PIN (cf src/lib/employeeSession.ts).
 */
export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
