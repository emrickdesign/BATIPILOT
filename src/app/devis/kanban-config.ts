import type { KanbanColumn } from '@/components/kanban/DndKanban'

// Module neutre (PAS 'use client') : partagé par la page serveur et le client.
// Colonnes = étapes réelles du devis (quotes.status). Les états dérivés
// (relancé / expiré / facturé) sont affichés en badge, pas en colonne.
export const DEVIS_COLUMNS: KanbanColumn[] = [
  { key: 'brouillon', label: 'Brouillon', dot: '#94918A' },
  { key: 'pret', label: 'Prêt à envoyer', dot: '#C77D0E' },
  { key: 'envoye', label: 'Envoyé', dot: '#E0674C' },
  { key: 'accepte', label: 'Accepté', dot: '#3F7A2E' },
  { key: 'refuse', label: 'Refusé', dot: '#C0392B' },
]

/** Colonne d'affichage à partir du statut brut (transformé/facturé → Accepté). */
export function devisCol(status: string): string {
  if (status === 'transforme') return 'accepte'
  if (DEVIS_COLUMNS.some(c => c.key === status)) return status
  return 'envoye'
}

export type DevisCardData = {
  id: string
  col: string
  number: string
  clientName: string
  title: string | null
  amountFmt: string
  dateFmt: string
  badge: { label: string; cls: string } | null
  cta: string
}
