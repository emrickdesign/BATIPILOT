import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { isSupplierDocType, normalizeScanned, buildAchatsExtractionPrompt } from '@/lib/achats'

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
        messages: [{ role: 'user', content: [block, { type: 'text', text: buildAchatsExtractionPrompt(docType) }] }],
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
