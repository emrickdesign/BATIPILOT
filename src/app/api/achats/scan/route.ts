import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { isSupplierDocType, normalizeScanned } from '@/lib/achats'
import type { SupplierDocType } from '@/types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const docType = String(formData.get('doc_type') || '')
    if (!file || file.size === 0) return NextResponse.json({ error: 'Document manquant' }, { status: 400 })
    if (!isSupplierDocType(docType)) return NextResponse.json({ error: 'Type de document invalide' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const type = file.type
    const name = (file.name || '').toLowerCase()

    let block: Anthropic.ContentBlockParam
    if (type === 'application/pdf' || name.endsWith('.pdf')) {
      block = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buffer.toString('base64') } }
    } else if (type.startsWith('image/')) {
      const mt = (type === 'image/png' ? 'image/png' : type === 'image/webp' ? 'image/webp' : 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp'
      block = { type: 'image', source: { type: 'base64', media_type: mt, data: buffer.toString('base64') } }
    } else {
      return NextResponse.json({ error: 'Le document doit être une image (PNG/JPG) ou un PDF.' }, { status: 415 })
    }

    // Justificatif conservé sous achats/<user_id>/... (même bucket + convention de policy que les tickets)
    const safe = (file.name || 'document').replace(/[^a-zA-Z0-9.\-_]/g, '_')
    const storagePath = `achats/${user.id}/${Date.now()}-${safe}`
    await supabase.storage.from('documents').upload(storagePath, buffer, {
      contentType: file.type || undefined, upsert: false,
    }).catch(() => {})

    let message: Awaited<ReturnType<typeof anthropic.messages.create>>
    try {
      message = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages: [{ role: 'user', content: [block, { type: 'text', text: buildPrompt(docType) }] }],
      })
    } catch (apiErr: unknown) {
      console.error('Anthropic API error (achats scan):', apiErr)
      const raw = apiErr instanceof Error ? apiErr.message : ''
      let msg = 'Impossible de lire le document — réessayez.'
      if (raw.includes('credit balance') || raw.includes('billing')) msg = 'Crédits API épuisés. Rechargez sur console.anthropic.com.'
      else if (raw.includes('rate_limit')) msg = 'Limite de débit atteinte — réessayez dans quelques secondes.'
      return NextResponse.json({ error: msg, storage_path: storagePath }, { status: 502 })
    }

    const rawText = message.content[0]?.type === 'text' ? message.content[0].text : ''
    const jsonMatch = rawText.match(/```json\n?([\s\S]*?)\n?```/) || rawText.match(/(\{[\s\S]*\})/)
    let parsed: Record<string, unknown> = {}
    if (jsonMatch) {
      try { parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]) } catch { /* saisie manuelle */ }
    }

    return NextResponse.json({ success: true, storage_path: storagePath, data: normalizeScanned(parsed) })
  } catch (err: unknown) {
    console.error('Achats scan error:', err)
    const msg = err instanceof Error ? err.message : 'Erreur serveur'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

function buildPrompt(docType: SupplierDocType): string {
  const intro = {
    devis: "Tu lis un DEVIS FOURNISSEUR reçu par un artisan du bâtiment (proposition de prix d'un fournisseur de matériaux, ex : Samsé, Point P, Leroy Merlin).",
    bl: "Tu lis un BON DE LIVRAISON d'un fournisseur de matériaux du bâtiment. Il liste ce qui a été RÉELLEMENT livré. Les prix sont souvent absents ou indicatifs — mets null si tu ne les vois pas.",
    facture: "Tu lis une FACTURE FOURNISSEUR reçue par un artisan du bâtiment (facture de matériaux).",
  }[docType]

  return `${intro}

Extrais l'en-tête ET le détail ligne par ligne des matériaux.

RÈGLES :
- Montants en euros, nombres décimaux avec un point (ex : 45.90). Jamais de symbole ni de séparateur de milliers.
- doc_date au format AAAA-MM-JJ.
- doc_number : le numéro du document (n° de devis / n° de BL / n° de facture).
- Pour chaque ligne : designation (libellé du matériau), quantity, unit (u, m2, ml, sac, palette, boîte…), unit_price_ht (prix unitaire HT), total_ht (total HT de la ligne), quality (gamme/qualité/marque si précisée, sinon null), reference (référence article si présente, sinon null).
- Ne mets PAS les lignes de sous-total, remise globale, éco-participation, TVA ou frais de port dans "lines" : seulement les matériaux/produits.
- Si une information est illisible ou absente, mets null. N'invente jamais un prix.

Retourne UNIQUEMENT ce JSON (sans texte autour) :
{
  "supplier": "nom du fournisseur ou null",
  "doc_number": "numéro du document ou null",
  "doc_date": "AAAA-MM-JJ ou null",
  "total_ht": nombre ou null,
  "total_ttc": nombre ou null,
  "vat_amount": nombre ou null,
  "lines": [
    { "designation": "...", "quantity": nombre ou null, "unit": "... ou null", "unit_price_ht": nombre ou null, "total_ht": nombre ou null, "quality": "... ou null", "reference": "... ou null" }
  ]
}`
}
