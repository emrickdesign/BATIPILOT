import type { KanbanColumn } from '@/components/kanban/DndKanban'
import type { ClientStatus } from '@/types'

// Module neutre (PAS 'use client') : partagé par la page serveur et le composant client.
export const PROSPECT_COLUMNS: (KanbanColumn & { key: ClientStatus; extra?: ClientStatus[] })[] = [
  { key: 'nouveau', label: 'Nouveau', extra: ['infos_a_recuperer'], dot: '#94918A' },
  { key: 'devis_a_faire', label: 'Devis à faire', dot: '#C77D0E' },
  { key: 'devis_envoye', label: 'Devis envoyé', dot: '#E0674C' },
  { key: 'devis_accepte', label: 'Accepté', dot: '#3F7A2E' },
  { key: 'devis_refuse', label: 'Refusé', dot: '#C0392B' },
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
