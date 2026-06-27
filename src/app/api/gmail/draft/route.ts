import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

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

    const prompt = `Tu es un assistant pour un artisan du bâtiment français.

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

Règles :
- Ton professionnel mais chaleureux
- Court et direct (3-5 phrases max)
- Terminer par les coordonnées si pertinent
- Ne pas inventer d'infos
- Commencer directement par la réponse (pas de "Objet :" ni en-tête)`

    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    })

    const draft = msg.content[0].type === 'text' ? msg.content[0].text : ''
    return NextResponse.json({ draft })
  } catch (err: any) {
    console.error('Draft error:', err)
    return NextResponse.json({ error: err?.message || 'Erreur serveur' }, { status: 500 })
  }
}
