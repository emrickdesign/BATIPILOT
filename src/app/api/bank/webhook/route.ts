import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { syncUserBank } from '@/lib/bank/sync'
import { verifyWebhookSignature, resolveExternalUserId } from '@/lib/bank/bridge'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Webhook Bridge : appelé par Bridge dès qu'un compte est rafraîchi (item.refreshed, etc.).
// On vérifie la signature, on retrouve l'utilisateur, puis on relance sa synchro bancaire
// → les virements et l'état payé/impayé des factures sont à jour en quasi temps réel.
export async function POST(req: NextRequest) {
  const secret = process.env.BRIDGE_WEBHOOK_SECRET
  const raw = await req.text() // corps BRUT obligatoire pour vérifier la signature.
  const sig = req.headers.get('BridgeApi-Signature')

  if (!secret || !verifyWebhookSignature(raw, sig, secret)) {
    return NextResponse.json({ error: 'bad_signature' }, { status: 401 })
  }

  let evt: { type?: string; content?: { user_uuid?: string; item_id?: number; status?: number } }
  try { evt = JSON.parse(raw) } catch { return NextResponse.json({ error: 'bad_json' }, { status: 400 }) }

  // Ping de test envoyé depuis le dashboard Bridge → on répond juste OK.
  if (evt.type === 'TEST_EVENT') return NextResponse.json({ ok: true, test: true })

  const uuid = evt.content?.user_uuid
  if (!uuid) return NextResponse.json({ ok: true, ignored: 'no_user' })

  const externalId = await resolveExternalUserId(uuid)
  if (!externalId) return NextResponse.json({ ok: true, ignored: 'unknown_user' })

  try {
    const supabase = createServiceClient()
    const res = await syncUserBank(supabase, externalId)
    return NextResponse.json({ ok: true, type: evt.type, ...res })
  } catch (e) {
    // On renvoie 200 pour éviter que Bridge ne rejoue l'événement en boucle ;
    // le cron quotidien rattrapera de toute façon.
    return NextResponse.json({ ok: true, deferred: (e as Error).message })
  }
}
