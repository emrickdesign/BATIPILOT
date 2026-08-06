import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Résume/clarifie une note de visite SANS rien ajouter ni retirer — juste plus clair et concis.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

    const { text } = await req.json().catch(() => ({ text: '' }))
    const note = String(text || '').trim()
    if (!note) return NextResponse.json({ error: 'Note vide' }, { status: 400 })

    const prompt = `Voici une note de visite de chantier prise sur place (souvent dictée, en vrac).
Réécris-la de façon CLAIRE et CONCISE, bien structurée, SANS rien ajouter ni inventer, et SANS retirer aucune information (garde toutes les mesures, contraintes, souhaits du client, accès, etc.).
Corrige juste la formulation et l'organisation. Utilise des puces courtes si pertinent.
Réponds UNIQUEMENT avec le texte réécrit, sans préambule ni commentaire.

NOTE :
"""
${note}
"""`

    let message: Awaited<ReturnType<typeof anthropic.messages.create>>
    try {
      message = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
      })
    } catch (apiErr: unknown) {
      const raw = apiErr instanceof Error ? apiErr.message : ''
      let msg = 'Résumé impossible — réessayez.'
      if (raw.includes('credit balance') || raw.includes('billing')) msg = 'Crédits API épuisés.'
      else if (raw.includes('rate_limit')) msg = 'Limite atteinte — réessayez dans quelques secondes.'
      return NextResponse.json({ error: msg }, { status: 502 })
    }

    const summary = message.content[0]?.type === 'text' ? message.content[0].text.trim() : ''
    if (!summary) return NextResponse.json({ error: 'Réponse vide' }, { status: 422 })
    return NextResponse.json({ success: true, summary })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur serveur' }, { status: 500 })
  }
}
