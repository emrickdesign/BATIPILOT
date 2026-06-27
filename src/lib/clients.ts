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
  nouveau: 'bg-gray-100 text-gray-700',
  infos_a_recuperer: 'bg-cyan-100 text-cyan-700',
  devis_a_faire: 'bg-yellow-100 text-yellow-700',
  devis_envoye: 'bg-blue-100 text-blue-700',
  devis_accepte: 'bg-green-100 text-green-700',
  devis_refuse: 'bg-rose-100 text-rose-700',
  chantier_a_planifier: 'bg-amber-100 text-amber-700',
  chantier_en_cours: 'bg-orange-100 text-orange-700',
  facture_a_envoyer: 'bg-purple-100 text-purple-700',
  facture_envoyee: 'bg-violet-100 text-violet-700',
  paye: 'bg-green-100 text-green-800',
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

export function isProspect(status: ClientStatus): boolean {
  return prospectStatuses.includes(status)
}

export function clientDisplayName(c?: {
  type?: string; first_name?: string | null; last_name?: string | null; company_name?: string | null
} | null): string {
  if (!c) return 'Sans nom'
  if (c.type === 'professionnel' && c.company_name) return c.company_name
  return `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.company_name || 'Sans nom'
}
