// Corps d'état (métiers) — clé de personnalisation de l'app, capturée à l'onboarding
// et stockée sur companies.trade / companies.secondary_trades.
//
// Chaque métier référence les catégories de la base de prix « type »
// (voir src/app/api/seed-prix/route.ts) qui le concernent : le seed n'installe
// alors que les prestations pertinentes pour l'artisan, au lieu de tout déverser.

export interface Trade {
  id: string
  label: string
  emoji: string
  /** Catégories du seed pertinentes pour ce métier (noms exacts des catégories du seed). */
  categories: string[]
}

// Catégories toujours utiles quel que soit le métier.
export const COMMON_CATEGORIES = [
  'Préparation / Protection',
  "Main-d'œuvre / Déplacement",
  'Divers',
]

export const TRADES: Trade[] = [
  {
    id: 'peinture',
    label: 'Peinture / Décoration',
    emoji: '🎨',
    categories: ['Peinture', 'Placo / Cloisons', 'Revêtements de sol'],
  },
  {
    id: 'platrerie_placo',
    label: 'Plâtrerie / Placo',
    emoji: '🧱',
    categories: ['Placo / Cloisons', 'Isolation', 'Peinture'],
  },
  {
    id: 'carrelage',
    label: 'Carrelage / Faïence',
    emoji: '🔲',
    categories: ['Carrelage', 'Revêtements de sol', 'Maçonnerie'],
  },
  {
    id: 'plomberie',
    label: 'Plomberie / Chauffage',
    emoji: '🚿',
    categories: ['Plomberie', 'Carrelage'],
  },
  {
    id: 'electricite',
    label: 'Électricité',
    emoji: '💡',
    categories: ['Électricité'],
  },
  {
    id: 'menuiserie',
    label: 'Menuiserie (bois / alu / PVC)',
    emoji: '🚪',
    categories: ['Menuiserie'],
  },
  {
    id: 'maconnerie',
    label: 'Maçonnerie / Gros œuvre',
    emoji: '🧰',
    categories: ['Démolition', 'Maçonnerie', 'Isolation'],
  },
  {
    id: 'sols',
    label: 'Revêtements de sol',
    emoji: '🪵',
    categories: ['Revêtements de sol', 'Carrelage', 'Démolition'],
  },
  {
    id: 'isolation',
    label: 'Isolation / ITE',
    emoji: '🌡️',
    categories: ['Isolation', 'Placo / Cloisons'],
  },
  {
    id: 'salle_de_bain',
    label: 'Salle de bain (plomberie + carrelage)',
    emoji: '🛁',
    categories: ['Plomberie', 'Carrelage', 'Placo / Cloisons', 'Démolition'],
  },
  {
    id: 'renovation_generale',
    label: 'Rénovation générale / Multiservices',
    emoji: '🏠',
    // Tous corps d'état : ne filtre rien (comportement historique).
    categories: [
      'Démolition', 'Peinture', 'Placo / Cloisons', 'Isolation', 'Carrelage',
      'Revêtements de sol', 'Plomberie', 'Électricité', 'Menuiserie', 'Maçonnerie',
    ],
  },
  {
    id: 'autre',
    label: 'Autre corps d’état',
    emoji: '🔧',
    // Fallback : base complète.
    categories: [
      'Démolition', 'Peinture', 'Placo / Cloisons', 'Isolation', 'Carrelage',
      'Revêtements de sol', 'Plomberie', 'Électricité', 'Menuiserie', 'Maçonnerie',
    ],
  },
]

export function getTrade(id?: string | null): Trade | undefined {
  if (!id) return undefined
  return TRADES.find(t => t.id === id)
}

export function tradeLabel(id?: string | null): string {
  return getTrade(id)?.label || ''
}

/**
 * Union des catégories du seed pour un ensemble de métiers (principal + secondaires),
 * enrichie des catégories communes. Retourne toujours au moins les communes.
 */
export function categoriesForTrades(tradeIds: (string | null | undefined)[]): string[] {
  const set = new Set<string>(COMMON_CATEGORIES)
  for (const id of tradeIds) {
    const trade = getTrade(id)
    if (trade) trade.categories.forEach(c => set.add(c))
  }
  return Array.from(set)
}
