/**
 * Logique de couleur sémantique des cartes chiffres à travers l'app :
 * vert = argent déjà encaissé / validé / succès
 * orange = en attente / reste à obtenir / à traiter
 * bleu = information neutre (facturé, envoyé, action)
 * violet = pipeline commercial / devis
 * rouge = urgent / en retard / danger
 */
export const statColors = {
  success: '#16A34A',
  warning: '#D97706',
  info: '#2563EB',
  accent: '#7C3AED',
  danger: '#DC2626',
} as const
