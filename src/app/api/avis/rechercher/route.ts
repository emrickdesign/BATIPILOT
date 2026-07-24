import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { geocodeAddress } from '@/lib/meteo'

// Trouve la fiche Google de l'entreprise et construit le lien « laisser un avis ».
// Clé serveur mutualisée (GOOGLE_PLACES_API_KEY).
//
// On utilise l'ANCIENNE API Places (maps.googleapis.com) — la même que la
// prospection Potentieel, donc déjà activée et facturée sur le projet — via
// l'Autocomplete (le moteur de la barre de recherche Maps). L'adresse ne sert
// que de biais géographique doux, jamais à exclure. En cas de refus Google, on
// remonte le vrai message d'erreur (status + error_message) pour diagnostiquer.
type Candidate = { placeId: string; name: string; address: string; reviewUrl: string }

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

    const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json')
    url.searchParams.set('input', name)
    url.searchParams.set('key', key)
    url.searchParams.set('language', 'fr')
    url.searchParams.set('components', 'country:fr')
    if (coords) { url.searchParams.set('location', `${coords.lat},${coords.lon}`); url.searchParams.set('radius', '50000') }

    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    const json = await res.json().catch(() => ({}))
    const status = json?.status as string | undefined
    const predictions: unknown[] = Array.isArray(json?.predictions) ? json.predictions : []
    const debug = `recherche « ${name} » · Google=${status || 'aucun statut'} · ${predictions.length} résultat(s) · ${coords ? 'géo ok' : 'géo absente'}`

    // Google refuse (clé, API non activée, facturation…) → on remonte la cause.
    if (status && status !== 'OK' && status !== 'ZERO_RESULTS') {
      return NextResponse.json({ error: `Google a refusé (${status}). ${json?.error_message || ''}`.trim(), debug }, { status: 502 })
    }

    const candidates: Candidate[] = predictions.map(raw => {
      const p = raw as { place_id?: string; description?: string; structured_formatting?: { main_text?: string; secondary_text?: string } }
      if (!p.place_id) return null
      return {
        placeId: p.place_id,
        name: p.structured_formatting?.main_text || p.description || name,
        address: p.structured_formatting?.secondary_text || '',
        reviewUrl: `https://search.google.com/local/writereview?placeid=${p.place_id}`,
      } as Candidate
    }).filter((c): c is Candidate => !!c).slice(0, 6)

    return NextResponse.json({ candidates, debug })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur serveur' }, { status: 500 })
  }
}
