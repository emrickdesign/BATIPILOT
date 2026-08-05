import type { ProjectStatus, ClientStatus } from '@/types'

// Quand un chantier change de statut, on fait avancer la carte du client sur le
// board Clients vers la phase correspondante (via phasesBefore, jamais en arrière).
export const projectToClientPhase: Partial<Record<ProjectStatus, ClientStatus>> = {
  planifie: 'chantier_en_cours',
  en_cours: 'chantier_en_cours',
  en_pause: 'chantier_en_cours',
  termine: 'facture_a_envoyer',
  a_facturer: 'facture_a_envoyer',
  facture: 'facture_envoyee',
  paye: 'paye',
}

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

// Avancement TEMPOREL d'un chantier : part du temps écoulé entre début et fin prévus.
// Renvoie null si une date manque (calcul impossible). Avant le début = 0 %, après la fin = 100 %.
export function timeProgress(start?: string | null, end?: string | null, now: Date = new Date()): number | null {
  if (!start || !end) return null
  const s = new Date(start).getTime(), e = new Date(end).getTime()
  if (Number.isNaN(s) || Number.isNaN(e)) return null
  const t = now.getTime()
  if (e <= s) return t >= e ? 100 : 0
  return Math.max(0, Math.min(100, Math.round(((t - s) / (e - s)) * 100)))
}

// Statuts « clôturés » : le chantier est déjà validé/terminé, plus rien à valider.
export const CLOSED_STATUSES: ProjectStatus[] = ['termine', 'a_facturer', 'facture', 'paye', 'archive']

// Un chantier est « à valider » quand sa date de fin prévue est atteinte/dépassée
// alors qu'il n'est pas encore clôturé : l'artisan doit confirmer « terminé » ou replanifier.
export function isAValider(status: ProjectStatus, end?: string | null, today: string = new Date().toISOString().split('T')[0]): boolean {
  return !!end && end <= today && !CLOSED_STATUSES.includes(status)
}

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
