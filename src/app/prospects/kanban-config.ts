import type { KanbanColumn } from '@/components/kanban/DndKanban'
import type { ClientStatus } from '@/types'
import type { StatTone } from '@/components/charts/StatCard'

// Module neutre (PAS 'use client') : partagé par la page serveur et le composant client.
// `tone` = ton KPI (dégradé plein) pour les tuiles du résumé pipeline.
export const PROSPECT_COLUMNS: (KanbanColumn & { key: ClientStatus; extra?: ClientStatus[]; tone: StatTone })[] = [
  { key: 'nouveau', label: 'Nouveau', extra: ['infos_a_recuperer'], dot: '#94918A', tone: 'blue' },
  { key: 'devis_a_faire', label: 'Devis à faire', dot: '#C77D0E', tone: 'amber' },
  { key: 'devis_envoye', label: 'Devis envoyé', dot: '#E0674C', tone: 'coral' },
  { key: 'devis_accepte', label: 'Accepté', dot: '#3F7A2E', tone: 'green' },
  { key: 'devis_refuse', label: 'Refusé', dot: '#C0392B', tone: 'red' },
]

export type ProspectCardData = {
  id: string
  col: ClientStatus
  status: ClientStatus
  isPro: boolean
  name: string
  phone: string | null
  email: string | null
  waHref: string | null
  pot: number
  createdAt: string
}
