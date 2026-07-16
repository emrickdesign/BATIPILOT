// Le coffre-fort de l'entreprise : ici on ne range QUE ce qui n'a pas déjà sa
// section (devis → /devis, factures → /factures, tickets → /depenses,
// plans → /chantiers, pièces des sous-traitants → /sous-traitants).
// Les catégories sont des données (table document_categories) : l'utilisateur
// peut en créer et en supprimer. Les familles, elles, sont fixes.

export type DocumentCategory = { id: string; name: string; family: string }

export const documentFamilies = [
  'Mon entreprise',
  'Assurances',
  'Comptable & fiscal',
  'Salariés',
  'Véhicules',
  'Certifications',
  'Autre',
] as const

export type DocumentFamily = typeof documentFamilies[number]

/** Durée légale de conservation, par famille (source : economie.gouv.fr / service-public). */
export const familyRetention: Record<string, string> = {
  'Mon entreprise': '5 ans après radiation',
  'Assurances': '10 ans après réception (décennale)',
  'Comptable & fiscal': '10 ans (6 ans pour les déclarations)',
  'Salariés': '5 ans',
  'Véhicules': 'durée de détention',
  'Certifications': 'durée de validité',
  'Autre': '—',
}

/** Fond de colonne (vue board) : un lavis de la couleur de la famille. */
export const familyTints: Record<string, string> = {
  'Mon entreprise': 'bg-indigo-50/60 border-indigo-100',
  'Assurances': 'bg-rose-50/60 border-rose-100',
  'Comptable & fiscal': 'bg-violet-50/60 border-violet-100',
  'Salariés': 'bg-emerald-50/60 border-emerald-100',
  'Véhicules': 'bg-cyan-50/60 border-cyan-100',
  'Certifications': 'bg-amber-50/60 border-amber-100',
  'Autre': 'bg-gray-50 border-gray-200',
}

export const familyColors: Record<string, string> = {
  'Mon entreprise': 'bg-indigo-100 text-indigo-700',
  'Assurances': 'bg-rose-100 text-rose-700',
  'Comptable & fiscal': 'bg-violet-100 text-violet-700',
  'Salariés': 'bg-emerald-100 text-emerald-700',
  'Véhicules': 'bg-cyan-100 text-cyan-700',
  'Certifications': 'bg-amber-100 text-amber-700',
  'Autre': 'bg-gray-100 text-gray-600',
}

/** Proposées à la création d'un compte / si l'utilisateur a tout supprimé. */
export const recommendedCategories: { name: string; family: DocumentFamily }[] = [
  { name: 'Kbis', family: 'Mon entreprise' },
  { name: 'Statuts', family: 'Mon entreprise' },
  { name: 'Assurance décennale', family: 'Assurances' },
  { name: 'RC Pro', family: 'Assurances' },
  { name: 'Bilan / liasse fiscale', family: 'Comptable & fiscal' },
  { name: 'Déclaration de TVA', family: 'Comptable & fiscal' },
  { name: 'Relevé bancaire', family: 'Comptable & fiscal' },
  { name: "Avis d'imposition / CFE", family: 'Comptable & fiscal' },
  { name: 'Contrat de travail', family: 'Salariés' },
  { name: 'Bulletin de paie', family: 'Salariés' },
  { name: 'Carte grise', family: 'Véhicules' },
  { name: 'Contrôle technique', family: 'Véhicules' },
  { name: 'Certification RGE', family: 'Certifications' },
  { name: 'Autre', family: 'Autre' },
]

export function formatFileSize(bytes?: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}
