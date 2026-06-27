import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const demande = String(formData.get('demande') || '').trim()
    const hauteurMur = String(formData.get('hauteur_mur') || '2.5')
    if (!file || file.size === 0) return NextResponse.json({ error: 'Plan manquant' }, { status: 400 })
    if (!demande) return NextResponse.json({ error: 'Décrivez les travaux à réaliser' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const type = file.type
    const name = (file.name || '').toLowerCase()

    // Charger la base de prix de l'artisan (pour matcher les prix réels + marge)
    const { data: cats } = await supabase
      .from('price_categories')
      .select('name, price_items(name, unit, unit_price_ht, is_active)')
      .eq('user_id', user.id)

    const priceLines: string[] = []
    for (const c of cats || []) {
      for (const it of ((c.price_items as any[]) || []).filter(i => i.is_active)) {
        priceLines.push(`${c.name} > ${it.name} | ${it.unit} | ${it.unit_price_ht}€ HT`)
      }
    }
    const baseDePrix = priceLines.length
      ? priceLines.slice(0, 400).join('\n')
      : '(aucune base de prix renseignée — estime des prix de marché réalistes et marque-les comme "estime")'

    // Construire le contenu visuel (plan)
    let planBlock: any
    if (type === 'application/pdf' || name.endsWith('.pdf')) {
      planBlock = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buffer.toString('base64') } }
    } else if (type.startsWith('image/')) {
      const mt = (type === 'image/png' ? 'image/png' : type === 'image/webp' ? 'image/webp' : 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp'
      planBlock = { type: 'image', source: { type: 'base64', media_type: mt, data: buffer.toString('base64') } }
    } else {
      return NextResponse.json({ error: 'Le plan doit être un PDF ou une image (PNG/JPG).' }, { status: 415 })
    }

    const prompt = buildPrompt(demande, hauteurMur, baseDePrix)

    let message: Awaited<ReturnType<typeof anthropic.messages.create>>
    try {
      message = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 12000,
        messages: [{ role: 'user', content: [planBlock, { type: 'text', text: prompt }] }],
      })
    } catch (apiErr: any) {
      console.error('Anthropic API error (plan):', apiErr)
      const raw = apiErr?.message ?? ''
      let msg = 'Impossible d\'analyser le plan — réessayez.'
      if (raw.includes('credit balance') || raw.includes('billing')) msg = 'Crédits API épuisés. Rechargez sur console.anthropic.com.'
      else if (raw.includes('rate_limit')) msg = 'Limite de débit atteinte — réessayez dans quelques secondes.'
      return NextResponse.json({ error: msg }, { status: 502 })
    }

    const rawText = message.content[0].type === 'text' ? message.content[0].text : ''
    const jsonMatch = rawText.match(/```json\n?([\s\S]*?)\n?```/) || rawText.match(/(\{[\s\S]*\})/)
    if (!jsonMatch) return NextResponse.json({ error: 'Analyse impossible — le plan est peut-être illisible.', raw: rawText.slice(0, 300) }, { status: 422 })

    let parsed: any
    try {
      parsed = JSON.parse(jsonMatch[1] || jsonMatch[0])
    } catch {
      return NextResponse.json({ error: 'Réponse IA invalide — réessayez.' }, { status: 422 })
    }

    return NextResponse.json({ success: true, data: parsed })
  } catch (err: any) {
    console.error('Plan analyse error:', err)
    return NextResponse.json({ error: err?.message || 'Erreur serveur' }, { status: 500 })
  }
}

function buildPrompt(demande: string, hauteurMur: string, baseDePrix: string): string {
  return `Tu es un métreur-chiffreur expert du bâtiment. Tu analyses un PLAN 2D coté (les cotes sont en CENTIMÈTRES sauf indication contraire : ex "405" = 4,05 m, "240/215" = largeur/hauteur d'une ouverture en cm).

DEMANDE DE L'ARTISAN (dictée, peut être approximative) :
"${demande}"

HYPOTHÈSE HAUTEUR SOUS PLAFOND : ${hauteurMur} m (sauf si le plan indique autre chose).

BASE DE PRIX DE L'ARTISAN (utilise EN PRIORITÉ ces prix pour chiffrer ; sinon estime un prix de marché réaliste) :
${baseDePrix}

TA MISSION :
1. Identifie la ou les pièces concernées par la demande (ex : salle de bain, séjour, cuisine...).
2. Lis les cotes du plan et calcule les métrés : surface au sol (m²), périmètre (ml), surface des murs (périmètre × hauteur, en déduisant grossièrement les ouvertures), longueur de plinthes (ml), etc.
3. Déduis les matériaux et prestations nécessaires à partir de la demande (placo, carrelage, peinture, plomberie, etc.) avec des QUANTITÉS chiffrées et réalistes (ajoute 10% de perte sur les matériaux au m²).
4. Chiffre chaque ligne avec un prix unitaire HT (issu de la base de prix si possible, sinon estimé).
5. Calcule les totaux, une estimation du coût matières + sous-traitance, et la MARGE estimée (bénéfice = total HT − coûts estimés).

Retourne UNIQUEMENT ce JSON (sans texte autour) :

\`\`\`json
{
  "comprehension": "Reformulation courte de ce que tu as compris de la demande",
  "hypotheses": ["Hauteur sous plafond 2,50 m", "Ouvertures déduites forfaitairement", "..."],
  "pieces": [
    { "nom": "Salle de bain", "surface_sol_m2": 0, "perimetre_ml": 0, "surface_murs_m2": 0 }
  ],
  "lignes": [
    {
      "categorie": "Carrelage",
      "designation": "Pose carrelage sol",
      "unite": "m2",
      "quantite": 0,
      "prix_unitaire_ht": 0,
      "total_ht": 0,
      "source_prix": "base",
      "cout_unitaire_estime": 0
    }
  ],
  "totaux": {
    "total_ht": 0,
    "cout_matieres_estime": 0,
    "cout_main_oeuvre_estime": 0,
    "marge_estimee_eur": 0,
    "marge_estimee_pct": 0
  },
  "remarques": ["Points d'attention, cotes manquantes, éléments à vérifier sur place"]
}
\`\`\`

RÈGLES :
- "source_prix" = "base" si le prix vient de la base fournie, "estime" sinon.
- "cout_unitaire_estime" = ton estimation du coût de revient HT (matière + éventuelle sous-traitance) pour cette ligne, sert au calcul de marge.
- unite : uniquement m2, ml, u, forfait, h, j, piece.
- Tous les nombres sont des nombres purs (pas de symbole €, pas de texte).
- marge_estimee_pct = marge_estimee_eur / total_ht × 100, arrondi.
- Si une cote essentielle manque, fais une hypothèse raisonnable et signale-la dans "remarques".
- Sois précis et réaliste : c'est un vrai chiffrage de chantier.`
}
