/* eslint-disable @typescript-eslint/no-explicit-any */
// Chargement unique de la Google Maps JS API (Places). Un seul <script> + un seul
// callback partagé par tous les composants (autocomplétion fiche, rapport d'avis…)
// pour éviter les doubles chargements et les conflits de callback.

let mapsPromise: Promise<void> | null = null

export function loadGoogleMaps(key: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('SSR'))
  const w = window as any
  if (w.google?.maps?.places) return Promise.resolve()
  if (mapsPromise) return mapsPromise
  mapsPromise = new Promise<void>((resolve, reject) => {
    const cb = '__batipilotMapsInit'
    w[cb] = () => resolve()
    const s = document.createElement('script')
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&language=fr&region=FR&loading=async&callback=${cb}`
    s.async = true
    s.onerror = () => reject(new Error('Chargement de Google Maps impossible (réseau ou clé).'))
    document.head.appendChild(s)
  })
  return mapsPromise
}
