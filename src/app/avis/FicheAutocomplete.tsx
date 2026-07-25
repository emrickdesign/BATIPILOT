'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
// Widget d'autocomplétion Google Places (Maps JavaScript API) — le même moteur
// que la barre de recherche Maps, capable de trouver les petites fiches d'artisan
// (contrairement au web service Places). L'artisan tape son nom, choisit sa fiche,
// on récupère le place_id → on construit le lien d'avis.

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

let mapsPromise: Promise<void> | null = null
function loadMaps(key: string): Promise<void> {
  const w = window as any
  if (w.google?.maps?.importLibrary) return Promise.resolve()
  if (mapsPromise) return mapsPromise
  mapsPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&loading=async&language=fr&region=FR`
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Maps JS load failed'))
    document.head.appendChild(s)
  })
  return mapsPromise
}

export default function FicheAutocomplete({
  apiKey, onSelect,
}: { apiKey: string; onSelect: (r: { placeId: string; name: string; address: string }) => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [err, setErr] = useState(false)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  useEffect(() => {
    if (!apiKey || !containerRef.current) return
    let el: any = null
    let cancelled = false
    loadMaps(apiKey).then(async () => {
      const g = (window as any).google
      await g.maps.importLibrary('places')
      if (cancelled || !containerRef.current) return
      el = new g.maps.places.PlaceAutocompleteElement({ includedRegionCodes: ['fr'] })
      el.style.width = '100%'
      containerRef.current.innerHTML = ''
      containerRef.current.appendChild(el)
      el.addEventListener('gmp-select', async (event: any) => {
        try {
          const place = event.placePrediction.toPlace()
          await place.fetchFields({ fields: ['id', 'displayName', 'formattedAddress'] })
          onSelectRef.current({
            placeId: place.id,
            name: typeof place.displayName === 'string' ? place.displayName : (place.displayName?.text || ''),
            address: place.formattedAddress || '',
          })
        } catch {
          toast.error('Fiche non récupérée — réessayez ou utilisez la méthode manuelle.')
        }
      })
    }).catch(() => setErr(true))
    return () => { cancelled = true; if (el?.parentNode) el.parentNode.removeChild(el) }
  }, [apiKey])

  if (!apiKey) return null
  return (
    <div className="space-y-1.5">
      <div ref={containerRef} className="w-full" />
      {err && <p className="text-xs text-rose-600">Recherche indisponible pour le moment — utilisez la méthode manuelle ci-dessous.</p>}
    </div>
  )
}
