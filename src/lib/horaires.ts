// Horaires de chantier : la pause déjeuner est décomptée du temps de travail.
// Journée type = 8h→17h, pause 12h→13h ⇒ 7 h travaillées.
export const BREAK_START = 12
export const BREAK_END = 13

/** Heures réellement travaillées entre `s` et `e`, pause déjeuner déduite. */
export function workedHours(s: number, e: number): number {
  const span = Math.max(0, e - s)
  const overlap = Math.max(0, Math.min(e, BREAK_END) - Math.max(s, BREAK_START))
  return Math.max(0, span - overlap)
}

/** « 8h–12h · 13h–17h » si la plage enjambe la pause, sinon « 8h–12h ». */
export function formatRange(s: number, e: number): string {
  if (s < BREAK_START && e > BREAK_END) return `${s}h–${BREAK_START}h · ${BREAK_END}h–${e}h`
  return `${s}h–${e}h`
}
