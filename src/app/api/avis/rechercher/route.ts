import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Recherche la fiche Google de l'entreprise via l'API Places (New) et construit
// le lien « laisser un avis ». Clé serveur mutualisée (GOOGLE_PLACES_API_KEY).
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
    const query = [name, (company?.address || '').trim()].filter(Boolean).join(' ')

    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress',
      },
      body: JSON.stringify({ textQuery: query, languageCode: 'fr', regionCode: 'FR', maxResultCount: 5 }),
    })
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 200)
      return NextResponse.json({ error: 'La recherche Google a échoué. Réessayez ou collez le lien à la main.', detail }, { status: 502 })
    }
    const json = await res.json()
    const places: unknown[] = Array.isArray(json?.places) ? json.places : []
    const candidates = places.slice(0, 5).map(raw => {
      const p = raw as { id?: string; displayName?: { text?: string }; formattedAddress?: string }
      return {
        placeId: p.id || '',
        name: p.displayName?.text || name,
        address: p.formattedAddress || '',
        reviewUrl: p.id ? `https://search.google.com/local/writereview?placeid=${p.id}` : '',
      }
    }).filter(c => c.placeId)

    return NextResponse.json({ candidates })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur serveur' }, { status: 500 })
  }
}
