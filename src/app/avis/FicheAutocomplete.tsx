'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
// Widget d'autocomplétion Google Places (Maps JavaScript API) — le même moteur
// que la barre de recherche Maps, capable de trouver les petites fiches d'artisan
// (contrairement au web service Places). L'artisan tape son nom, choisit sa fiche,
// on récupère le place_id → on construit le lien d'avis.

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { loadGoogleMaps } from '@/lib/googleMaps'

const INPUT_CLASS = 'w-full h-11 rounded-md border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary'

export type SelectedFiche = {
  placeId: string; name: string; address: string
  rating?: number; reviewsCount?: number
  reviews?: { author: string; rating: number; text: string }[]
}

export default function FicheAutocomplete({
  apiKey, onSelect, biasLat, biasLng,
}: { apiKey: string; onSelect: (r: SelectedFiche) => void; biasLat?: number; biasLng?: number }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [detail, setDetail] = useState<string | null>(null)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  useEffect(() => {
    if (!apiKey) return
    let cleanup = () => {}
    let cancelled = false

    loadGoogleMaps(apiKey).then(() => {
      if (cancelled) return
      const places = (window as any).google?.maps?.places
      if (!places) throw new Error('google.maps.places indisponible.')

      const g = (window as any).google
      // Biais géographique vers l'adresse de l'artisan : sa fiche locale remonte
      // (comme la barre Maps qui connaît la position de l'utilisateur).
      let bounds: any = undefined
      if (typeof biasLat === 'number' && typeof biasLng === 'number' && g?.maps?.LatLng) {
        const d = 0.6 // ~65 km autour de l'adresse
        bounds = new g.maps.LatLngBounds(
          new g.maps.LatLng(biasLat - d, biasLng - d),
          new g.maps.LatLng(biasLat + d, biasLng + d),
        )
      }

      // 1) Widget legacy : le plus compatible, sur un simple <input>.
      if (places.Autocomplete && inputRef.current) {
        const ac = new places.Autocomplete(inputRef.current, {
          fields: ['place_id', 'name', 'formatted_address', 'rating', 'user_ratings_total', 'reviews'],
          componentRestrictions: { country: 'fr' },
          ...(bounds ? { bounds } : {}),
          // Pas de filtre `types` : beaucoup d'artisans sont des fiches « zone de
          // service » (sans local), que le type "establishment" tend à exclure.
        })
        ac.addListener('place_changed', () => {
          const p = ac.getPlace()
          if (!p?.place_id) { toast.error('Sélectionnez votre fiche dans la liste déroulante.'); return }
          onSelectRef.current({
            placeId: p.place_id,
            name: p.name || '',
            address: p.formatted_address || '',
            rating: typeof p.rating === 'number' ? p.rating : undefined,
            reviewsCount: typeof p.user_ratings_total === 'number' ? p.user_ratings_total : undefined,
            reviews: Array.isArray(p.reviews) ? p.reviews.slice(0, 3).map((rv: any) => ({ author: rv.author_name || '', rating: rv.rating || 0, text: rv.text || '' })) : [],
          })
        })
        return
      }

      // 2) Repli : nouveau PlaceAutocompleteElement.
      if (places.PlaceAutocompleteElement && containerRef.current) {
        const el: any = new places.PlaceAutocompleteElement({ includedRegionCodes: ['fr'], ...(bounds ? { locationBias: bounds } : {}) })
        el.style.width = '100%'
        if (inputRef.current) inputRef.current.style.display = 'none'
        containerRef.current.appendChild(el)
        cleanup = () => { if (el.parentNode) el.parentNode.removeChild(el) }
        el.addEventListener('gmp-select', async (event: any) => {
          try {
            const place = event.placePrediction.toPlace()
            await place.fetchFields({ fields: ['id', 'displayName', 'formattedAddress', 'rating', 'userRatingCount', 'reviews'] })
            onSelectRef.current({
              placeId: place.id,
              name: (typeof place.displayName === 'string' ? place.displayName : place.displayName?.text) || '',
              address: place.formattedAddress || '',
              rating: typeof place.rating === 'number' ? place.rating : undefined,
              reviewsCount: typeof place.userRatingCount === 'number' ? place.userRatingCount : undefined,
              reviews: Array.isArray(place.reviews) ? place.reviews.slice(0, 3).map((rv: any) => ({ author: rv.authorAttribution?.displayName || '', rating: rv.rating || 0, text: (typeof rv.text === 'string' ? rv.text : rv.text?.text) || '' })) : [],
            })
          } catch (e: any) { toast.error('Fiche non récupérée — réessayez.'); console.error('[avis][maps][select]', e) }
        })
        return
      }

      throw new Error('Aucun widget d\'autocomplétion disponible.')
    }).catch((e: any) => {
      console.error('[avis][maps]', e)
      if (!cancelled) setDetail(String(e?.message || e))
    })

    return () => { cancelled = true; cleanup() }
  }, [apiKey])

  if (!apiKey) return null
  return (
    <div className="space-y-1.5">
      <input ref={inputRef} type="text" placeholder="Tapez le nom de votre entreprise…" className={INPUT_CLASS} />
      <div ref={containerRef} className="w-full" />
      {detail && <p className="text-xs text-rose-600 break-words">Recherche indisponible : {detail} — utilisez la méthode manuelle ci-dessous.</p>}
    </div>
  )
}
