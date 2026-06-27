import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

    let formData: FormData
    try {
      formData = await req.formData()
    } catch {
      return NextResponse.json({ error: 'Impossible de lire le formulaire' }, { status: 400 })
    }

    const file = formData.get('file') as File | null
    if (!file || file.size === 0) return NextResponse.json({ error: 'Fichier manquant ou vide' }, { status: 400 })

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const base64 = buffer.toString('base64')
    const isPDF = file.type === 'application/pdf'

    // Upload dans Supabase Storage (non bloquant si ça échoue)
    const filename = `modeles/${user.id}/modele-devis.${isPDF ? 'pdf' : 'jpg'}`
    await supabase.storage.from('documents').upload(filename, buffer, {
      contentType: file.type,
      upsert: true,
    }).catch(() => {})

    let content: Anthropic.MessageParam['content']
    if (isPDF) {
      content = [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf' as const, data: base64 },
        } as any,
        { type: 'text', text: PROMPT_ANALYSE_MODELE },
      ]
    } else {
      const mediaType = (file.type === 'image/png' ? 'image/png'
        : file.type === 'image/webp' ? 'image/webp'
        : 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp'
      content = [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
        { type: 'text', text: PROMPT_ANALYSE_MODELE },
      ]
    }

    let message: Awaited<ReturnType<typeof anthropic.messages.create>>
    try {
      message = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages: [{ role: 'user', content }],
      })
    } catch (apiErr: any) {
      console.error('Anthropic API error:', apiErr)
      const raw = apiErr?.message ?? ''
      let userMsg = 'Impossible d\'analyser ce document — réessayez.'
      if (raw.includes('credit balance') || raw.includes('billing')) {
        userMsg = 'Crédits API épuisés. Rechargez votre compte sur console.anthropic.com → Plans & Billing.'
      } else if (raw.includes('rate_limit')) {
        userMsg = 'Limite de débit atteinte — attendez quelques secondes et réessayez.'
      } else if (raw.includes('invalid_api_key') || raw.includes('authentication')) {
        userMsg = 'Clé API invalide — vérifiez ANTHROPIC_API_KEY dans .env.local'
      }
      return NextResponse.json({ error: userMsg }, { status: 502 })
    }

    const rawText = message.content[0].type === 'text' ? message.content[0].text : ''

    let parsed: any
    const jsonMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/) ?? rawText.match(/(\{[\s\S]*\})/)
    if (!jsonMatch) {
      console.error('No JSON in Claude response:', rawText.slice(0, 500))
      return NextResponse.json({ error: 'L\'IA n\'a pas pu analyser ce document. Essayez avec une image plus lisible.' }, { status: 422 })
    }
    try {
      parsed = JSON.parse(jsonMatch[1] ?? jsonMatch[0])
    } catch {
      return NextResponse.json({ error: 'Réponse IA invalide — réessayez.' }, { status: 422 })
    }

    // Sauvegarder les infos entreprise extraites
    const { data: company } = await supabase.from('companies').select('*').eq('user_id', user.id).single()

    const templateStyle = {
      template_id: 'custom',
      primary_color: parsed.design?.primary_color ?? null,
      header_style: parsed.design?.header_style ?? 'bar',
      box_style: parsed.design?.box_style ?? 'solid',
      table_columns: parsed.design?.table_columns ?? 'full',
      total_style: parsed.design?.total_style ?? 'coloredbox',
      stripe_rows: parsed.design?.stripe_rows ?? false,
      font_family: parsed.design?.font_family ?? 'sans',
      party_layout: parsed.design?.party_layout ?? 'two-boxes',
      rounded: parsed.design?.rounded ?? false,
      has_logo: parsed.design?.has_logo ?? false,
      logo_position: parsed.design?.logo_position ?? null,
      document_type: parsed.document?.type ?? 'devis',
      numbering_format: parsed.document?.numbering_format ?? null,
      signature_block: parsed.document?.signature_block ?? null,
    }

    if (company) {
      const updates: Record<string, any> = { template_style: templateStyle }
      if (!company.trade_name && parsed.company?.name) updates.trade_name = parsed.company.name
      if (!company.siret && parsed.company?.siret) updates.siret = parsed.company.siret
      if (!company.address && parsed.company?.address) updates.address = parsed.company.address
      if (!company.phone && parsed.company?.phone) updates.phone = parsed.company.phone
      if (!company.email && parsed.company?.email) updates.email = parsed.company.email
      if (!company.vat_number && parsed.company?.vat_number) updates.vat_number = parsed.company.vat_number
      if (!company.insurance_decennale && parsed.company?.insurance) updates.insurance_decennale = parsed.company.insurance
      if (!company.iban && parsed.company?.iban) updates.iban = parsed.company.iban
      if (!company.legal_mentions && parsed.document?.legal_mentions) updates.legal_mentions = parsed.document.legal_mentions
      if (!company.payment_terms && parsed.document?.payment_terms) updates.payment_terms = parsed.document.payment_terms
      await supabase.from('companies').update(updates).eq('user_id', user.id)
    } else {
      await supabase.from('companies').insert({
        user_id: user.id,
        trade_name: parsed.company?.name ?? 'Mon entreprise',
        siret: parsed.company?.siret ?? null,
        address: parsed.company?.address ?? null,
        phone: parsed.company?.phone ?? null,
        email: parsed.company?.email ?? null,
        vat_number: parsed.company?.vat_number ?? null,
        insurance_decennale: parsed.company?.insurance ?? null,
        iban: parsed.company?.iban ?? null,
        legal_mentions: parsed.document?.legal_mentions ?? null,
        payment_terms: parsed.document?.payment_terms ?? '30 jours à réception de facture',
        quote_validity_days: 30,
        default_deposit_percent: parsed.document?.deposit_percent ?? 30,
        default_vat_rate: parsed.document?.vat_rate ?? 10,
        template_style: templateStyle,
      })
    }

    supabase.from('action_logs').insert({
      user_id: user.id,
      action_type: 'modele_analyse',
      entity_type: 'template',
      details: parsed,
    })

    return NextResponse.json({ success: true, data: parsed })
  } catch (err: any) {
    console.error('Unhandled error in /api/modele/analyser:', err)
    return NextResponse.json({ error: err?.message ?? 'Erreur serveur inattendue' }, { status: 500 })
  }
}

