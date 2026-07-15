import type { PresenceType } from '@/types'

export const presenceLabels: Record<PresenceType, string> = {
  arrivee: 'Je pointe — je suis au chantier',
  depart: 'Je pars du chantier',
  pause: 'Pause déjeuner',
  reprise: 'Je reprends',
  photo: 'Photo chantier',
}

// Libellé court pour la timeline
export const presenceShort: Record<PresenceType, string> = {
  arrivee: 'Arrivée',
  depart: 'Départ',
  pause: 'Pause',
  reprise: 'Reprise',
  photo: 'Photo',
}

export const presenceColors: Record<PresenceType, string> = {
  arrivee: 'bg-emerald-100 text-emerald-700',
  depart: 'bg-rose-100 text-rose-700',
  pause: 'bg-amber-100 text-amber-700',
  reprise: 'bg-blue-100 text-blue-700',
  photo: 'bg-violet-100 text-violet-700',
}

// Les actions proposées en gros boutons, dans l'ordre d'une journée type.
export const presenceActions: PresenceType[] = ['arrivee', 'pause', 'reprise', 'depart', 'photo']
