import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getValidGbpToken } from '@/lib/gbp-token'

/* eslint-disable @typescript-eslint/no-explicit-any */

const STAR: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 }

type Loc = { name: string; title: string; address: string }

// Liste TOUTES les fiches (accounts × locations) que le compte connecté gère.
// Renvoie { error } si l'accès API n'est pas encore accordé (403).
async function listLocations(token: string): Promise<Loc[] | { error: 'no-access' | 'no-location' }> {
  const accRes = await fetch('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (accRes.status === 403) return { error: 'no-access' }
  if (!accRes.ok) return { error: 'no-location' }
  const accounts: any[] = (await accRes.json())?.accounts || []
  if (!accounts.length) return { error: 'no-location' }

  const out: Loc[] = []
  for (const acc of accounts) {
    const url = `https://mybusinessbusinessinformation.googleapis.com/v1/${acc.name}/locations?readMask=name,title,storefrontAddress&pageSize=100`
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (r.status === 403) return { error: 'no-access' }
    if (!r.ok) continue
    for (const loc of ((await r.json())?.locations || [])) {
      const a = loc.storefrontAddress
      const address = a ? [a.locality, a.administrativeArea].filter(Boolean).join(', ') : ''
      out.push({ name: `${acc.name}/${loc.name}`, title: loc.title || 'Fiche', address })
    }
  }
  return out
}

async function fetchReviews(token: string, location: string) {
  const reviews: any[] = []
  let averageRating = 0, totalReviewCount = 0, pageToken: string | undefined
  for (let i = 0; i < 4; i++) {
    const url = new URL(`https://mybusiness.googleapis.com/v4/${location}/reviews`)
    url.searchParams.set('pageSize', '50')
    if (pageToken) url.searchParams.set('pageToken', pageToken)
    const r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } })
    if (r.status === 403) return { error: 'no-access' as const }
    if (!r.ok) return { error: 'fetch-failed' as const }
    const j = await r.json()
    averageRating = Number(j.averageRating) || averageRating
    totalReviewCount = Number(j.totalReviewCount) || totalReviewCount
    for (const rv of (j.reviews || [])) {
      reviews.push({
        name: rv.name,
        author: rv.reviewer?.displayName || 'Client',
        photo: rv.reviewer?.profilePhotoUrl || null,
        rating: STAR[rv.starRating] || 0,
        text: rv.comment || '',
        when: rv.createTime || rv.updateTime || '',
        reply: rv.reviewReply?.comment || null,
      })
    }
    pageToken = j.nextPageToken
    if (!pageToken) break
  }
  return { rating: averageRating, total: totalReviewCount, reviews }
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const token = await getValidGbpToken(supabase, user.id)
  if (!token) return NextResponse.json({ error: 'not-connected' })

  const locations = await listLocations(token)
  if ('error' in locations) return NextResponse.json({ error: locations.error })
  if (locations.length === 0) return NextResponse.json({ error: 'no-location' })

  const { data: conn } = await supabase.from('google_business_connections').select('location_name').eq('user_id', user.id).maybeSingle()

  // Fiche active : celle enregistrée si toujours valide, sinon auto si une seule,
  // sinon on demande à l'utilisateur de choisir.
  let selected = conn?.location_name && locations.some(l => l.name === conn.location_name) ? conn.location_name : null
  if (!selected && locations.length === 1) {
    selected = locations[0].name
    await supabase.from('google_business_connections').update({
      location_name: selected, location_title: locations[0].title, updated_at: new Date().toISOString(),
    }).eq('user_id', user.id)
  }
  if (!selected) {
    return NextResponse.json({ ok: true, needsSelection: true, locations })
  }

  const res = await fetchReviews(token, selected)
  if ('error' in res) return NextResponse.json({ error: res.error })

  return NextResponse.json({
    ok: true,
    selected,
    locations,
    title: locations.find(l => l.name === selected)?.title || null,
    rating: res.rating,
    total: res.total,
    reviews: res.reviews,
  })
}
