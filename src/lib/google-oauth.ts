// Credentials OAuth de l'application BatiPilot (une seule app pour tous les
// utilisateurs) : l'artisan n'a plus rien à créer dans Google Cloud, il clique.
//
// Historique : chaque utilisateur devait fournir son propre client_id/secret,
// ce qui contournait la validation Google mais rendait la connexion inutilisable
// pour un non-développeur. On garde un repli sur ces credentials par-utilisateur
// pour ne pas casser les connexions déjà établies : un refresh_token ne peut être
// rafraîchi qu'avec le client qui l'a émis.

export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ''
export const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || ''

/** L'app BatiPilot est-elle configurée côté serveur ? */
export function hasAppCredentials(): boolean {
  return !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET)
}

/**
 * URI de retour OAuth — DOIT être identique à l'octet près entre la demande
 * d'autorisation et l'échange du code, et être déclarée dans la console Google.
 *
 * Dérivée de l'origine de la requête : c'est la valeur observée comme correcte
 * en production (Google reçoit bien https://batipilot-orpin.vercel.app/...).
 * On n'utilise PAS NEXT_PUBLIC_APP_URL ici : cette variable sert aux relances
 * et une valeur périmée casserait silencieusement la connexion Gmail.
 * Conséquence : chaque alias/port depuis lequel on se connecte doit être
 * déclaré dans la console Google.
 */
export function googleRedirectUri(origin: string): string {
  return `${origin.replace(/\/+$/, '')}/api/auth/gmail/callback`
}

/** Credentials à utiliser : ceux de la connexion (ancien système) sinon ceux de l'app. */
export function resolveCredentials(conn?: { client_id?: string | null; client_secret?: string | null } | null) {
  const clientId = conn?.client_id || GOOGLE_CLIENT_ID
  const clientSecret = conn?.client_secret || GOOGLE_CLIENT_SECRET
  return { clientId, clientSecret, ok: !!(clientId && clientSecret) }
}
