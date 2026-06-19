import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File
  if (!file) return NextResponse.json({ error: 'Fichier manquant' }, { status: 400 })

  const bytes = await file.arrayBuffer()
  const base64 = Buffer.from(bytes).toString('base64')
  const isPDF = file.type === 'application/pdf'

  let content: Anthropic.MessageParam['content']

  if (isPDF) {
    content = [
      {
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: base64 },
      } as any,
      {
        type: 'text',
        text: PROMPT_EXTRACTION_PRIX,
      },
    ]
  } else {
    const mediaType = file.type as 'image/jpeg' | 'image/png' | 'image/webp'
    content = [
      {
        type: 'image',
        source: { type: 'base64', media_type: mediaType, data: base64 },
      },
      { type: 'text', text: PROMPT_EXTRACTION_PRIX },
    ]
  }

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{ role: 'user', content }],
  })

  const rawText = message.content[0].type === 'text' ? message.content[0].text : ''

  // Extraire le JSON
  const jsonMatch = rawText.match(/```json\n?([\s\S]*?)\n?```/) || rawText.match(/(\{[\s\S]*\}|\[[\s\S]*\])/)
  if (!jsonMatch) return NextResponse.json({ error: 'Impossible d\'analyser le document', raw: rawText }, { status: 422 })

  let parsed: { categories: Array<{ name: string; items: Array<{ name: string; unit: string; price: number; description?: string }> }> }
  try {
    parsed = JSON.parse(jsonMatch[1] || jsonMatch[0])
  } catch {
    return NextResponse.json({ error: 'Format JSON invalide', raw: rawText }, { status: 422 })
  }

  return NextResponse.json({ success: true, data: parsed })
}

const PROMPT_EXTRACTION_PRIX = `Tu analyses un document de prix/tarifs d'un artisan en bâtiment (devis, bordereau de prix, liste tarifaire, Excel, Word, etc.).

Extrais TOUTES les prestations/lignes de prix que tu trouves.

Retourne UNIQUEMENT ce JSON (sans texte avant ou après) :

\`\`\`json
{
  "categories": [
    {
      "name": "Nom de la catégorie (ex: Peinture, Carrelage, Plomberie...)",
      "items": [
        {
          "name": "Nom exact de la prestation",
          "description": "Description si présente, sinon null",
          "unit": "m2 ou ml ou u ou forfait ou h ou j ou piece",
          "price": 0.00
        }
      ]
    }
  ]
}
\`\`\`

Règles :
- Si pas de catégorie explicite, regroupe par type de travaux
- Pour l'unité, utilise uniquement : m2, ml, u, forfait, h, j, piece
- Si le prix est manquant, mets 0
- Si le document contient des infos entreprise (nom, adresse, SIRET), ignore-les — ne prends que les lignes de prix
- Inclus TOUTES les lignes, même sans prix
- Ne commente pas, retourne uniquement le JSON`
