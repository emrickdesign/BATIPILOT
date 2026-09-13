/* eslint-disable @typescript-eslint/no-explicit-any */
// Helpers Web Speech (reconnaissance vocale) — surtout pour fiabiliser le mobile.
//
// Pièges mobiles que ça sert à contourner :
// - iOS Safari gère mal `continuous` (souvent aucun résultat) → single-shot + relance.
// - Réutiliser une instance après `onend` est instable → on en recrée UNE À CHAQUE FOIS.
// - iOS en app « écran d'accueil » (standalone) : la reconnaissance vocale web est
//   souvent indisponible → on peut le détecter pour prévenir l'utilisateur.

export function getSpeechRecognitionCtor(): any {
  if (typeof window === 'undefined') return null
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  return /iP(hone|ad|od)/.test(ua) || (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1)
}

export function isStandalonePWA(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.matchMedia?.('(display-mode: standalone)').matches === true || (navigator as any).standalone === true
  } catch { return false }
}

// iOS en app installée : la reconnaissance vocale ne marche pas de façon fiable.
export function speechLikelyBlocked(): boolean {
  return isIOS() && isStandalonePWA()
}

/**
 * Crée une instance de reconnaissance configurée pour la dictée FR.
 * Sur iOS on force `continuous=false` (single-shot, bien plus fiable) — on
 * simule la continuité en relançant une NOUVELLE instance après chaque fin.
 */
export function createRecognizer(): any | null {
  const SR = getSpeechRecognitionCtor()
  if (!SR) return null
  const r = new SR()
  r.lang = 'fr-FR'
  r.interimResults = true
  r.maxAlternatives = 1
  r.continuous = !isIOS()
  return r
}
