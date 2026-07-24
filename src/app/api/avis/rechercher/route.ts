import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { geocodeAddress } from '@/lib/meteo'

// Recherche la fiche Google de l'entreprise via l'API Places (New) et construit
// le lien « laisser un avis ». Clé serveur mutualisée (GOOGLE_PLACES_API_KEY).
//
// Stratégie (comme Google Maps) : on cherche par NOM SEUL — sans coller l'adresse
// dans la requête (sinon les entreprises de la zone remontent) et SANS biais qui
// exclurait un résultat éloigné. On se contente ensuite de CLASSER les fiches par
// proximité de l'adresse de l'entreprise, sans jamais en écarter.
type PlaceRaw = { id?: string; displayName?: { text?: string }; formattedAddress?: string; location?: { latitude?: number; longitude?: number } }

function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371, toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
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

    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location',
      },
      body: JSON.stringify({ textQuery: name, languageCode: 'fr', regionCode: 'FR', maxResultCount: 12 }),
    })
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 200)
      return NextResponse.json({ error: 'La recherche Google a échoué. Réessayez ou collez le lien à la main.', detail }, { status: 502 })
    }
    const json = await res.json()
    const places: PlaceRaw[] = Array.isArray(json?.places) ? json.places : []

    let candidates = places.map(p => {
      const lat = p.location?.latitude, lon = p.location?.longitude
      const dist = coords && typeof lat === 'number' && typeof lon === 'number' ? distanceKm(coords, { lat, lon }) : null
      return {
        placeId: p.id || '',
        name: p.displayName?.text || name,
        address: p.formattedAddress || '',
        reviewUrl: p.id ? `https://search.google.com/local/writereview?placeid=${p.id}` : '',
        _dist: dist,
      }
    }).filter(c => c.placeId)

    // Classe par proximité de l'adresse (le plus proche d'abord), sans rien exclure.
    if (coords) candidates = candidates.sort((a, b) => (a._dist ?? 1e9) - (b._dist ?? 1e9))

    return NextResponse.json({ candidates: candidates.slice(0, 6).map(({ _dist, ...c }) => { void _dist; return c }) })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur serveur' }, { status: 500 })
  }
}
