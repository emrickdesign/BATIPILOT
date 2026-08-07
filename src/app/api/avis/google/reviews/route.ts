import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getValidGbpToken } from '@/lib/gbp-token'

const STAR: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 }

// Découvre le compte + la fiche (location) de l'utilisateur et les met en cache.
// Renvoie null si l'accès API n'est pas encore accordé (403) → géré par l'appelant.
async function ensureLocation(token: string, supabase: any, userId: string, conn: any): Promise<{ location: string; account: string } | { error: 'no-access' | 'no-location' }> {
  if (conn?.location_name && conn?.account_name) {
    return { location: conn.location_name, account: conn.account_name }
  }
  // 1) Compte(s)
  const accRes = await fetch('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (accRes.status === 403) return { error: 'no-access' }
  if (!accRes.ok) return { error: 'no-location' }
  const account = (await accRes.json())?.accounts?.[0]?.name as string | undefined
  if (!account) return { error: 'no-location' }

  // 2) Fiche(s) de ce compte
  const locRes = await fetch(`https://mybusinessbusinessinformation.googleapis.com/v1/${account}/locations?readMask=name,title&pageSize=100`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (locRes.status === 403) return { error: 'no-access' }
  if (!locRes.ok) return { error: 'no-location' }
  const loc = (await locRes.json())?.locations?.[0]
  if (!loc?.name) return { error: 'no-location' }

  const locationName = `${account}/${loc.name}` // accounts/X/locations/Y (chemin v4)
  await supabase.from('google_business_connections').update({
    account_name: account, location_name: locationName, location_title: loc.title || null, updated_at: new Date().toISOString(),
  }).eq('user_id', userId)

  return { location: locationName, account }
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const token = await getValidGbpToken(supabase, user.id)
  if (!token) return NextResponse.json({ error: 'not-connected' })

  const { data: conn } = await supabase.from('google_business_connections').select('*').eq('user_id', user.id).maybeSingle()
  const loc = await ensureLocation(token, supabase, user.id, conn)
  if ('error' in loc) return NextResponse.json({ error: loc.error })

  // Avis (v4) — pagination jusqu'à 200 avis
  const reviews: any[] = []
  let averageRating = 0, totalReviewCount = 0, pageToken: string | undefined
  for (let i = 0; i < 4; i++) {
    const url = new URL(`https://mybusiness.googleapis.com/v4/${loc.location}/reviews`)
    url.searchParams.set('pageSize', '50')
    if (pageToken) url.searchParams.set('pageToken', pageToken)
    const r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } })
    if (r.status === 403) return NextResponse.json({ error: 'no-access' })
    if (!r.ok) return NextResponse.json({ error: 'fetch-failed' })
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

  return NextResponse.json({
    ok: true,
    title: conn?.location_title || null,
    rating: averageRating,
    total: totalReviewCount,
    reviews,
  })
}
