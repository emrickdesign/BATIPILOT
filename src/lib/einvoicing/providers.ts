// Catalogue des plateformes agréées proposées dans Paramètres › Facturation électronique.
// `connector` absent = pas encore branchée (affichée « Bientôt »). Partagé serveur / navigateur.

export type ConnectorId = 'pennylane' | 'afnor'

export interface Platform {
  id: string
  name: string
  monogram: string
  tint: string
  connector?: ConnectorId
  badge?: string
  description: string
}

export const PLATFORMS: Platform[] = [
  {
    id: 'pennylane', name: 'Pennylane', monogram: 'P', tint: '#0F766E', connector: 'pennylane', badge: 'Recommandé',
    description: 'Gratuit si vous l’utilisez uniquement comme plateforme agréée. Idéal si votre comptable travaille sur Pennylane.',
  },
  {
    id: 'afnor', name: 'Autre plateforme agréée', monogram: 'API', tint: '#334155', connector: 'afnor',
    description: 'Toute plateforme qui fournit l’API standard AFNOR (XP Z12-013) : collez les accès qu’elle vous donne.',
  },
  { id: 'superpdp', name: 'Super PDP', monogram: 'S', tint: '#4338CA', description: 'Plateforme indépendante à bas coût, pensée pour les logiciels.' },
  { id: 'sage', name: 'Sage', monogram: 'S', tint: '#15803D', description: 'Pour les entreprises équipées Sage (Batigest, Sage 50…).' },
  { id: 'qonto', name: 'Qonto', monogram: 'Q', tint: '#18181B', description: 'Si votre compte professionnel est chez Qonto.' },
  { id: 'iopole', name: 'Iopole', monogram: 'I', tint: '#0369A1', description: 'Plateforme utilisée par plusieurs logiciels du bâtiment.' },
]

export const connectorLabel = (id?: string | null, accountLabel?: string | null) =>
  id === 'pennylane' ? 'Pennylane' : id === 'afnor' ? accountLabel || 'votre plateforme agréée' : 'votre plateforme agréée'
