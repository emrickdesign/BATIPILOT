// Relances de devis pilotées par la DURÉE DE VALIDITÉ (et non plus un délai fixe).
// 2 paliers proportionnels : à 50 % puis à 80 % de la fenêtre de validité.
// Ex : validité 30 j → relance à 15 j puis à 24 j. Fallback [7, 14] j si pas de
// fenêtre de validité connue (anciens devis sans valid_until).

const DAY = 86_400_000

export const RELANCE_FRACTIONS = [0.5, 0.8]

/** Jours restants avant la fin de validité (négatif si expiré). null si inconnu. */
export function daysUntilExpiry(validUntil?: string | null, now: Date = new Date()): number | null {
  if (!validUntil) return null
  const today = new Date(now.toISOString().split('T')[0]).getTime()
  return Math.round((new Date(validUntil).getTime() - today) / DAY)
}

/** Nombre de jours de validité (issue_date → valid_until). null si inconnu / invalide. */
export function validityWindowDays(issueDate?: string | null, validUntil?: string | null): number | null {
  if (!issueDate || !validUntil) return null
  const d = Math.round((new Date(validUntil).getTime() - new Date(issueDate).getTime()) / DAY)
  return d > 0 ? d : null
}

/** Seuils (en jours après l'émission) auxquels relancer, indexés par nb de relances déjà faites. */
export function relanceThresholds(issueDate?: string | null, validUntil?: string | null): number[] {
  const w = validityWindowDays(issueDate, validUntil)
  if (!w) return [7, 14]
  return RELANCE_FRACTIONS.map(f => Math.max(1, Math.round(f * w)))
}

/**
 * Un devis « envoyé » est-il à relancer maintenant ? (compteurs & listes).
 * Non relancé si expiré (validité dépassée → renouvellement, pas relance).
 * `reminded_at` sert d'indicateur de palier (0 si jamais relancé, 1 sinon).
 */
/**
 * Phrase de relance personnalisée selon où l'on en est de la validité :
 * fin proche (≤3 j) → « la fin approche », mi-parcours → « à mi-chemin », sinon rappel simple.
 */
export function relanceCopy(issueDate?: string | null, validUntil?: string | null, now: Date = new Date()): string {
  if (!validUntil) return 'Je me permets de revenir vers vous concernant votre devis.'
  const today = new Date(now.toISOString().split('T')[0]).getTime()
  const end = new Date(validUntil).getTime()
  const dateFr = new Date(validUntil).toLocaleDateString('fr-FR')
  const daysLeft = Math.round((end - today) / DAY)
  if (daysLeft < 0) return `Votre devis a expiré le ${dateFr}.`
  if (daysLeft === 0) return `La validité de votre devis se termine aujourd'hui (${dateFr}).`
  if (daysLeft <= 3) return `La fin de validité de votre devis approche : il reste ${daysLeft} jour${daysLeft > 1 ? 's' : ''}, jusqu'au ${dateFr}.`
  const w = validityWindowDays(issueDate, validUntil)
  if (w && issueDate) {
    const elapsed = Math.round((today - new Date(issueDate).getTime()) / DAY)
    if (elapsed >= w * 0.5) return `Nous sommes à mi-parcours de la période de validité de votre devis (valable jusqu'au ${dateFr}).`
  }
  return `Petit rappel : votre devis reste valable jusqu'au ${dateFr}.`
}

export function isRelanceDue(
  q: { status?: string; issue_date?: string | null; valid_until?: string | null; reminded_at?: string | null },
  now: Date = new Date(),
): boolean {
  if (q.status && q.status !== 'envoye') return false
  if (!q.issue_date) return false
  const today = now.toISOString().split('T')[0]
  if (q.valid_until && q.valid_until < today) return false // expiré
  const th = relanceThresholds(q.issue_date, q.valid_until)
  const threshold = th[q.reminded_at ? 1 : 0]
  if (threshold == null) return false
  const days = Math.floor((now.getTime() - new Date(q.issue_date).getTime()) / DAY)
  return days >= threshold
}
