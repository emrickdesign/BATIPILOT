import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { NextRequest, NextResponse } from 'next/server'
import { withinRateLimit, MAX_BODY_BYTES } from '@/lib/assistant/guard'
import { composeLines, normalizeLines, type DraftKind, type DraftLine } from '@/lib/assistant/devis'

export const dynamic = 'force-dynamic'
export const maxDuration = 60  // génération/modification IA des lignes (~15 s)

// Génère OU modifie les lignes d'un devis/facture en cours d'édition dans l'assistant.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

    const raw = await req.text()
    if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ error: 'Requête trop volumineuse.' }, { status: 413 })
    let body: Record<string, unknown> = {}
    try { body = JSON.parse(raw) } catch {}

    const service = createServiceClient()
    if (!(await withinRateLimit(service, user.id, 20))) {
      return NextResponse.json({ error: 'Trop de requêtes, patiente un instant.' }, { status: 429 })
    }

    const kind: DraftKind = body.kind === 'facture' ? 'facture' : 'devis'
    const instruction = String(body.instruction || '').trim()
    if (instruction.length < 4) return NextResponse.json({ error: 'Décris ce que tu veux en quelques mots.' }, { status: 400 })
    const existing = Array.isArray(body.lines) ? normalizeLines(body.lines, 10) as DraftLine[] : undefined

    try {
      const { title, lines } = await composeLines(supabase, user.id, { kind, instruction, lines: existing })
      return NextResponse.json({ title, lines })
    } catch (e) {
      const msg = (e as Error)?.message || ''
      if (/credit|billing/i.test(msg)) return NextResponse.json({ error: 'Crédits API épuisés.' }, { status: 502 })
      if (/rate_limit/i.test(msg)) return NextResponse.json({ error: 'Limite de débit — réessaie dans un instant.' }, { status: 502 })
      return NextResponse.json({ error: msg || 'Génération impossible.' }, { status: 422 })
    }
  } catch (err) {
    console.error('assistant/devis/compose error:', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
