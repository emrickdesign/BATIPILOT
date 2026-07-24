import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { normalizeVisitResult } from '@/lib/visites'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const MAX_PHOTOS = 8

type ImageBlock = { type: 'image'; source: { type: 'base64'; media_type: 'image/jpeg' | 'image/png' | 'image/webp'; data: string } }

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

    const { visitId } = await req.json().catch(() => ({ visitId: '' }))
    if (!visitId) return NextResponse.json({ error: 'Visite manquante' }, { status: 400 })

    const { data: visit } = await supabase.from('site_visits')
      .select('id, title, address, transcript, notes').eq('id', visitId).eq('user_id', user.id).single()
    if (!visit) return NextResponse.json({ error: 'Visite introuvable' }, { status: 404 })

    const { data: photos } = await supabase.from('site_visit_photos')
      .select('storage_path, caption').eq('visit_id', visitId).eq('user_id', user.id).order('sort_order').limit(MAX_PHOTOS)

    const notes = [String(visit.transcript || ''), String(visit.notes || '')].filter(Boolean).join('\n').trim()
    if (!(photos && photos.length) && !notes) {
      return NextResponse.json({ error: 'Ajoutez au moins une photo ou une note avant d\'analyser.' }, { status: 400 })
    }

    // Télécharge les photos (bucket privé) → blocs image base64.
    const imageBlocks: ImageBlock[] = []
    const captions: string[] = []
    for (const p of photos || []) {
      const { data: blob } = await supabase.storage.from('documents').download(p.storage_path as string)
      if (!blob) continue
      const buf = Buffer.from(await blob.arrayBuffer())
      const mt = (blob.type === 'image/png' ? 'image/png' : blob.type === 'image/webp' ? 'image/webp' : 'image/jpeg') as ImageBlock['source']['media_type']
      imageBlocks.push({ type: 'image', source: { type: 'base64', media_type: mt, data: buf.toString('base64') } })
      captions.push(p.caption ? String(p.caption) : '')
    }

    // Base de prix de l'artisan (pour proposer ses vrais prix).
    const { data: cats } = await supabase.from('price_categories')
      .select('name, price_items(name, unit, unit_price_ht, is_active)').eq('user_id', user.id)
    const priceLines: string[] = []
    for (const c of cats || []) {
      for (const it of ((c.price_items as { name: string; unit: string; unit_price_ht: number; is_active: boolean }[]) || []).filter(i => i.is_active)) {
        priceLines.push(`${c.name} > ${it.name} | ${it.unit} | ${it.unit_price_ht}€ HT`)
      }
    }
    const baseDePrix = priceLines.length ? priceLines.slice(0, 400).join('\n') : '(aucune base de prix — estime des prix de marché réalistes, source_prix "estime")'

    const prompt = buildPrompt(String(visit.title || ''), notes, captions, baseDePrix, imageBlocks.length)

    let message: Awaited<ReturnType<typeof anthropic.messages.create>>
    try {
      message = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 6000,
        messages: [{ role: 'user', content: [...imageBlocks, { type: 'text', text: prompt }] }],
      })
    } catch (apiErr: unknown) {
      const raw = apiErr instanceof Error ? apiErr.message : ''
      let msg = 'Analyse impossible — réessayez.'
      if (raw.includes('credit balance') || raw.includes('billing')) msg = 'Crédits API épuisés. Rechargez sur console.anthropic.com.'
      else if (raw.includes('rate_limit')) msg = 'Limite de débit atteinte — réessayez dans quelques secondes.'
      return NextResponse.json({ error: msg }, { status: 502 })
    }

    const rawText = message.content[0]?.type === 'text' ? message.content[0].text : ''
    const jsonMatch = rawText.match(/```json\n?([\s\S]*?)\n?```/) || rawText.match(/(\{[\s\S]*\})/)
    if (!jsonMatch) return NextResponse.json({ error: 'Analyse illisible — réessayez.' }, { status: 422 })
    let parsed: unknown
    try { parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]) } catch { return NextResponse.json({ error: 'Réponse IA invalide — réessayez.' }, { status: 422 }) }

    const result = normalizeVisitResult(parsed)
    await supabase.from('site_visits').update({ ai_result: result, analyzed_at: new Date().toISOString(), status: 'analyse' }).eq('id', visitId).eq('user_id', user.id)

    return NextResponse.json({ success: true, data: result })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur serveur' }, { status: 500 })
  }
}

function buildPrompt(title: string, notes: string, captions: string[], baseDePrix: string, nbPhotos: number): string {
  const capBlock = captions.some(Boolean)
    ? `\nLÉGENDES DES PHOTOS (dans l'ordre) :\n${captions.map((c, i) => `Photo ${i + 1} : ${c || '(sans légende)'}`).join('\n')}\n`
    : ''
  const notesBlock = notes ? `\nNOTES DE L'ARTISAN (dictées sur place, peuvent être approximatives) :\n"${notes}"\n` : ''
  return `Tu es un artisan du bâtiment expérimenté qui prépare un devis après une VISITE DE REPÉRAGE chez un client. Tu disposes de ${nbPhotos} photo(s) prise(s) sur place et des notes de l'artisan.

CHANTIER : "${title || 'Visite de repérage'}"
${notesBlock}${capBlock}
BASE DE PRIX DE L'ARTISAN (utilise ses prix en priorité, sinon estime le marché) :
${baseDePrix}

TA MISSION — à partir des photos ET des notes :
1. Décris ce que tu observes d'important pour chiffrer (état existant, contraintes, surfaces visibles, matériaux en place).
2. Déduis les travaux probables et propose des postes de devis avec des quantités ESTIMÉES (elles seront affinées, reste prudent).
3. Signale les points d'attention / risques (accès difficile, amiante/plomb possible sur bâti ancien, humidité, réseaux, reprise de support…).
4. Liste les questions à poser au client avant de finaliser le devis.

Réponds UNIQUEMENT avec ce JSON (aucun texte autour) :

\`\`\`json
{
  "resume": "Synthèse en 1-2 phrases de la visite et des travaux envisagés",
  "observations": [ { "element": "Sol séjour", "detail": "carrelage ancien fissuré, ~20 m²" } ],
  "travaux_suggeres": [
    { "categorie": "Carrelage", "designation": "Dépose ancien carrelage", "unite": "m2", "quantite": 0, "prix_unitaire_ht": 0, "source_prix": "estime" }
  ],
  "points_attention": ["Bâti avant 1997 : diagnostic amiante à prévoir", "..."],
  "questions_client": ["Souhaitez-vous conserver la faïence existante ?", "..."],
  "total_ht": 0
}
\`\`\`

RÈGLES :
- unite : uniquement m2, ml, u, forfait, h, j, piece.
- Nombres purs (pas de € ni de texte). total_ht = somme des quantite × prix_unitaire_ht.
- source_prix = "base" si le prix vient de la base fournie, sinon "estime".
- Sans photo exploitable, appuie-toi sur les notes. Reste réaliste et prudent : c'est une estimation de repérage, pas un chiffrage définitif.`
}
