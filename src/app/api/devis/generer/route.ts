import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { tradeLabel } from '@/lib/trades'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const UNITS = ['m2', 'ml', 'u', 'forfait', 'h', 'j', 'piece'] as const
type Unit = typeof UNITS[number]

interface GenLine {
  category: string
  designation: string
  description: string
  quantity: number
  unit: Unit
  unit_price_ht: number
  vat_rate: number
}

// Génère des lignes de devis à partir d'une description libre (texte/vocal),
// ancrées sur le métier de l'artisan ET sur sa base de prix réelle.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const description = String(body?.description || '').trim()
    if (description.length < 8) {
      return NextResponse.json({ error: 'Décrivez les travaux en quelques mots.' }, { status: 400 })
    }
    const vatDefault = Number(body?.vat_default) || 10

    // Métier de l'entreprise (personnalisation du chiffrage).
    const { data: company } = await supabase
      .from('companies')
      .select('trade, secondary_trades, default_vat_rate')
      .eq('user_id', user.id)
      .maybeSingle()
    const metiers = [company?.trade, ...(Array.isArray(company?.secondary_trades) ? company!.secondary_trades : [])]
      .map(t => tradeLabel(t)).filter(Boolean)
    const metierLabel = metiers.length ? metiers.join(', ') : 'artisan du bâtiment (tous corps d’état)'
    const vat = Number(company?.default_vat_rate) || vatDefault

    // Base de prix réelle de l'artisan (prix de vente + coût de revient si connu).
    const { data: cats } = await supabase
      .from('price_categories')
      .select('name, price_items(name, unit, unit_price_ht, supplier_cost, is_active)')
      .eq('user_id', user.id)

    const priceLines: string[] = []
    for (const c of cats || []) {
      const items = (c.price_items as { name: string; unit: string; unit_price_ht: number; supplier_cost: number | null; is_active: boolean }[]) || []
      for (const it of items.filter(i => i.is_active)) {
        priceLines.push(`${c.name} > ${it.name} | ${it.unit} | vente ${it.unit_price_ht}€ HT`)
      }
    }
    const baseDePrix = priceLines.length
      ? priceLines.slice(0, 400).join('\n')
      : '(aucune base de prix renseignée — estime des prix de marché réalistes)'

    const prompt = buildPrompt(description, metierLabel, baseDePrix, vat)

    let message: Awaited<ReturnType<typeof anthropic.messages.create>>
    try {
      message = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
      })
    } catch (apiErr: unknown) {
      console.error('Anthropic API error (devis/generer):', apiErr)
      const raw = apiErr instanceof Error ? apiErr.message : String(apiErr)
      let msg = 'Génération impossible — réessayez.'
      if (raw.includes('credit balance') || raw.includes('billing')) msg = 'Crédits API épuisés. Rechargez sur console.anthropic.com.'
      else if (raw.includes('rate_limit')) msg = 'Limite de débit atteinte — réessayez dans quelques secondes.'
      return NextResponse.json({ error: msg }, { status: 502 })
    }

    const rawText = message.content[0]?.type === 'text' ? message.content[0].text : ''
    const jsonMatch = rawText.match(/```json\n?([\s\S]*?)\n?```/) || rawText.match(/(\{[\s\S]*\})/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Réponse IA illisible — reformulez la demande.' }, { status: 422 })
    }
    let parsed: { title?: unknown; comprehension?: unknown; lignes?: unknown }
    try {
      parsed = JSON.parse(jsonMatch[1] || jsonMatch[0])
    } catch {
      return NextResponse.json({ error: 'Réponse IA invalide — réessayez.' }, { status: 422 })
    }

    const lignes = normalizeLines(parsed?.lignes, vat)
    if (!lignes.length) {
      return NextResponse.json({ error: 'Aucune prestation générée — précisez la demande.' }, { status: 422 })
    }

    return NextResponse.json({
      success: true,
      title: typeof parsed?.title === 'string' ? parsed.title.slice(0, 140) : '',
      comprehension: typeof parsed?.comprehension === 'string' ? parsed.comprehension.slice(0, 300) : '',
      lignes,
    })
  } catch (err: unknown) {
    console.error('devis/generer error:', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

// Sanitize la sortie IA : bornes numériques, unités valides, champs texte tronqués.
function normalizeLines(input: unknown, vat: number): GenLine[] {
  if (!Array.isArray(input)) return []
  const out: GenLine[] = []
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue
    const l = raw as Record<string, unknown>
    const designation = String(l.designation || '').trim().slice(0, 200)
    if (!designation) continue
    const unitRaw = String(l.unit || l.unite || 'u')
    const unit = (UNITS as readonly string[]).includes(unitRaw) ? unitRaw as Unit : 'u'
    const quantity = clampNum(l.quantity ?? l.quantite, 0, 100000, 1)
    const unit_price_ht = clampNum(l.unit_price_ht ?? l.prix_unitaire_ht, 0, 1000000, 0)
    const vatRaw = clampNum(l.vat_rate ?? l.tva, 0, 20, vat)
    out.push({
      category: String(l.category || l.categorie || '').trim().slice(0, 100),
      designation,
      description: String(l.description || '').trim().slice(0, 300),
      quantity,
      unit,
      unit_price_ht,
      vat_rate: [5.5, 10, 20].includes(vatRaw) ? vatRaw : vat,
    })
    if (out.length >= 60) break
  }
  return out
}

function clampNum(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function buildPrompt(description: string, metier: string, baseDePrix: string, vat: number): string {
  return `Tu es un métreur-chiffreur expert du bâtiment qui prépare un devis pour un artisan dont le métier est : ${metier}.

DEMANDE DE L'ARTISAN (dictée ou tapée, peut être approximative) :
"${description}"

BASE DE PRIX DE L'ARTISAN (utilise EN PRIORITÉ ces prix ; sinon estime un prix de marché réaliste) :
${baseDePrix}

TA MISSION :
1. Comprends les travaux décrits et découpe-les en prestations concrètes et vendables.
2. Pour chaque prestation, donne une quantité réaliste : si l'artisan a donné des dimensions/surfaces, calcule les métrés (ajoute ~10% de perte sur les matériaux au m²). Sinon, mets une quantité de 1 et signale-le.
3. Chiffre chaque ligne avec un prix unitaire HT (issu de la base si une prestation correspond, sinon estimé au prix du marché).
4. Reste dans le périmètre du métier de l'artisan ; n'ajoute pas de corps d'état hors sujet.

Retourne UNIQUEMENT ce JSON (sans texte autour) :

\`\`\`json
{
  "title": "Objet court du devis (ex: Rénovation salle de bain)",
  "comprehension": "Reformulation courte de ce que tu as compris",
  "lignes": [
    {
      "category": "Carrelage",
      "designation": "Pose carrelage sol",
      "description": "Précision optionnelle",
      "quantity": 0,
      "unit": "m2",
      "unit_price_ht": 0,
      "vat_rate": ${vat}
    }
  ]
}
\`\`\`

RÈGLES :
- "unit" uniquement parmi : m2, ml, u, forfait, h, j, piece.
- "vat_rate" parmi 5.5, 10 ou 20 (par défaut ${vat}).
- Tous les nombres sont des nombres purs (pas de symbole €, pas de texte).
- N'invente pas de dimensions : si une quantité est inconnue, mets 1 et précise-le dans la description.
- Sois précis, réaliste et directement exploitable : c'est un vrai devis de chantier.`
}
