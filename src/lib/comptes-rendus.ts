// Helpers du compte-rendu de chantier hebdomadaire.

// Lundi de la semaine contenant `d` (00:00 local).
export function mondayOf(d: Date) {
  const x = new Date(d)
  const offset = (x.getDay() + 6) % 7
  x.setDate(x.getDate() - offset)
  x.setHours(0, 0, 0, 0)
  return x
}

export function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x }

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

export function fmtDayLong(iso: string) {
  const dt = new Date(iso + 'T00:00:00')
  return `${['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'][dt.getDay()]} ${dt.getDate()} ${MONTHS[dt.getMonth()]}`
}

export function fmtRange(fromIso: string, toIso: string) {
  const a = new Date(fromIso + 'T00:00:00'), b = new Date(toIso + 'T00:00:00')
  const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()
  if (sameMonth) return `du ${a.getDate()} au ${b.getDate()} ${MONTHS[b.getMonth()]} ${b.getFullYear()}`
  return `du ${a.getDate()} ${MONTHS[a.getMonth()]} au ${b.getDate()} ${MONTHS[b.getMonth()]} ${b.getFullYear()}`
}

// Corps d'email pré-rempli pour le client (l'artisan relit avant d'envoyer).
export function buildClientEmail(opts: {
  clientName?: string | null
  companyName?: string | null
  projectTitle: string
  rangeLabel: string
  progress?: number | null
  highlights: string[]
}) {
  const hello = opts.clientName ? `Bonjour ${opts.clientName},` : 'Bonjour,'
  const prog = opts.progress != null ? `\n\nAvancement global estimé : ${opts.progress} %.` : ''
  const points = opts.highlights.length
    ? '\n\nCette semaine :\n' + opts.highlights.map(h => `• ${h}`).join('\n')
    : ''
  const sign = opts.companyName ? `\n\nBien cordialement,\n${opts.companyName}` : '\n\nBien cordialement,'
  return `${hello}

Voici le point d'avancement de votre chantier « ${opts.projectTitle} » pour la période ${opts.rangeLabel}.${prog}${points}

Les photos du chantier sont jointes à cet e-mail.

Je reste à votre disposition pour toute question.${sign}`
}
