import type { ClientStatus } from '@/types'

export const clientStatusLabels: Record<ClientStatus, string> = {
  nouveau: 'Nouveau',
  infos_a_recuperer: 'Infos à récupérer',
  devis_a_faire: 'Devis à faire',
  devis_envoye: 'Devis envoyé',
  devis_accepte: 'Devis accepté',
  devis_refuse: 'Devis refusé',
  chantier_a_planifier: 'À planifier',
  chantier_en_cours: 'Chantier en cours',
  facture_a_envoyer: 'Facture à envoyer',
  facture_envoyee: 'Facture envoyée',
  paye: 'Payé',
  termine: 'Terminé',
  archive: 'Archivé',
}

export const clientStatusColors: Record<ClientStatus, string> = {
  nouveau: 'bg-gray-100 text-gray-500',
  infos_a_recuperer: 'bg-[#FBEED6] text-[#8A5A08]',
  devis_a_faire: 'bg-[#FBEED6] text-[#8A5A08]',
  devis_envoye: 'bg-[#FCE7DE] text-[#C14E33]',
  devis_accepte: 'bg-[#E9F2DB] text-[#3F7A2E]',
  devis_refuse: 'bg-[#FBE0DA] text-[#C0392B]',
  chantier_a_planifier: 'bg-[#FBEED6] text-[#8A5A08]',
  chantier_en_cours: 'bg-[#FCE7DE] text-[#C14E33]',
  facture_a_envoyer: 'bg-[#F3E5D6] text-[#8A4B24]',
  facture_envoyee: 'bg-[#F3E5D6] text-[#8A4B24]',
  paye: 'bg-[#E9F2DB] text-[#3F7A2E]',
  termine: 'bg-gray-100 text-gray-500',
  archive: 'bg-gray-100 text-gray-400',
}

// Un prospect = lead pas encore converti (avant le devis accepté).
// Au-delà (devis accepté → chantier → facturé → payé) = client actif.
export const prospectStatuses: ClientStatus[] = [
  'nouveau', 'infos_a_recuperer', 'devis_a_faire', 'devis_envoye', 'devis_refuse',
]

export const prospectStatusOrder: ClientStatus[] = [
  'nouveau', 'infos_a_recuperer', 'devis_a_faire', 'devis_envoye', 'devis_refuse',
]

// Statuts proposés pour faire avancer un prospect (jusqu'à la conversion en client)
export const prospectPipelineStatuses: ClientStatus[] = [
  'nouveau', 'infos_a_recuperer', 'devis_a_faire', 'devis_envoye', 'devis_accepte', 'devis_refuse', 'archive',
]

// Statuts d'un client converti (phase chantier → facturation), pour le Kanban Clients
export const clientPhaseStatuses: ClientStatus[] = [
  'devis_accepte', 'chantier_a_planifier', 'chantier_en_cours', 'facture_a_envoyer', 'facture_envoyee', 'paye', 'termine', 'archive',
]

export function isProspect(status: ClientStatus): boolean {
  return prospectStatuses.includes(status)
}

// Ordre linéaire des phases d'un client sur le board Clients (À planifier → Payé).
// Sert à ne faire AVANCER une carte que vers l'avant quand une action se produit
// ailleurs (statut chantier, facture envoyée/payée…), jamais à la reculer.
export const clientPhaseOrder: ClientStatus[] = [
  'devis_accepte', 'chantier_a_planifier', 'chantier_en_cours', 'facture_a_envoyer', 'facture_envoyee', 'paye',
]

// Statuts « en amont » d'une phase cible : à utiliser dans un `.in('status', …)`
// pour n'appliquer la mise à jour que si le client est à une phase antérieure.
export function phasesBefore(target: ClientStatus): ClientStatus[] {
  const i = clientPhaseOrder.indexOf(target)
  return i <= 0 ? [] : clientPhaseOrder.slice(0, i)
}

export function clientDisplayName(c?: {
  type?: string; first_name?: string | null; last_name?: string | null; company_name?: string | null
} | null): string {
  if (!c) return 'Sans nom'
  if (c.type === 'professionnel' && c.company_name) return c.company_name
  return `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.company_name || 'Sans nom'
}
