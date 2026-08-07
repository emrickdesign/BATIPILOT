import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getValidGbpToken } from '@/lib/gbp-token'

// Publie (ou met à jour) la réponse de l'artisan à un avis Google.
// reviewName = chemin complet de l'avis : accounts/X/locations/Y/reviews/Z
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { reviewName, comment } = await req.json().catch(() => ({}))
  if (!reviewName || !comment?.trim()) return NextResponse.json({ error: 'bad-request' }, { status: 400 })

  const token = await getValidGbpToken(supabase, user.id)
  if (!token) return NextResponse.json({ error: 'not-connected' }, { status: 400 })

  const r = await fetch(`https://mybusiness.googleapis.com/v4/${reviewName}/reply`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ comment: comment.trim() }),
  })
  if (r.status === 403) return NextResponse.json({ error: 'no-access' }, { status: 403 })
  if (!r.ok) {
    console.error('[gbp-reply] échec:', await r.text())
    return NextResponse.json({ error: 'reply-failed' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
