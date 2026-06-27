import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { mapCompanyResult } from '@/lib/siret'

// Proxy serveur vers l'API publique recherche-entreprises.api.gouv.fr.
// Évite tout souci CORS et garde la requête côté serveur. Gratuit, sans clé.
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

    const q = (req.nextUrl.searchParams.get('q') || '').trim()
    if (q.length < 3) return NextResponse.json({ results: [] })

    const url = new URL('https://recherche-entreprises.api.gouv.fr/search')
    url.searchParams.set('q', q)
    url.searchParams.set('per_page', '6')
    url.searchParams.set('page', '1')

    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      // L'annuaire est public et stable : on tolère un petit cache.
      next: { revalidate: 3600 },
    })
    if (!res.ok) {
      return NextResponse.json({ error: 'Annuaire entreprises indisponible' }, { status: 502 })
    }
    const json = await res.json()
    const results = Array.isArray(json?.results) ? json.results.map(mapCompanyResult) : []
    return NextResponse.json({ results })
  } catch {
    return NextResponse.json({ error: 'Recherche impossible' }, { status: 500 })
  }
}
