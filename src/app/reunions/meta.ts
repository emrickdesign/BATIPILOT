import type { MeetingType, MeetingStatus } from '@/types'

export const MEETING_TYPES: { value: MeetingType; label: string; hint: string }[] = [
  { value: 'chantier_hebdo', label: 'Point chantier hebdo', hint: 'Avancement, blocages, prochaines étapes' },
  { value: 'securite', label: 'Réunion sécurité / QSE', hint: 'EPI, risques, incidents, mesures' },
  { value: 'demarrage', label: 'Brief démarrage chantier', hint: 'Objectifs, planning, rôles, matériel' },
  { value: 'client', label: 'Réunion client', hint: 'Attentes, validations, budget, délais' },
  { value: 'rh', label: 'Réunion RH / équipe', hint: 'Organisation, congés, points individuels' },
  { value: 'custom', label: 'Personnalisée', hint: 'Compte-rendu généraliste' },
]

export function meetingTypeLabel(t: MeetingType): string {
  return MEETING_TYPES.find((x) => x.value === t)?.label ?? 'Réunion'
}

export const MEETING_STATUS: Record<MeetingStatus, { label: string; className: string }> = {
  draft: { label: 'Brouillon', className: 'bg-slate-100 text-slate-600' },
  recording: { label: 'Enregistrement', className: 'bg-red-100 text-red-700' },
  processing: { label: 'Analyse IA…', className: 'bg-amber-100 text-amber-700' },
  ready: { label: 'À valider', className: 'bg-blue-100 text-blue-700' },
  published: { label: 'Publiée', className: 'bg-green-100 text-green-700' },
}

export function formatDuration(sec?: number | null): string {
  if (!sec || sec < 1) return '—'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  return `${h} h ${String(m % 60).padStart(2, '0')}`
}
