import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/**
 * Génère une base de prix de départ à partir d'une description du métier.
 * Pensé pour l'artisan qui « ne sait pas à quel prix il vend » : on part de SES
 * chiffres (coût horaire, marge voulue) plutôt que d'une moyenne nationale, et
 * on assume les fourchettes comme un point de départ à ajuster.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

    const body = await req.json().catch(() => null)
    const description = String(body?.description || '').trim()
    if (!description) return NextResponse.json({ error: 'Décrivez votre activité' }, { status: 400 })

    const coutHoraire = Number(body?.cout_horaire) || 0
    const margeCible = Number(body?.marge_cible) || 0

    // Ce qu'il a déjà : on ne veut pas lui proposer des doublons
    const { data: cats } = await supabase
      .from('price_categories')
      .select('name, price_items(name)')
      .eq('user_id', user.id)
    const existant = (cats || []).flatMap(c =>
      ((c.price_items as { name: string }[]) || []).map(i => `${c.name} > ${i.name}`)
    ).slice(0, 200)

    const ancrage = coutHoraire > 0
      ? `\nSON COÛT HORAIRE DE MAIN-D'ŒUVRE : ${coutHoraire} €/h${margeCible > 0 ? `\nSA MARGE CIBLE : ${margeCible}%` : ''}
Utilise-les pour ancrer les prix : prix de vente ≈ (temps de pose × ${coutHoraire} + fourniture) ÷ (1 − marge).
Indique le temps de pose retenu dans la description de chaque ligne.`
      : `\nIl n'a pas donné son coût horaire : propose des prix de marché français courants, en le signalant.`

    const dejaLa = existant.length
      ? `\nIL A DÉJÀ CES PRESTATIONS (ne les repropose pas) :\n${existant.join('\n')}`
      : ''

    const prompt = `Tu aides un artisan du bâtiment à construire sa base de prix de vente.

SON ACTIVITÉ (dictée, peut être approximative) :
"${description}"
${ancrage}${dejaLa}

MISSION : propose une base de prix de DÉPART, réaliste pour le marché français,
organisée en catégories cohérentes avec son métier.

RÈGLES :
- 4 à 8 catégories, 5 à 12 prestations par catégorie. Vise l'utile : les
  prestations qu'il facture vraiment souvent, pas un catalogue exhaustif.
- Ce sont des PRIX DE VENTE HT au client, fourniture et pose comprises sauf
  mention contraire dans la description.
- unite : uniquement m2, ml, u, forfait, h, j, piece.
- Les prix varient énormément selon les régions et les fournisseurs : reste dans
  des ordres de grandeur courants et rappelle-le dans "avertissement".
- description : courte, précise ce qui est inclus (et le temps de pose si tu as
  le coût horaire).

Retourne UNIQUEMENT ce JSON :

\`\`\`json
{
  "metier_compris": "Ce que tu as compris de son activité, en une phrase",
  "avertissement": "Une phrase sur le fait que ces prix sont un point de départ à ajuster",
  "categories": [
    {
      "name": "Plomberie",
      "items": [
        { "name": "Pose d'un mitigeur lavabo", "unit": "u", "price": 120, "description": "Fourniture non comprise — 1h de pose" }
      ]
    }
  ]
}
\`\`\``

    let message
    try {
      message = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 8000,
        messages: [{ role: 'user', content: prompt }],
      })
    } catch (apiErr) {
      console.error('Anthropic API error (générer prix):', apiErr)
      const raw = (apiErr as Error)?.message ?? ''
      let msg = 'Génération impossible — réessayez.'
      if (raw.includes('credit balance') || raw.includes('billing')) msg = 'Crédits API épuisés. Rechargez sur console.anthropic.com.'
      else if (raw.includes('rate_limit')) msg = 'Limite de débit atteinte — réessayez dans quelques secondes.'
      return NextResponse.json({ error: msg }, { status: 502 })
    }

    const rawText = message.content[0].type === 'text' ? message.content[0].text : ''
    const jsonMatch = rawText.match(/```json\n?([\s\S]*?)\n?```/) || rawText.match(/(\{[\s\S]*\})/)
    if (!jsonMatch) return NextResponse.json({ error: 'Réponse IA illisible — réessayez.' }, { status: 422 })

    let parsed: { metier_compris?: string; avertissement?: string; categories?: unknown[] }
    try {
      parsed = JSON.parse(jsonMatch[1] || jsonMatch[0])
    } catch {
      return NextResponse.json({ error: 'Réponse IA invalide — réessayez.' }, { status: 422 })
    }

    const UNITS = ['m2', 'ml', 'u', 'forfait', 'h', 'j', 'piece']
    const categories = (Array.isArray(parsed.categories) ? parsed.categories : []).map(c => {
      const cat = (c || {}) as { name?: unknown; items?: unknown[] }
      return {
        name: String(cat.name || 'Divers'),
        items: (Array.isArray(cat.items) ? cat.items : []).map(it => {
          const i = (it || {}) as { name?: unknown; unit?: unknown; price?: unknown; description?: unknown }
          const unit = String(i.unit || 'u')
          return {
            name: String(i.name || ''),
            unit: UNITS.includes(unit) ? unit : 'u',
            price: Number(i.price) || 0,
            description: String(i.description || ''),
            enabled: true,
          }
        }).filter(i => i.name),
      }
    }).filter(c => c.items.length > 0)

    return NextResponse.json({
      success: true,
      metier_compris: String(parsed.metier_compris || ''),
      avertissement: String(parsed.avertissement || ''),
      categories,
    })
  } catch (err) {
    console.error('Générer prix error:', err)
    return NextResponse.json({ error: (err as Error)?.message || 'Erreur serveur' }, { status: 500 })
  }
}
