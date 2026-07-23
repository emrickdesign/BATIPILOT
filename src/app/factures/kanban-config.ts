import type { KanbanColumn } from '@/components/kanban/DndKanban'

// Colonnes = étapes réelles de la facture (invoices.status). « En retard » est
// dérivé (échéance dépassée) et affiché en badge, pas en colonne.
export const FACTURE_COLUMNS: KanbanColumn[] = [
  { key: 'brouillon', label: 'À préparer', dot: '#94918A' },
  { key: 'envoyee', label: 'Envoyée', dot: '#E0674C' },
  { key: 'payee_partiellement', label: 'Paiement partiel', dot: '#C77D0E' },
  { key: 'payee', label: 'Payée', dot: '#3F7A2E' },
  { key: 'annulee', label: 'Annulée', dot: '#C0392B' },
]

export function factureCol(status: string): string {
  return FACTURE_COLUMNS.some(c => c.key === status) ? status : 'envoyee'
}

export type FactureCardData = {
  id: string
  col: string
  number: string
  clientName: string
  amountFmt: string
  resteFmt: string
  outstanding: boolean
  dueFmt: string | null
  dateFmt: string
  badge: { label: string; cls: string } | null
  cta: string
}
