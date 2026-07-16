// Le coffre-fort de l'entreprise : ici on ne range QUE ce qui n'a pas déjà sa
// section (devis → /devis, factures → /factures, tickets → /depenses,
// plans → /chantiers, pièces des sous-traitants → /sous-traitants).
//
// Les familles sont organisées par RYTHME (ce qui ne bouge jamais / ce qui
// expire / ce qui revient chaque année ou chaque mois) plutôt que par type :
// c'est ce rythme qui dit quoi surveiller, et il justifie la date d'expiration.
// Les catégories, elles, sont des données (table document_categories) que
// l'utilisateur crée et supprime.

export type DocumentCategory = { id: string; name: string; family: string }

export const documentFamilies = [
  "L'entreprise",
  'Assurances & certifications',
  'À renouveler',
  'Tous les mois',
  'Clients & chantiers',
  'Autre',
] as const

export type DocumentFamily = typeof documentFamilies[number]

/** Le rythme de la famille — ce qu'on attend de toi. */
export const familyRhythm: Record<string, string> = {
  "L'entreprise": 'ne bouge pas',
  'Assurances & certifications': 'doit rester valide',
  'À renouveler': 'une fois par an',
  'Tous les mois': 'chaque mois',
  'Clients & chantiers': 'au fil des chantiers',
  'Autre': '',
}

/** Durée légale de conservation (source : economie.gouv.fr / service-public). */
export const familyRetention: Record<string, string> = {
  "L'entreprise": '5 ans après radiation',
  'Assurances & certifications': '10 ans après réception',
  'À renouveler': '6 à 10 ans',
  'Tous les mois': '10 ans (5 ans les relevés)',
  'Clients & chantiers': '10 ans',
  'Autre': '—',
}

/** Familles dont les documents ont une date de validité → on demande l'échéance. */
export const familiesWithExpiry: string[] = ['Assurances & certifications', 'À renouveler']

export function familyNeedsExpiry(family?: string | null): boolean {
  return !!family && familiesWithExpiry.includes(family)
}

/** Fond de colonne (vue board) : un lavis de la couleur de la famille. */
export const familyTints: Record<string, string> = {
  "L'entreprise": 'bg-indigo-50/60 border-indigo-100',
  'Assurances & certifications': 'bg-rose-50/60 border-rose-100',
  'À renouveler': 'bg-amber-50/60 border-amber-100',
  'Tous les mois': 'bg-violet-50/60 border-violet-100',
  'Clients & chantiers': 'bg-cyan-50/60 border-cyan-100',
  'Autre': 'bg-gray-50 border-gray-200',
}

export const familyColors: Record<string, string> = {
  "L'entreprise": 'bg-indigo-100 text-indigo-700',
  'Assurances & certifications': 'bg-rose-100 text-rose-700',
  'À renouveler': 'bg-amber-100 text-amber-700',
  'Tous les mois': 'bg-violet-100 text-violet-700',
  'Clients & chantiers': 'bg-cyan-100 text-cyan-700',
  'Autre': 'bg-gray-100 text-gray-600',
}

/** Proposées à la création d'un compte / si l'utilisateur a tout supprimé. */
export const recommendedCategories: { name: string; family: DocumentFamily }[] = [
  { name: 'Kbis', family: "L'entreprise" },
  { name: 'Statuts', family: "L'entreprise" },
  { name: 'Carte grise', family: "L'entreprise" },
  { name: 'Contrat de travail', family: "L'entreprise" },
  { name: 'Assurance décennale', family: 'Assurances & certifications' },
  { name: 'RC Pro', family: 'Assurances & certifications' },
  { name: 'Certification RGE', family: 'Assurances & certifications' },
  { name: 'Bilan / liasse fiscale', family: 'À renouveler' },
  { name: "Avis d'imposition / CFE", family: 'À renouveler' },
  { name: 'Contrôle technique', family: 'À renouveler' },
  { name: 'Déclaration de TVA', family: 'Tous les mois' },
  { name: 'Relevé bancaire', family: 'Tous les mois' },
  { name: 'Bulletin de paie', family: 'Tous les mois' },
  { name: 'PV de réception', family: 'Clients & chantiers' },
  { name: 'Document client', family: 'Clients & chantiers' },
  { name: 'Autre', family: 'Autre' },
]

/** Nb de jours avant expiration (négatif = déjà expiré), null si pas de date. */
export function daysUntil(date?: string | null): number | null {
  if (!date) return null
  const d = new Date(date)
  if (isNaN(d.getTime())) return null
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000)
}

export type ExpiryState = 'expire' | 'bientot' | 'valide' | null

/** « bientôt » = moins de 30 jours : le temps de relancer l'assureur. */
export function expiryState(date?: string | null): ExpiryState {
  const d = daysUntil(date)
  if (d === null) return null
  if (d < 0) return 'expire'
  if (d <= 30) return 'bientot'
  return 'valide'
}

export function formatFileSize(bytes?: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}
