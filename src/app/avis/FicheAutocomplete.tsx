'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
// Recherche de fiche Google (Places) avec NOTRE PROPRE champ contrôlé + liste de
// résultats, alimentée par le service de prédictions Google (AutocompleteService)
// et les détails (PlacesService). On n'utilise plus le widget Google injecté :
// il remplaçait/masquait le champ et fermait le clavier mobile au 1er caractère.

import { useEffect, useRef, useState } from 'react'
import { Search, Loader2, MapPin, Building2 } from 'lucide-react'
import { loadGoogleMaps } from '@/lib/googleMaps'

const INPUT_CLASS = 'w-full h-11 rounded-md border border-gray-200 bg-white pl-9 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-50 disabled:text-gray-400'

export type SelectedFiche = {
  placeId: string; name: string; address: string
  rating?: number; reviewsCount?: number
  reviews?: { author: string; rating: number; text: string }[]
}

type Pred = { placeId: string; primary: string; secondary: string }

export default function FicheAutocomplete({
  apiKey, onSelect, biasLat, biasLng,
}: { apiKey: string; onSelect: (r: SelectedFiche) => void; biasLat?: number; biasLng?: number }) {
  const [q, setQ] = useState('')
  const [preds, setPreds] = useState<Pred[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const [detail, setDetail] = useState<string | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const acRef = useRef<any>(null)
  const placesRef = useRef<any>(null)
  const tokenRef = useRef<any>(null)
  const onSelectRef = useRef(onSelect)
  useEffect(() => { onSelectRef.current = onSelect }, [onSelect])

  // Initialise les services une fois Maps chargé.
  useEffect(() => {
    if (!apiKey) return
    let cancelled = false
    loadGoogleMaps(apiKey).then(() => {
      if (cancelled) return
      const places = (window as any).google?.maps?.places
      if (!places?.AutocompleteService) throw new Error('Places indisponible.')
      acRef.current = new places.AutocompleteService()
      placesRef.current = new places.PlacesService(document.createElement('div'))
      tokenRef.current = places.AutocompleteSessionToken ? new places.AutocompleteSessionToken() : undefined
      setReady(true)
    }).catch((e: any) => { if (!cancelled) setDetail(String(e?.message || e)) })
    return () => { cancelled = true }
  }, [apiKey])

  // Prédictions (debounce) — notre champ reste contrôlé, aucun remplacement DOM.
  useEffect(() => {
    const term = q.trim()
    if (!ready || term.length < 3) { setPreds([]); setLoading(false); return }
    setLoading(true)
    const t = setTimeout(() => {
      const g = (window as any).google
      const req: any = { input: term, componentRestrictions: { country: 'fr' } }
      if (tokenRef.current) req.sessionToken = tokenRef.current
      if (typeof biasLat === 'number' && typeof biasLng === 'number' && g?.maps?.LatLng) {
        const d = 0.6
        req.bounds = new g.maps.LatLngBounds(
          new g.maps.LatLng(biasLat - d, biasLng - d),
          new g.maps.LatLng(biasLat + d, biasLng + d),
        )
      }
      acRef.current.getPlacePredictions(req, (res: any[] | null, status: string) => {
        setLoading(false)
        const ok = status === g.maps.places.PlacesServiceStatus.OK
        setPreds(ok && Array.isArray(res)
          ? res.map(p => ({
              placeId: p.place_id,
              primary: p.structured_formatting?.main_text || p.description,
              secondary: p.structured_formatting?.secondary_text || '',
            }))
          : [])
        setOpen(true)
      })
    }, 300)
    return () => clearTimeout(t)
  }, [q, ready, biasLat, biasLng])

  // Ferme la liste au clic extérieur (mousedown : le bouton étant DANS boxRef,
  // le clic sur un résultat n'est pas annulé).
  useEffect(() => {
    function onClick(e: MouseEvent) { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  function pick(pred: Pred) {
    setOpen(false); setQ(pred.primary)
    const g = (window as any).google
    const req: any = { placeId: pred.placeId, fields: ['place_id', 'name', 'formatted_address', 'rating', 'user_ratings_total', 'reviews'] }
    if (tokenRef.current) req.sessionToken = tokenRef.current
    placesRef.current.getDetails(req, (p: any, status: string) => {
      const places = g?.maps?.places
      tokenRef.current = places?.AutocompleteSessionToken ? new places.AutocompleteSessionToken() : undefined
      if (status !== g.maps.places.PlacesServiceStatus.OK || !p) {
        onSelectRef.current({ placeId: pred.placeId, name: pred.primary, address: pred.secondary })
        return
      }
      onSelectRef.current({
        placeId: p.place_id,
        name: p.name || pred.primary,
        address: p.formatted_address || '',
        rating: typeof p.rating === 'number' ? p.rating : undefined,
        reviewsCount: typeof p.user_ratings_total === 'number' ? p.user_ratings_total : undefined,
        reviews: Array.isArray(p.reviews) ? p.reviews.slice(0, 3).map((rv: any) => ({ author: rv.author_name || '', rating: rv.rating || 0, text: rv.text || '' })) : [],
      })
    })
  }

  if (!apiKey) return null
  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary animate-spin" />}
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          onFocus={() => preds.length > 0 && setOpen(true)}
          disabled={!ready}
          autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
          placeholder={ready ? 'Tapez le nom de votre entreprise…' : 'Chargement de la recherche…'}
          className={INPUT_CLASS}
        />
      </div>

      {open && q.trim().length >= 3 && (
        <div className="absolute z-30 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden">
          {preds.length === 0 && !loading && <p className="px-4 py-3 text-sm text-gray-500">Aucune fiche trouvée.</p>}
          {preds.map(p => (
            <button key={p.placeId} type="button" onClick={() => pick(p)}
              className="w-full text-left px-4 py-2.5 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-primary flex-shrink-0" />
                <span className="font-medium text-marine text-sm truncate">{p.primary}</span>
              </div>
              {p.secondary && (
                <div className="flex items-center gap-1 mt-0.5 text-xs text-gray-500 truncate">
                  <MapPin className="w-3 h-3 flex-shrink-0" /> {p.secondary}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {detail && <p className="text-xs text-rose-600 break-words mt-1">Recherche indisponible : {detail} — utilisez la méthode manuelle ci-dessous.</p>}
    </div>
  )
}
