import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { geocodeAddress } from '@/lib/meteo'

// Trouve la fiche Google de l'entreprise et construit le lien « laisser un avis ».
// Clé serveur mutualisée (GOOGLE_PLACES_API_KEY), ANCIENNE API Places
// (maps.googleapis.com) — déjà activée/facturée par la prospection.
//
// On enchaîne Text Search puis Find Place (les deux savent trouver une entreprise
// par son nom, contrairement à Autocomplete). L'adresse ne sert qu'à biaiser/
// classer par proximité, jamais à exclure.
type Candidate = { placeId: string; name: string; address: string; reviewUrl: string; _dist?: number | null }
type Coords = { lat: number; lon: number }

function reviewUrl(id: string) { return `https://search.google.com/local/writereview?placeid=${id}` }
function distanceKm(a: Coords, b: Coords) {
  const R = 6371, toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

async function textSearch(key: string, name: string, coords: Coords | null): Promise<{ status: string; list: Candidate[] }> {
  const url = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json')
  url.searchParams.set('query', name)
  url.searchParams.set('key', key)
  url.searchParams.set('language', 'fr')
  url.searchParams.set('region', 'fr')
  if (coords) { url.searchParams.set('location', `${coords.lat},${coords.lon}`); url.searchParams.set('radius', '50000') }
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  const j = await res.json().catch(() => ({}))
  const results: unknown[] = Array.isArray(j?.results) ? j.results : []
  const list = results.map(raw => {
    const p = raw as { place_id?: string; name?: string; formatted_address?: string; geometry?: { location?: { lat?: number; lng?: number } } }
    if (!p.place_id) return null
    const lat = p.geometry?.location?.lat, lon = p.geometry?.location?.lng
    return { placeId: p.place_id, name: p.name || name, address: p.formatted_address || '', reviewUrl: reviewUrl(p.place_id), _dist: coords && typeof lat === 'number' && typeof lon === 'number' ? distanceKm(coords, { lat, lon }) : null } as Candidate
  }).filter((c): c is Candidate => !!c)
  return { status: j?.status || 'NO_STATUS', list }
}

async function findPlace(key: string, name: string, coords: Coords | null): Promise<{ status: string; list: Candidate[] }> {
  const url = new URL('https://maps.googleapis.com/maps/api/place/findplacefromtext/json')
  url.searchParams.set('input', name)
  url.searchParams.set('inputtype', 'textquery')
  url.searchParams.set('fields', 'place_id,name,formatted_address,geometry')
  url.searchParams.set('key', key)
  url.searchParams.set('language', 'fr')
  if (coords) url.searchParams.set('locationbias', `circle:50000@${coords.lat},${coords.lon}`)
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  const j = await res.json().catch(() => ({}))
  const results: unknown[] = Array.isArray(j?.candidates) ? j.candidates : []
  const list = results.map(raw => {
    const p = raw as { place_id?: string; name?: string; formatted_address?: string; geometry?: { location?: { lat?: number; lng?: number } } }
    if (!p.place_id) return null
    const lat = p.geometry?.location?.lat, lon = p.geometry?.location?.lng
    return { placeId: p.place_id, name: p.name || name, address: p.formatted_address || '', reviewUrl: reviewUrl(p.place_id), _dist: coords && typeof lat === 'number' && typeof lon === 'number' ? distanceKm(coords, { lat, lon }) : null } as Candidate
  }).filter((c): c is Candidate => !!c)
  return { status: j?.status || 'NO_STATUS', list }
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

    const ts = await textSearch(key, name, coords)
    let list = ts.list
    let fp: { status: string; list: Candidate[] } | null = null
    if (list.length === 0) { fp = await findPlace(key, name, coords); list = fp.list }

    const debug = `« ${name} » · TextSearch=${ts.status}(${ts.list.length})${fp ? ` · FindPlace=${fp.status}(${fp.list.length})` : ''} · ${coords ? 'géo ok' : 'géo absente'}`

    const denied = [ts.status, fp?.status].find(s => s && !['OK', 'ZERO_RESULTS', undefined].includes(s))
    if (list.length === 0 && denied) {
      return NextResponse.json({ error: `Google a refusé (${denied}).`, debug }, { status: 502 })
    }

    if (coords) list.sort((a, b) => (a._dist ?? 1e9) - (b._dist ?? 1e9))
    const out = list.slice(0, 6).map(({ _dist, ...c }) => { void _dist; return c })
    return NextResponse.json({ candidates: out, debug })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur serveur' }, { status: 500 })
  }
}
