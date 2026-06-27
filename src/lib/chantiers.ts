import type { ProjectStatus } from '@/types'

export const projectStatusLabels: Record<ProjectStatus, string> = {
  demande_recue: 'Demande reçue',
  visite_a_prevoir: 'Visite à prévoir',
  devis_a_faire: 'Devis à faire',
  devis_envoye: 'Devis envoyé',
  devis_accepte: 'Devis accepté',
  a_planifier: 'À planifier',
  planifie: 'Planifié',
  en_cours: 'En cours',
  en_pause: 'En pause',
  termine: 'Terminé',
  a_facturer: 'À facturer',
  facture: 'Facturé',
  paye: 'Payé',
  archive: 'Archivé',
}

export const projectStatusColors: Record<ProjectStatus, string> = {
  demande_recue: 'bg-gray-100 text-gray-700',
  visite_a_prevoir: 'bg-cyan-100 text-cyan-700',
  devis_a_faire: 'bg-yellow-100 text-yellow-700',
  devis_envoye: 'bg-blue-100 text-blue-700',
  devis_accepte: 'bg-green-100 text-green-700',
  a_planifier: 'bg-amber-100 text-amber-700',
  planifie: 'bg-indigo-100 text-indigo-700',
  en_cours: 'bg-orange-100 text-orange-700',
  en_pause: 'bg-rose-100 text-rose-700',
  termine: 'bg-gray-100 text-gray-500',
  a_facturer: 'bg-purple-100 text-purple-700',
  facture: 'bg-violet-100 text-violet-700',
  paye: 'bg-green-100 text-green-800',
  archive: 'bg-gray-100 text-gray-400',
}

// Ordre logique d'affichage dans les filtres / sélecteurs
export const projectStatusOrder: ProjectStatus[] = [
  'demande_recue', 'visite_a_prevoir', 'devis_a_faire', 'devis_envoye', 'devis_accepte',
  'a_planifier', 'planifie', 'en_cours', 'en_pause', 'termine', 'a_facturer', 'facture', 'paye', 'archive',
]

// Types de chantier (issus du document, project_type est du texte libre en base)
export const projectTypeOptions: string[] = [
  'Rénovation complète', 'Rénovation appartement', 'Rénovation maison',
  'Salle de bain', 'Cuisine', 'Électricité', 'Plomberie', 'Peinture',
  'Placo', 'Carrelage', 'Sol', 'Toiture', 'Charpente', 'Façade',
  'Local professionnel', 'Love room', 'Appartement premium',
  'Entretien', 'Dépannage', 'Autre',
]

export function clientDisplayName(client?: {
  type?: string; first_name?: string | null; last_name?: string | null; company_name?: string | null
} | null): string {
  if (!client) return 'Sans client'
  if (client.type === 'professionnel' && client.company_name) return client.company_name
  const full = `${client.first_name || ''} ${client.last_name || ''}`.trim()
  return full || client.company_name || 'Sans nom'
}
