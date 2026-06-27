import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import mammoth from 'mammoth'
import * as XLSX from 'xlsx'
import { parseSheetRows, mergeCategories, type ParsedCategory } from '@/lib/price-parser'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const XLSX_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
]

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file || file.size === 0) return NextResponse.json({ error: 'Fichier manquant ou vide' }, { status: 400 })

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const name = (file.name || '').toLowerCase()
    const type = file.type

    // ── Excel : on tente d'abord une lecture déterministe des tableaux colonnés.
    //    Fiable et instantané même pour des centaines de lignes (pas de limite de tokens IA).
    if (XLSX_TYPES.includes(type) || name.endsWith('.xlsx') || name.endsWith('.xls')) {
      const wb = XLSX.read(buffer, { type: 'buffer' })
      const structured: ParsedCategory[] = []
      const leftover: string[] = []
      for (const sn of wb.SheetNames) {
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: false, defval: '' }) as any[][]
        const parsed = parseSheetRows(rows)
        if (parsed) structured.push(...parsed)
        else {
          const csv = XLSX.utils.sheet_to_csv(wb.Sheets[sn])
          if (csv.trim().length > 40) leftover.push(`--- Feuille : ${sn} ---\n${csv}`)
        }
      }
      if (structured.length) {
        return NextResponse.json({ success: true, data: { categories: mergeCategories(structured) }, method: 'structured' })
      }
      // Aucune colonne reconnue → on laisse l'IA lire le contenu brut
      const text = leftover.join('\n\n')
      if (!text.trim()) return NextResponse.json({ error: 'Fichier Excel vide' }, { status: 422 })
      return await analyseWithAI([{ type: 'text', text: `${PROMPT_EXTRACTION_PRIX}\n\n=== CONTENU DU FICHIER EXCEL (CSV) ===\n${text.slice(0, 80000)}` }])
    }

    // ── CSV : tableau → parse déterministe, sinon IA
    if (type === 'text/csv' || name.endsWith('.csv')) {
      const csvText = buffer.toString('utf-8')
      const rows = csvText.split(/\r?\n/).map(line => line.split(/[;,\t]/))
      const parsed = parseSheetRows(rows)
      if (parsed) return NextResponse.json({ success: true, data: { categories: mergeCategories(parsed) }, method: 'structured' })
      return await analyseWithAI([{ type: 'text', text: `${PROMPT_EXTRACTION_PRIX}\n\n=== CONTENU DU FICHIER ===\n${csvText.slice(0, 80000)}` }])
    }

    let content: Anthropic.MessageParam['content']

    if (type === 'application/pdf') {
      // PDF natif → Claude lit directement (garde la mise en page)
      content = [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buffer.toString('base64') } } as any,
        { type: 'text', text: PROMPT_EXTRACTION_PRIX },
      ]
    } else if (type.startsWith('image/')) {
      const mediaType = (type === 'image/png' ? 'image/png' : type === 'image/webp' ? 'image/webp' : 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp'
      content = [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: buffer.toString('base64') } },
        { type: 'text', text: PROMPT_EXTRACTION_PRIX },
      ]
    } else if (type === DOCX_TYPE || name.endsWith('.docx') || name.endsWith('.doc')) {
      // Word → extraction du texte puis IA (document en prose, pas de colonnes)
      const { value: text } = await mammoth.extractRawText({ buffer })
      if (!text.trim()) return NextResponse.json({ error: 'Document Word vide ou illisible' }, { status: 422 })
      return await analyseWithAI([{ type: 'text', text: `${PROMPT_EXTRACTION_PRIX}\n\n=== CONTENU DU DOCUMENT WORD ===\n${text.slice(0, 80000)}` }])
    } else if (type === 'text/plain' || name.endsWith('.txt')) {
      const text = buffer.toString('utf-8')
      return await analyseWithAI([{ type: 'text', text: `${PROMPT_EXTRACTION_PRIX}\n\n=== CONTENU DU FICHIER ===\n${text.slice(0, 80000)}` }])
    } else {
      return NextResponse.json({ error: 'Format non supporté. Utilisez PDF, Word, Excel, CSV, JPG ou PNG.' }, { status: 415 })
    }

    return await analyseWithAI(content)
  } catch (err: any) {
    console.error('Prix import error:', err)
    return NextResponse.json({ error: err?.message || 'Erreur serveur' }, { status: 500 })
  }
}

