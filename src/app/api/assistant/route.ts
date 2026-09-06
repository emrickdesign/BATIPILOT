import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { assistantTools, executeTool, type AssistantCard, type PendingAction } from '@/lib/assistant/tools'
import { sanitizeMessages, withinRateLimit, MAX_BODY_BYTES } from '@/lib/assistant/guard'

export const dynamic = 'force-dynamic'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM = `Tu es « IA TonPilote », l'assistant vocal d'une application de gestion pour artisans du bâtiment.
L'utilisateur te parle à voix haute ; ta réponse sera LUE À VOIX HAUTE. Donc :
- Réponds en français, court et naturel (1 à 3 phrases). Pas de listes à puces, pas de markdown.
- Sers-toi TOUJOURS des outils pour connaître l'état réel (finances, chantiers, mails) ou pour trouver/naviguer. N'invente jamais un chiffre.
- Quand l'utilisateur veut aller quelque part ou voir un dossier, appelle « naviguer » (ou « chercher_dans_lapp » puis propose d'ouvrir).
- Après un outil, résume l'essentiel à l'oral, en langage parlé (« Il te reste 12 300 € à encaisser sur 4 factures »).
- Tu peux LIRE n'importe quel onglet (« lire ») et AGIR partout : créer client/prospect (« creer_contact »), pointer des heures (« pointer_heures »), poser une absence (« creer_absence »), créer un rappel (« creer_rappel »), un compte-rendu de chantier (« creer_compte_rendu »), un chantier (« creer_chantier »), une visite (« creer_visite »), une note de chantier, et ouvrir un devis/une facture pré-remplis (« preparer_devis », « preparer_facture »).
- Actions à effet (envoyer un message/email, marquer une facture payée) : utilise « preparer_envoi » / « marquer_facture_payee » — tu PRÉPARES seulement. Ne dis JAMAIS que c'est fait — l'utilisateur confirmera avec un bouton. Invite-le à confirmer.
- Si tu ne peux pas faire quelque chose, dis-le simplement.`

type Msg = { role: 'user' | 'assistant'; content: unknown }

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

    // Plafond de taille : mesure le corps RÉEL (l'en-tête Content-Length peut manquer/mentir).
    const raw = await req.text()
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Requête trop volumineuse.' }, { status: 413 })
    }
    let body: unknown = {}
    try { body = JSON.parse(raw) } catch {}
    // Sanitize : messages valides, contenu tronqué, historique borné.
    const messages: Msg[] = sanitizeMessages((body as { messages?: unknown }).messages)
    if (!messages.length) return NextResponse.json({ error: 'messages requis' }, { status: 400 })

    // Rate-limit par utilisateur (protège la clé Anthropic serveur).
    const service = createServiceClient()
    if (!(await withinRateLimit(service, user.id, 20))) {
      return NextResponse.json({ error: 'Trop de requêtes, patiente un instant.' }, { status: 429 })
    }

    let navigateTo: string | undefined
    let pendingAction: PendingAction | undefined
    const cards: AssistantCard[] = []
    let reply = ''

    for (let hop = 0; hop < 5; hop++) {
      const res = await anthropic.messages.create({
        model: 'claude-sonnet-5',
        max_tokens: 700,
        system: SYSTEM,
        tools: assistantTools,
        messages: messages as Anthropic.MessageParam[],
      })

      messages.push({ role: 'assistant', content: res.content })

      const toolUses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
      reply = res.content.filter(b => b.type === 'text').map(b => (b as Anthropic.TextBlock).text).join(' ').trim()

      if (toolUses.length === 0) break

      const toolResults: Anthropic.ToolResultBlockParam[] = []
      for (const tu of toolUses) {
        const outcome = await executeTool(tu.name, (tu.input || {}) as Record<string, unknown>, supabase, user.id)
        if (outcome.navigateTo) navigateTo = outcome.navigateTo
        if (outcome.pendingAction) pendingAction = outcome.pendingAction
        if (outcome.cards) cards.push(...outcome.cards)
        toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: outcome.result })
      }
      messages.push({ role: 'user', content: toolResults })
    }

    if (!reply) reply = navigateTo ? "Je t'y emmène." : pendingAction ? 'Je te prépare ça.' : "Je n'ai pas de réponse pour ça."
    return NextResponse.json({ reply, navigateTo, cards: cards.slice(0, 8), pendingAction })
  } catch (err) {
    console.error('Assistant error:', err)
    return NextResponse.json({ error: (err as Error)?.message || 'Erreur serveur' }, { status: 500 })
  }
}
