'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
// Widget d'autocomplétion Google Places (Maps JavaScript API) — le même moteur
// que la barre de recherche Maps, capable de trouver les petites fiches d'artisan
// (contrairement au web service Places). L'artisan tape son nom, choisit sa fiche,
// on récupère le place_id → on construit le lien d'avis.

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

// Chargement de la Maps JS API via callback (pattern fiable) : quand le callback
// se déclenche, google.maps.places est prêt. Pas d'importLibrary (indispo avec ce
// mode de chargement).
let mapsPromise: Promise<void> | null = null
function loadMaps(key: string): Promise<void> {
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

const INPUT_CLASS = 'w-full h-11 rounded-md border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary'

export default function FicheAutocomplete({
  apiKey, onSelect,
}: { apiKey: string; onSelect: (r: { placeId: string; name: string; address: string }) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [detail, setDetail] = useState<string | null>(null)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  useEffect(() => {
    if (!apiKey) return
    let cleanup = () => {}
    let cancelled = false

    loadMaps(apiKey).then(() => {
      if (cancelled) return
      const places = (window as any).google?.maps?.places
      if (!places) throw new Error('google.maps.places indisponible.')

      // 1) Widget legacy : le plus compatible, sur un simple <input>.
      if (places.Autocomplete && inputRef.current) {
        const ac = new places.Autocomplete(inputRef.current, {
          fields: ['place_id', 'name', 'formatted_address'],
          componentRestrictions: { country: 'fr' },
          types: ['establishment'],
        })
        ac.addListener('place_changed', () => {
          const p = ac.getPlace()
          if (p?.place_id) onSelectRef.current({ placeId: p.place_id, name: p.name || '', address: p.formatted_address || '' })
          else toast.error('Sélectionnez votre fiche dans la liste déroulante.')
        })
        return
      }

      // 2) Repli : nouveau PlaceAutocompleteElement.
      if (places.PlaceAutocompleteElement && containerRef.current) {
        const el: any = new places.PlaceAutocompleteElement({ includedRegionCodes: ['fr'] })
        el.style.width = '100%'
        if (inputRef.current) inputRef.current.style.display = 'none'
        containerRef.current.appendChild(el)
        cleanup = () => { if (el.parentNode) el.parentNode.removeChild(el) }
        el.addEventListener('gmp-select', async (event: any) => {
          try {
            const place = event.placePrediction.toPlace()
            await place.fetchFields({ fields: ['id', 'displayName', 'formattedAddress'] })
            onSelectRef.current({ placeId: place.id, name: (typeof place.displayName === 'string' ? place.displayName : place.displayName?.text) || '', address: place.formattedAddress || '' })
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
