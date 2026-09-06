// Garde-fous des endpoints de l'assistant : plafond de taille d'entrée + rate-limit
// par utilisateur (protège la clé Anthropic serveur d'une amplification de coût).

import type { SupabaseClient } from '@supabase/supabase-js'

export const MAX_MSG_CHARS = 2000    // une question vocale tient largement dedans
export const MAX_MESSAGES = 8
export const MAX_BODY_BYTES = 100_000

// Ne garde que des messages valides, tronque chaque contenu, borne le nombre.
export function sanitizeMessages(incoming: unknown): { role: 'user' | 'assistant'; content: string }[] {
  if (!Array.isArray(incoming)) return []
  const out: { role: 'user' | 'assistant'; content: string }[] = []
  for (const m of incoming) {
    if (!m || typeof m !== 'object') continue
    const role = (m as { role?: unknown }).role
    const content = (m as { content?: unknown }).content
    if ((role === 'user' || role === 'assistant') && typeof content === 'string' && content.trim()) {
      out.push({ role, content: content.slice(0, MAX_MSG_CHARS) })
    }
  }
  return out.slice(-MAX_MESSAGES)
}

// true si l'utilisateur est sous la limite (et enregistre l'appel). false = à bloquer (429).
// Utilise le service client (server-only) ; la table a la RLS active sans policy.
export async function withinRateLimit(service: SupabaseClient, userId: string, max: number, windowMs = 60_000): Promise<boolean> {
  const since = new Date(Date.now() - windowMs).toISOString()
  const { count } = await service.from('assistant_calls')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId).gte('created_at', since)
  if ((count || 0) >= max) return false
  await service.from('assistant_calls').insert({ user_id: userId })
  // Purge opportuniste des vieux enregistrements (non bloquant).
  void service.from('assistant_calls').delete().lt('created_at', new Date(Date.now() - 3_600_000).toISOString())
  return true
}
