// Credentials OAuth de l'application TonPilote (une seule app pour tous les
// utilisateurs) : l'artisan n'a plus rien à créer dans Google Cloud, il clique.
//
// Historique : chaque utilisateur devait fournir son propre client_id/secret,
// ce qui contournait la validation Google mais rendait la connexion inutilisable
// pour un non-développeur. On garde un repli sur ces credentials par-utilisateur
// pour ne pas casser les connexions déjà établies : un refresh_token ne peut être
// rafraîchi qu'avec le client qui l'a émis.

export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ''
export const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || ''

/** L'app TonPilote est-elle configurée côté serveur ? */
export function hasAppCredentials(): boolean {
  return !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET)
}

/**
 * Origine canonique SANS « www ». Le domaine redirige tonpilote.com → www
 * (config Vercel), donc l'app tourne sur www.tonpilote.com et enverrait un
 * redirect_uri en www. On force la forme SANS www pour n'avoir qu'UNE seule URI
 * à déclarer dans la console Google (https://tonpilote.com/...), identique entre
 * la demande d'autorisation et l'échange du code. (localhost et alias sans www
 * restent inchangés.)
 */
function canonicalOrigin(origin: string): string {
  return origin.replace(/\/+$/, '').replace(/^(https?:\/\/)www\./i, '$1')
}

/**
 * URI de retour OAuth — DOIT être identique à l'octet près entre la demande
 * d'autorisation et l'échange du code, et être déclarée dans la console Google.
 * Toujours sans www (cf. canonicalOrigin).
 */
export function googleRedirectUri(origin: string): string {
  return `${canonicalOrigin(origin)}/api/auth/gmail/callback`
}

/** URI de retour OAuth pour Google Business Profile (avis). À déclarer dans la console. */
export function gbpRedirectUri(origin: string): string {
  return `${canonicalOrigin(origin)}/api/auth/gbp/callback`
}

/** Credentials à utiliser : ceux de la connexion (ancien système) sinon ceux de l'app. */
export function resolveCredentials(conn?: { client_id?: string | null; client_secret?: string | null } | null) {
  const clientId = conn?.client_id || GOOGLE_CLIENT_ID
  const clientSecret = conn?.client_secret || GOOGLE_CLIENT_SECRET
  return { clientId, clientSecret, ok: !!(clientId && clientSecret) }
}
