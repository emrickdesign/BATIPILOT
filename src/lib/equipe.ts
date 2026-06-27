// Fonctions et compétences (issues du document)
export const employeeRoleOptions: string[] = [
  'Chef d\'équipe', 'Salarié terrain', 'Conducteur', 'Apprenti', 'Polyvalent',
]

export const skillOptions: string[] = [
  'Électricien', 'Plombier', 'Peintre', 'Plaquiste', 'Carreleur',
  'Maçon', 'Menuisier', 'Couvreur', 'Manœuvre', 'Polyvalent',
]

// Palette de couleurs pour le planning (une par salarié)
export const employeeColors: string[] = [
  '#FF6A00', '#2563EB', '#16A34A', '#7C3AED', '#DB2777',
  '#0891B2', '#CA8A04', '#DC2626', '#0F766E', '#9333EA',
]

export function employeeInitials(name: string): string {
  return name.split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?'
}
