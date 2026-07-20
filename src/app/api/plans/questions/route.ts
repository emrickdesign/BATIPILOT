import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/**
 * Passe 1 : l'IA lit le plan et génère les questions qui comptent POUR CE PLAN.
 * Bien plus utile qu'un questionnaire figé — ça s'adapte tout seul au métier et
 * au type de chantier, sans maintenir une liste par corps d'état.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const demande = String(formData.get('demande') || '').trim()
    if (!file || file.size === 0) return NextResponse.json({ error: 'Plan manquant' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const type = file.type
    const name = (file.name || '').toLowerCase()

    let planBlock: Anthropic.ContentBlockParam
    if (type === 'application/pdf' || name.endsWith('.pdf')) {
      planBlock = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buffer.toString('base64') } }
    } else if (type.startsWith('image/')) {
      const mt = (type === 'image/png' ? 'image/png' : type === 'image/webp' ? 'image/webp' : 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp'
      planBlock = { type: 'image', source: { type: 'base64', media_type: mt, data: buffer.toString('base64') } }
    } else {
      return NextResponse.json({ error: 'Le plan doit être un PDF ou une image (PNG/JPG).' }, { status: 415 })
    }

    // Les catégories de prix révèlent le métier de l'artisan sans lui demander
    const { data: cats } = await supabase.from('price_categories').select('name').eq('user_id', user.id).limit(30)
    const metier = (cats || []).map(c => c.name).join(', ')

    const prompt = `Tu es un métreur-chiffreur expert du bâtiment. On te montre un PLAN 2D coté (cotes en CENTIMÈTRES sauf indication contraire).

${demande ? `PREMIÈRE INDICATION DE L'ARTISAN : "${demande}"` : "L'artisan n'a encore rien précisé."}
${metier ? `SON MÉTIER (déduit de ses catégories de prix) : ${metier}` : ''}

MISSION : ne chiffre RIEN pour l'instant. Lis le plan, puis pose les questions
INDISPENSABLES pour pouvoir chiffrer juste ensuite.

Règles pour les questions :
- 3 à 6 questions maximum, les plus déterminantes pour le prix.
- Chacune doit être CONCRÈTE et ancrée dans ce plan précis (cite les pièces et
  les surfaces que tu as lues), jamais générique.
- Vise ce qui change vraiment le chiffrage : dépose de l'existant, hauteur de
  faïence, qualité des matériaux, évacuations/réseaux à créer, état du support,
  accès et étage.
- Adapte-toi au métier de l'artisan s'il est connu.
- Formule-les comme à l'oral, en tutoyant l'artisan, courtes.

Retourne UNIQUEMENT ce JSON :

\`\`\`json
{
  "lecture": "Ce que tu vois sur le plan, en 1 à 2 phrases",
  "pieces_detectees": ["Salle de bain 6,2 m²", "Séjour 24 m²"],
  "questions": [
    { "question": "Le carrelage mural monte jusqu'où dans la salle de bain ?", "exemple": "Ex : 1,20 m ou toute hauteur" }
  ]
}
\`\`\``

    let message
    try {
      message = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        messages: [{ role: 'user', content: [planBlock, { type: 'text', text: prompt }] }],
      })
    } catch (apiErr) {
      console.error('Anthropic API error (questions plan):', apiErr)
      const raw = (apiErr as Error)?.message ?? ''
      let msg = 'Impossible de lire le plan — réessayez.'
      if (raw.includes('credit balance') || raw.includes('billing')) msg = 'Crédits API épuisés. Rechargez sur console.anthropic.com.'
      else if (raw.includes('rate_limit')) msg = 'Limite de débit atteinte — réessayez dans quelques secondes.'
      return NextResponse.json({ error: msg }, { status: 502 })
    }

    const rawText = message.content[0].type === 'text' ? message.content[0].text : ''
    const jsonMatch = rawText.match(/```json\n?([\s\S]*?)\n?```/) || rawText.match(/(\{[\s\S]*\})/)
    if (!jsonMatch) return NextResponse.json({ error: 'Plan illisible — passez directement au chiffrage.' }, { status: 422 })

    let parsed: { lecture?: string; pieces_detectees?: unknown[]; questions?: unknown[] }
    try {
      parsed = JSON.parse(jsonMatch[1] || jsonMatch[0])
    } catch {
      return NextResponse.json({ error: 'Réponse IA invalide — passez directement au chiffrage.' }, { status: 422 })
    }

    const questions = Array.isArray(parsed.questions)
      ? parsed.questions.slice(0, 6).map(q => {
          const o = (q || {}) as { question?: unknown; exemple?: unknown }
          return { question: String(o.question || ''), exemple: String(o.exemple || '') }
        }).filter(q => q.question)
      : []

    return NextResponse.json({
      success: true,
      lecture: String(parsed.lecture || ''),
      pieces_detectees: Array.isArray(parsed.pieces_detectees) ? parsed.pieces_detectees.map(String) : [],
      questions,
    })
  } catch (err) {
    console.error('Plan questions error:', err)
    return NextResponse.json({ error: (err as Error)?.message || 'Erreur serveur' }, { status: 500 })
  }
}
