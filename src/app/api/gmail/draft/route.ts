import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { buildDefaultSignatureText, appendSignature } from '@/lib/signature'
import { findClientContext, clientContextPromptBlock } from '@/lib/emailContext'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

    const { emailId, userIntent } = await req.json()

    const { data: email } = await supabase.from('emails').select('*').eq('id', emailId).eq('user_id', user.id).single()
    if (!email) return NextResponse.json({ error: 'Email introuvable' }, { status: 404 })

    const { data: company } = await supabase.from('companies').select('trade_name, phone, email, address').eq('user_id', user.id).single()

    // Signature + réglage « réponses orientées conversion ».
    const [{ data: profile }, { data: sig }] = await Promise.all([
      supabase.from('profiles').select('full_name').eq('id', user.id).single(),
      supabase.from('email_signatures').select('signature_text, ai_sales_mode').eq('user_id', user.id).maybeSingle(),
    ])
    const signatureText = (sig?.signature_text?.trim()) || buildDefaultSignatureText({
      fullName: profile?.full_name,
      tradeName: company?.trade_name,
      phone: company?.phone,
      email: company?.email,
    })
    const salesMode = sig?.ai_sales_mode !== false // défaut : activé
    const guidance = salesMode ? salesGuidance(email.category) : ''
    const isQuoteRequest = salesMode && email.category === 'demande_devis'

    // Contexte CRM réel de l'expéditeur : l'IA peut citer le devis en cours, etc.
    const clientCtx = await findClientContext(supabase, user.id, email.from_email, email.linked_client_id)
    const clientBlock = clientContextPromptBlock(clientCtx)

    const prompt = `Tu es un assistant pour un artisan du bâtiment français, doublé d'un bon commercial.

Rédige une réponse professionnelle à cet email en français.
${userIntent ? `L'artisan veut dire : "${userIntent}"` : 'Rédige une réponse appropriée au contexte.'}

Email reçu :
De : ${email.from_name || ''} <${email.from_email}>
Objet : ${email.subject}
Contenu : ${email.body_text?.slice(0, 1000) || '(pas de contenu)'}

Informations de l'artisan :
Nom : ${company?.trade_name || 'Mon entreprise'}
Téléphone : ${company?.phone || ''}
Email : ${company?.email || ''}
${clientBlock ? `\n${clientBlock}\n` : ''}${guidance ? `\n${guidance}\n` : ''}
Règles :
- Ton professionnel mais chaleureux et HUMAIN (jamais robotique ni « copié-collé commercial »)
- ${isQuoteRequest ? 'Tu peux aller jusqu\'à ~8 phrases pour poser les bonnes questions et proposer la suite' : 'Court et direct (3-5 phrases max)'}
- Ne pas inventer d'infos (ni prix, ni délais que l'artisan n'a pas donnés)
- Une seule prochaine étape claire, formulée naturellement
- Commencer directement par la réponse (pas de "Objet :" ni en-tête)
- NE PAS écrire de formule de politesse finale ni de signature (« Cordialement », nom, coordonnées) : elle est ajoutée automatiquement.`

    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: isQuoteRequest ? 800 : 500,
      messages: [{ role: 'user', content: prompt }],
    })

    const rawDraft = msg.content[0].type === 'text' ? msg.content[0].text : ''
    const draft = appendSignature(rawDraft, signatureText)
    return NextResponse.json({ draft })
  } catch (err: any) {
    console.error('Draft error:', err)
    return NextResponse.json({ error: err?.message || 'Erreur serveur' }, { status: 500 })
  }
}

// Techniques de conversion selon la catégorie de l'email — naturelles, jamais robotiques.
function salesGuidance(category?: string | null): string {
  switch (category) {
    case 'demande_devis':
      return `OBJECTIF COMMERCIAL : c'est une DEMANDE DE DEVIS — une opportunité à transformer en chantier signé.
La réponse doit donner envie de travailler avec l'artisan ET récupérer ce qu'il faut pour chiffrer vite et juste. Structure (doit sonner humain, pas une liste de robot) :
1) Remercie et montre en une phrase que c'est pile le type de projet qu'il maîtrise (sans en faire trop).
2) Pose les 3 à 5 questions VRAIMENT utiles pour chiffrer, dans un ordre logique (ex : surfaces/dimensions, état de l'existant, niveau de finition, délais, accès). Formule-les simplement.
3) Propose une prochaine étape concrète et rapide : une visite sur place ou un court appel pour remettre un devis précis (glisse le téléphone si disponible).
4) Rassure en une touche (sérieux, assurances, réactivité), sans se vanter.`
    case 'relance_client':
    case 'client_a_repondre':
      return `OBJECTIF COMMERCIAL : client qui a probablement un devis en attente.
Aide à lever les derniers freins et à faciliter la signature, SANS pression :
- réponds précisément à son message ;
- rappelle la valeur (ce qui est inclus, le sérieux, le délai) plutôt que juste le prix ;
- propose de lever tout doute par un appel rapide et rends l'étape suivante facile (« je peux vous réserver la date », « le devis est signable en ligne ») ;
- si pertinent, rappelle avec tact la validité du devis (urgence douce).`
    case 'chantier_en_cours':
      return `OBJECTIF RELATION : chantier en cours. Rassure sur le suivi, propose un point d'étape si utile, soigne la relation (un client satisfait recommande). Reste factuel et disponible.`
    default:
      return ''
  }
}
