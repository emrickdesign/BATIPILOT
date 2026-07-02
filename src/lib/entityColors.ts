/**
 * Couleur d'identité par type d'entité créée/éditée — utilisée sur les formulaires
 * (FormSection, FormPageTitle) pour donner une cohérence visuelle entre "nouveau X"
 * et "modifier X", quel que soit l'endroit de l'app où on les ouvre.
 */
export const entityColors = {
  client: '#2563EB',
  devis: '#7C3AED',
  facture: '#7C3AED',
  chantier: '#FF6A00',
  salarie: '#0D9488',
  vehicule: '#0D9488',
} as const
