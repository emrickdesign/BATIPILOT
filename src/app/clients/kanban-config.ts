import type { KanbanColumn } from '@/components/kanban/DndKanban'
import type { ClientStatus } from '@/types'

// Module neutre (PAS 'use client') : partagé par la page serveur et le composant client.
// Un tableau exporté depuis un module client devient une référence côté serveur → à garder ici.
export const CLIENT_COLUMNS: (KanbanColumn & { key: ClientStatus; extra?: ClientStatus[] })[] = [
  { key: 'chantier_a_planifier', label: 'À planifier', extra: ['devis_accepte'], dot: '#C77D0E' },
  { key: 'chantier_en_cours', label: 'En cours', dot: '#E0674C' },
  { key: 'facture_a_envoyer', label: 'À facturer', dot: '#8A4B24' },
  { key: 'facture_envoyee', label: 'Facturé', dot: '#2F7DE0' },
  { key: 'paye', label: 'Payé / terminé', extra: ['termine'], dot: '#3F7A2E' },
]

export type ClientCard = {
  id: string
  col: ClientStatus
  status: ClientStatus
  isPro: boolean
  name: string
  ville: string
  phone: string | null
  email: string | null
  waHref: string | null
  facture: string
  reste: string | null
  chantiers: number
  contact: string
}