// Appel IA + parsing JSON robuste, factorisé pour tous les formats non structurés.
async function analyseWithAI(content: Anthropic.MessageParam['content']): Promise<NextResponse> {
  let message: Awaited<ReturnType<typeof anthropic.messages.create>>
  try {
    message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 16000,
      messages: [{ role: 'user', content }],
    })
  } catch (apiErr: any) {
    console.error('Anthropic API error (prix import):', apiErr)
    const raw = apiErr?.message ?? ''
    let msg = 'Impossible d\'analyser ce document — réessayez.'
    if (raw.includes('credit balance') || raw.includes('billing')) msg = 'Crédits API épuisés. Rechargez sur console.anthropic.com.'
    else if (raw.includes('rate_limit')) msg = 'Limite de débit atteinte — réessayez dans quelques secondes.'
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  const rawText = message.content[0].type === 'text' ? message.content[0].text : ''
  const jsonMatch = rawText.match(/```json\n?([\s\S]*?)\n?```/) || rawText.match(/(\{[\s\S]*\}|\[[\s\S]*\])/)
  if (!jsonMatch) return NextResponse.json({ error: 'Aucun prix détecté dans ce document.', raw: rawText.slice(0, 300) }, { status: 422 })

  let parsed: { categories: ParsedCategory[] }
  try {
    parsed = JSON.parse(jsonMatch[1] || jsonMatch[0])
  } catch {
    return NextResponse.json({ error: 'Réponse IA invalide — réessayez.' }, { status: 422 })
  }
  if (!parsed.categories?.length) {
    return NextResponse.json({ error: 'Aucune prestation trouvée dans ce document.' }, { status: 422 })
  }
  return NextResponse.json({ success: true, data: { categories: mergeCategories(parsed.categories) }, method: 'ai' })
}

const PROMPT_EXTRACTION_PRIX = `Tu analyses un document de prix/tarifs d'un artisan ou prestataire (devis, bordereau de prix, liste tarifaire, tableau Excel, document Word, même mal structuré ou approximatif).

Ta mission : extraire TOUTES les prestations et tarifs, et les RANGER intelligemment dans des CATÉGORIES claires et cohérentes par type de travaux ou de service.

Retourne UNIQUEMENT ce JSON (sans texte avant ou après) :

\`\`\`json
{
  "categories": [
    {
      "name": "Nom court et clair de la catégorie",
      "items": [
        {
          "name": "Nom exact de la prestation",
          "description": "Précision si présente, sinon null",
          "unit": "m2 ou ml ou u ou forfait ou h ou j ou piece",
          "price": 0.00
        }
      ]
    }
  ]
}
\`\`\`

Règles de catégorisation (IMPORTANT) :
- Regroupe les prestations par grandes familles logiques. Exemples pour le bâtiment : "Préparation / Protection", "Démolition", "Peinture", "Carrelage", "Plomberie", "Électricité", "Menuiserie", "Maçonnerie", "Main d'œuvre", "Déplacements / Forfaits".
- Adapte les catégories au MÉTIER détecté dans le document (un coiffeur, un mécanicien, un jardinier auront des catégories différentes).
- Si le document n'a aucune structure, déduis toi-même les catégories à partir du sens des lignes.
- Une catégorie doit contenir au moins une prestation. Ne crée pas de catégorie fourre-tout "Divers" sauf si vraiment nécessaire.

Règles sur les lignes :
- unit : utilise UNIQUEMENT m2, ml, u, forfait, h, j, piece (déduis l'unité la plus logique : un tarif horaire → h, une journée → j, au mètre carré → m2, au mètre linéaire → ml, à l'unité → u ou piece, un prix global → forfait).
- price : nombre seul (ex: 28.50). Si le prix est manquant ou illisible, mets 0.
- Ignore les infos entreprise (nom, adresse, SIRET, mentions légales) — ne garde que les prestations.
- Inclus TOUTES les lignes de prix, même approximatives.
- Ne commente pas, retourne uniquement le JSON.`
