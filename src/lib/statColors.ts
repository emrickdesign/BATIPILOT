/**
 * Logique de couleur sémantique des cartes chiffres à travers l'app (ADN Potentieel chaud).
 * Contraste texte blanc vérifié sur chaque fond (≥ 3:1 pour les grands chiffres gras).
 * vert   = argent encaissé / validé / positif
 * ambre  = en attente / reste à obtenir / à traiter
 * corail = information neutre / marque (facturé, envoyé, action)
 * terre  = pipeline commercial / devis
 * rouge  = urgent / en retard / négatif
 */
export const statColors = {
  success: '#3F7A2E',  // vert positif
  warning: '#B45309',  // ambre en attente
  info: '#D05C43',     // corail (marque)
  accent: '#8A4B24',   // terre cuite (pipeline)
  danger: '#C0392B',   // rouge négatif
} as const
