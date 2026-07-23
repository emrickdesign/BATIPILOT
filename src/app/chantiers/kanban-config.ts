import type { KanbanColumn } from '@/components/kanban/DndKanban'

// Colonnes = cycle de vie du chantier. Plusieurs statuts bruts sont regroupés
// par colonne (voir chantierCol) ; déposer une carte fixe le statut principal.
export const CHANTIER_COLUMNS: KanbanColumn[] = [
  { key: 'a_planifier', label: 'À planifier', dot: '#C77D0E' },
  { key: 'en_cours', label: 'En cours', dot: '#E0674C' },
  { key: 'a_facturer', label: 'À facturer', dot: '#2F6BE8' },
  { key: 'facture', label: 'Facturé', dot: '#0E9488' },
  { key: 'paye', label: 'Terminé / payé', dot: '#3F7A2E' },
]

export function chantierCol(status: string): string {
  switch (status) {
    case 'en_cours': case 'en_pause': return 'en_cours'
    case 'termine': case 'a_facturer': return 'a_facturer'
    case 'facture': return 'facture'
    case 'paye': return 'paye'
    default: return 'a_planifier' // demande/visite/devis/a_planifier/planifie
  }
}

export type ChantierCardData = {
  id: string
  col: string
  title: string
  clientName: string | null
  amountFmt: string | null
  margeFmt: string | null
  margePos: boolean
  enRetard: boolean
  equipeCount: number
  progress: number
  cta: string
}
