import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { geocodeAddress } from '@/lib/meteo'

// Trouve la fiche Google de l'entreprise et construit le lien « laisser un avis ».
// Clé serveur mutualisée (GOOGLE_PLACES_API_KEY).
//
// On utilise en PRIORITÉ l'API Autocomplete (New) — c'est ce que fait la barre de
// recherche de Google Maps, qui trouve les petites fiches par nom. Text Search est
// gardé en secours. L'adresse ne sert qu'à biaiser/classer par proximité, jamais à
// exclure.
type Candidate = { placeId: string; name: string; address: string; reviewUrl: string; _dist?: number | null }

function reviewUrl(placeId: string) { return `https://search.google.com/local/writereview?placeid=${placeId}` }

function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371, toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

async function viaAutocomplete(key: string, name: string, coords: { lat: number; lon: number } | null): Promise<Candidate[]> {
  const body: Record<string, unknown> = { input: name, languageCode: 'fr', includedRegionCodes: ['fr'] }
  if (coords) body.locationBias = { circle: { center: { latitude: coords.lat, longitude: coords.lon }, radius: 50000 } }
  const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key },
    body: JSON.stringify(body),
  })
  if (!res.ok) return []
  const json = await res.json()
  const suggestions: unknown[] = Array.isArray(json?.suggestions) ? json.suggestions : []
  return suggestions.map(s => {
    const pp = (s as { placePrediction?: { placeId?: string; text?: { text?: string }; structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } } } }).placePrediction
    if (!pp?.placeId) return null
    return {
      placeId: pp.placeId,
      name: pp.structuredFormat?.mainText?.text || pp.text?.text || name,
      address: pp.structuredFormat?.secondaryText?.text || '',
      reviewUrl: reviewUrl(pp.placeId),
    } as Candidate
  }).filter((c): c is Candidate => !!c)
}

async function viaTextSearch(key: string, name: string, coords: { lat: number; lon: number } | null): Promise<Candidate[]> {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location',
    },
    body: JSON.stringify({ textQuery: name, languageCode: 'fr', regionCode: 'FR', maxResultCount: 12 }),
  })
  if (!res.ok) return []
  const json = await res.json()
  const places: unknown[] = Array.isArray(json?.places) ? json.places : []
  return places.map(raw => {
    const p = raw as { id?: string; displayName?: { text?: string }; formattedAddress?: string; location?: { latitude?: number; longitude?: number } }
    if (!p.id) return null
    const lat = p.location?.latitude, lon = p.location?.longitude
    return {
      placeId: p.id,
      name: p.displayName?.text || name,
      address: p.formattedAddress || '',
      reviewUrl: reviewUrl(p.id),
      _dist: coords && typeof lat === 'number' && typeof lon === 'number' ? distanceKm(coords, { lat, lon }) : null,
    } as Candidate
  }).filter((c): c is Candidate => !!c)
}

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

    const key = process.env.GOOGLE_PLACES_API_KEY
    if (!key) return NextResponse.json({ error: 'Recherche automatique indisponible pour le moment.' }, { status: 503 })

    const { data: company } = await supabase.from('companies').select('trade_name, address').eq('user_id', user.id).maybeSingle()
    const name = (company?.trade_name || '').trim()
    if (!name) return NextResponse.json({ error: 'Renseignez d’abord le nom de votre entreprise dans Paramètres → Mon entreprise.' }, { status: 400 })

    const address = (company?.address || '').trim()
    const coords = address ? await geocodeAddress(address) : null

    // 1) Autocomplete (comme la barre Maps). 2) Text Search en secours.
    let candidates = await viaAutocomplete(key, name, coords)
    if (candidates.length === 0) candidates = await viaTextSearch(key, name, coords)

    // Classe par proximité si on a les coordonnées (sans rien exclure).
    if (coords) candidates.sort((a, b) => (a._dist ?? 1e9) - (b._dist ?? 1e9))

    const out = candidates.slice(0, 6).map(({ _dist, ...c }) => { void _dist; return c })
    return NextResponse.json({ candidates: out })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur serveur' }, { status: 500 })
  }
}
