import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { NextRequest, NextResponse } from 'next/server'
import { withinRateLimit, MAX_BODY_BYTES } from '@/lib/assistant/guard'
import { saveDevisDraft, normalizeLines, type DraftKind } from '@/lib/assistant/devis'

export const dynamic = 'force-dynamic'
export const maxDuration = 60  // enregistrement + envoi (Gmail) éventuel

// Enregistre le devis/facture composé dans l'assistant, et l'envoie au client si demandé.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

    const rawBody = await req.text()
    if (rawBody.length > MAX_BODY_BYTES) return NextResponse.json({ error: 'Requête trop volumineuse.' }, { status: 413 })
    let body: Record<string, unknown> = {}
    try { body = JSON.parse(rawBody) } catch {}

    const service = createServiceClient()
    if (!(await withinRateLimit(service, user.id, 30))) {
      return NextResponse.json({ error: 'Trop de requêtes, patiente un instant.' }, { status: 429 })
    }

    const kind: DraftKind = body.kind === 'facture' ? 'facture' : 'devis'
    const clientId = String(body.clientId || '')
    if (!clientId) return NextResponse.json({ error: 'Client manquant.' }, { status: 400 })
    const lines = normalizeLines(body.lines, 10)
    if (!lines.length) return NextResponse.json({ error: 'Ajoute au moins une prestation.' }, { status: 400 })

    let saved: { id: string; number: string; href: string }
    try {
      saved = await saveDevisDraft(supabase, user.id, {
        kind, clientId, title: String(body.title || ''), lines,
        depositPercent: body.depositPercent == null ? null : Number(body.depositPercent) || null,
        validDays: body.validDays ? Number(body.validDays) : undefined,
        dueDays: body.dueDays ? Number(body.dueDays) : undefined,
      })
    } catch (e) {
      return NextResponse.json({ error: (e as Error)?.message || 'Erreur enregistrement.' }, { status: 422 })
    }

    // Envoi optionnel : réutilise l'endpoint d'envoi existant (Gmail + signature en ligne),
    // en relayant les cookies de session de l'utilisateur.
    let sent = false
    let sendError: string | undefined
    if (body.send) {
      try {
        const endpoint = kind === 'facture' ? `/api/factures/${saved.id}/envoyer` : `/api/devis/${saved.id}/envoyer`
        const res = await fetch(new URL(endpoint, req.nextUrl.origin), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', cookie: req.headers.get('cookie') || '' },
        })
        if (res.ok) sent = true
        else { const d = await res.json().catch(() => ({})); sendError = d?.error || 'Envoi impossible.' }
      } catch { sendError = 'Envoi impossible.' }
    }

    return NextResponse.json({ ...saved, sent, sendError })
  } catch (err) {
    console.error('assistant/devis/save error:', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
