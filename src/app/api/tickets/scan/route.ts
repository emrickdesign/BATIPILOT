import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { expenseCategoryOptions, paymentMethodOptions } from '@/lib/depenses'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file || file.size === 0) return NextResponse.json({ error: 'Ticket manquant' }, { status: 400 })

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
      return NextResponse.json({ error: 'Le ticket doit être une image (PNG/JPG) ou un PDF.' }, { status: 415 })
    }

    // Justificatif conservé (copie fidèle) — chemin tickets/<user_id>/... pour respecter la policy storage
    const safe = (file.name || 'ticket').replace(/[^a-zA-Z0-9.\-_]/g, '_')
    const storagePath = `tickets/${user.id}/${Date.now()}-${safe}`
    await supabase.storage.from('documents').upload(storagePath, buffer, {
      contentType: file.type || undefined, upsert: false,
    }).catch(() => {})

    let message: Awaited<ReturnType<typeof anthropic.messages.create>>
    try {
      message = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{ role: 'user', content: [block, { type: 'text', text: buildPrompt() }] }],
      })
    } catch (apiErr: unknown) {
      console.error('Anthropic API error (ticket):', apiErr)
      const raw = apiErr instanceof Error ? apiErr.message : ''
      let msg = 'Impossible de lire le ticket — réessayez.'
      if (raw.includes('credit balance') || raw.includes('billing')) msg = 'Crédits API épuisés. Rechargez sur console.anthropic.com.'
      else if (raw.includes('rate_limit')) msg = 'Limite de débit atteinte — réessayez dans quelques secondes.'
      return NextResponse.json({ error: msg, storage_path: storagePath }, { status: 502 })
    }

    const rawText = message.content[0].type === 'text' ? message.content[0].text : ''
    const jsonMatch = rawText.match(/```json\n?([\s\S]*?)\n?```/) || rawText.match(/(\{[\s\S]*\})/)
    let parsed: Record<string, unknown> = {}
    if (jsonMatch) {
      try { parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]) } catch { /* champ vide, saisie manuelle */ }
    }

    return NextResponse.json({ success: true, storage_path: storagePath, data: parsed })
  } catch (err: unknown) {
    console.error('Ticket scan error:', err)
    const msg = err instanceof Error ? err.message : 'Erreur serveur'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

function buildPrompt(): string {
  return `Tu lis un TICKET DE CAISSE / FACTURE D'ACHAT pour un artisan du bâtiment. Extrais les informations clés.

RÈGLES :
- Montants en euros, nombres décimaux avec un point (ex: 45.90). Pas de symbole.
- Si la TVA n'est pas indiquée mais que tu as le TTC, calcule HT et TVA avec un taux de 20% par défaut.
- date au format AAAA-MM-JJ.
- category : choisis la plus proche parmi : ${expenseCategoryOptions.join(', ')}.
- payment_method : parmi : ${paymentMethodOptions.join(', ')} (sinon laisse vide).
- Si une information est illisible ou absente, mets null.

Retourne UNIQUEMENT ce JSON (sans texte autour) :
{
  "supplier": "nom du commerce/fournisseur ou null",
  "date": "AAAA-MM-JJ ou null",
  "amount_ttc": nombre ou null,
  "amount_ht": nombre ou null,
  "vat_amount": nombre ou null,
  "vat_rate": nombre (5.5, 10 ou 20) ou null,
  "category": "catégorie ou null",
  "payment_method": "moyen de paiement ou null",
  "ticket_number": "numéro de ticket/facture ou null"
}`
}
