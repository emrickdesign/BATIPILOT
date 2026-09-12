// Tarif TonPilote — dégressif par salarié. 1er mois offert dans tous les cas.
//
//  - Dirigeant seul (0 salarié)  : SOLO_PRICE / mois.
//  - Avec équipe                 : TEAM_BASE + prix de chaque salarié.
//    Le prix par salarié BAISSE par palier (plus l'équipe est grande,
//    moins chaque salarié coûte) : voir SEAT_TIERS.
//
// Modèle décidé par Emrick (12/09/2026). Tous les nombres sont ici : un seul
// endroit à changer pour ajuster la grille.

export const SOLO_PRICE = 149     // €/mois — dirigeant seul, sans équipe
export const TEAM_BASE = 229      // €/mois — socle dès qu'il y a une équipe

// Prix du salarié selon son rang (1 = premier salarié). Paliers dégressifs.
const SEAT_TIERS: { upTo: number; unit: number }[] = [
  { upTo: 3, unit: 12 },   // salariés 1 à 3 : 12 €
  { upTo: 6, unit: 10 },   // salariés 4 à 6 : 10 €
  { upTo: Infinity, unit: 8 }, // à partir du 7e : 8 €
]
export const SEAT_TOP_UNIT = SEAT_TIERS[0].unit // prix « plein » d'un salarié (sans dégressivité)

/** Prix d'un salarié selon son rang (1-based). */
export function seatUnitPrice(rank: number): number {
  return (SEAT_TIERS.find(t => rank <= t.upTo) ?? SEAT_TIERS[SEAT_TIERS.length - 1]).unit
}

/** Prix mensuel total (hors 1er mois offert) pour `employees` salariés. */
export function monthlyPrice(employees: number): number {
  const n = Math.max(0, Math.floor(employees))
  if (n === 0) return SOLO_PRICE
  let total = TEAM_BASE
  for (let i = 1; i <= n; i++) total += seatUnitPrice(i)
  return total
}

export interface SeatLine { rank: number; unit: number; discounted: boolean }
/** Détail salarié par salarié (pour l'affichage du récap). */
export function seatLines(employees: number): SeatLine[] {
  const lines: SeatLine[] = []
  for (let i = 1; i <= Math.max(0, Math.floor(employees)); i++) {
    const unit = seatUnitPrice(i)
    lines.push({ rank: i, unit, discounted: unit < SEAT_TOP_UNIT })
  }
  return lines
}

/** Économie mensuelle apportée par la dégressivité (vs tous les salariés au tarif plein). */
export function monthlySavings(employees: number): number {
  const n = Math.max(0, Math.floor(employees))
  if (n === 0) return 0
  const full = n * SEAT_TOP_UNIT
  const actual = seatLines(n).reduce((s, l) => s + l.unit, 0)
  return full - actual
}

/** Résumé prêt pour l'UI. */
export function pricingSummary(employees: number) {
  const n = Math.max(0, Math.floor(employees))
  return {
    employees: n,
    hasTeam: n > 0,
    base: n > 0 ? TEAM_BASE : SOLO_PRICE,
    seats: seatLines(n),
    seatsTotal: seatLines(n).reduce((s, l) => s + l.unit, 0),
    total: monthlyPrice(n),
    savings: monthlySavings(n),
  }
}

/** Bucket `company_size` dérivé de l'effectif (compat rétro). */
export function sizeBucket(employees: number): string {
  const n = Math.max(0, Math.floor(employees))
  if (n === 0) return 'solo'
  if (n <= 3) return '1_3'
  if (n <= 10) return '4_10'
  if (n <= 50) return '11_50'
  return '50_plus'
}

export const eur = (n: number) => `${n} €`