const PROMPT_ANALYSE_MODELE = `Tu analyses un devis ou une facture existant.

Ton objectif : extraire TOUTES les informations pour reproduire EXACTEMENT le même style visuel (mise en page, couleurs, structure) et les informations de l'entreprise.

Retourne UNIQUEMENT ce JSON (sans texte avant ou après) :

\`\`\`json
{
  "company": {
    "name": "Nom commercial ou prénom/nom",
    "legal_name": "Nom juridique si différent",
    "siret": "Numéro SIRET",
    "vat_number": "Numéro TVA intracommunautaire",
    "address": "Adresse complète",
    "phone": "Téléphone",
    "email": "Email",
    "website": "Site web",
    "insurance": "Assurance décennale (numéro/assureur)",
    "iban": "IBAN si présent",
    "legal_status": "Micro-entreprise / SARL / EI etc."
  },
  "document": {
    "type": "devis ou facture",
    "numbering_format": "Format de numérotation (ex: DEV-2024-001)",
    "vat_rate": 10,
    "payment_terms": "Conditions de paiement",
    "deposit_percent": 30,
    "validity_days": 30,
    "legal_mentions": "Mentions légales présentes (copie exacte)",
    "signature_block": "Texte du bloc signature/bon pour accord"
  },
  "design": {
    "primary_color": "#e8571e",
    "header_style": "clean",
    "box_style": "dashed",
    "table_columns": "simple",
    "total_style": "darkbar",
    "stripe_rows": false,
    "font_family": "sans",
    "party_layout": "two-boxes",
    "rounded": false,
    "has_logo": true,
    "logo_position": "haut-gauche"
  },
  "notes": "Observations sur le style ou particularités"
}
\`\`\`

RÈGLES CRITIQUES pour le champ "design" — réponds avec EXACTEMENT ces valeurs :

header_style (style de l'en-tête) :
- "clean" : en-tête blanc/neutre avec logo à gauche, titre centré grand, dates à droite
- "bar" : barre colorée pleine largeur en haut avec texte blanc (couleur de marque)
- "dark" : barre sombre/noire avec accent de couleur dorée ou vive
- "minimal" : juste le nom entreprise + titre, aucun fond coloré, séparateur ligne

box_style (style des encadrés PRESTATAIRE/CLIENT) :
- "dashed" : bordure en pointillés
- "solid" : bordure solide fine
- "filled" : fond coloré clair sans bordure
- "lines" : juste un trait en haut et en bas
- "none" : aucun encadré

table_columns (colonnes du tableau des prestations) :
- "simple" : 2 colonnes seulement (PRESTATION à gauche, PRIX à droite)
- "full" : tableau complet avec colonnes Désignation, Qté, P.U. HT, TVA%, Total HT

total_style (style du bloc total) :
- "darkbar" : barre sombre pleine largeur avec montant en couleur vive
- "coloredbox" : encadré coloré aligné à droite
- "inline" : texte inline avec ligne de séparation, pas d'encadré

stripe_rows : true si les lignes du tableau alternent couleur/blanc, false sinon

font_family (police d'écriture) :
- "serif" : police à empattements (style Times, Georgia — élégant, classique, juridique)
- "sans" : police sans empattements (style Arial, Helvetica — moderne, net)

party_layout (disposition des blocs PRESTATAIRE et CLIENT) :
- "two-boxes" : deux encadrés côte à côte (gauche/droite)
- "banner" : un seul bandeau pleine largeur divisé en deux par un trait vertical
- "stacked" : deux blocs pleine largeur empilés l'un au-dessus de l'autre

rounded : true si les coins des encadrés/barres sont arrondis, false si carrés/droits

primary_color : couleur dominante en hexadécimal (en-tête, accents, prix, labels)

Autres règles :
- Si une info n'est pas visible → null
- Copie les mentions légales EXACTEMENT
- Si image peu lisible → note dans "notes" mais extrais quand même`
