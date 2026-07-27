import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const TYPE_FOCUS: Record<string, string> = {
  chantier_hebdo: "Point d'avancement de chantier : avancement par tâche, blocages, besoins matériel/main d'œuvre, prochaines étapes, délais.",
  securite: "Réunion sécurité/QSE : EPI, risques identifiés, incidents/presqu'accidents, mesures correctives, rappels de consignes.",
  demarrage: "Brief de démarrage de chantier : objectifs, planning, répartition des rôles, matériel, contraintes d'accès, interlocuteurs.",
  client: "Réunion client : attentes et validations du client, modifications demandées, budget/délais, prochaines livraisons.",
  rh: "Réunion RH/équipe : organisation, congés, points individuels, formation, ambiance, décisions internes.",
  custom: "Réunion générale : capter décisions, sujets abordés et actions concrètes.",
}

/** Génère un compte-rendu structuré + actions assignées à partir du transcript d'une réunion. */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

    const body = await req.json().catch(() => null)
    const meetingId = String(body?.meetingId || '')
    if (!meetingId) return NextResponse.json({ error: 'Réunion introuvable' }, { status: 400 })

    const { data: meeting } = await supabase
      .from('meetings')
      .select('*, projects(title)')
      .eq('id', meetingId)
      .eq('user_id', user.id)
      .single()
    if (!meeting) return NextResponse.json({ error: 'Réunion introuvable' }, { status: 404 })

    const transcript = String(meeting.transcript || '').trim()
    if (transcript.length < 20) return NextResponse.json({ error: 'Transcription trop courte pour générer un compte-rendu.' }, { status: 422 })

    const { data: participants } = await supabase
      .from('meeting_participants')
      .select('employee_id, employees(id, full_name)')
      .eq('meeting_id', meetingId)
      .eq('user_id', user.id)
    const parts = (participants || []).map((p: any) => p.employees).filter(Boolean) as { id: string; full_name: string }[]
    const participantNames = parts.map((p) => p.full_name)

    await supabase.from('meetings').update({ status: 'processing' }).eq('id', meetingId).eq('user_id', user.id)

    const today = new Date().toISOString().slice(0, 10)
    const focus = TYPE_FOCUS[meeting.type as string] || TYPE_FOCUS.custom
    const prompt = `Tu es un assistant qui rédige des comptes-rendus de réunion pour une entreprise du bâtiment (artisan/BTP). Ton style est clair, concret, en français, orienté action.

Contexte de la réunion :
- Type : ${focus}
${meeting.projects?.title ? `- Chantier concerné : ${meeting.projects.title}` : ''}
- Date : ${today}
- Participants (utilise EXACTEMENT ces noms pour assigner les actions, sinon null) : ${participantNames.length ? participantNames.join(', ') : 'non précisés'}

Voici la transcription brute (dictée vocale, ponctuation imparfaite, ne te fie qu'à son contenu) :
"""
${transcript.slice(0, 24000)}
"""

Rends UNIQUEMENT un objet JSON valide, sans texte autour, au format exact :
\`\`\`json
{
  "tldr": "résumé en 2 à 3 phrases",
  "decisions": ["décision prise", "..."],
  "topics": [{ "title": "sujet abordé", "points": ["point", "..."] }],
  "risks": ["point de vigilance / risque", "..."],
  "next_steps": ["prochaine étape", "..."],
  "actions": [
    { "title": "action concrète à faire", "details": "précision courte ou \\"\\"", "assignee": "nom exact d'un participant ou null", "due_date": "AAAA-MM-JJ si une échéance est explicitement dite, sinon null", "priority": "low | normal | high" }
  ]
}
\`\`\`
Règles : n'invente rien qui ne soit dans la transcription ; laisse un tableau vide si une rubrique n'a pas d'élément ; "assignee" doit correspondre à un nom de la liste des participants (ou null) ; formule les actions à l'impératif, précises et vérifiables.`

    let message
    try {
      message = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      })
    } catch (apiErr) {
      await supabase.from('meetings').update({ status: 'draft' }).eq('id', meetingId).eq('user_id', user.id)
      const raw = (apiErr as Error)?.message ?? ''
      let msg = 'Génération impossible — réessayez.'
      if (raw.includes('credit balance') || raw.includes('billing')) msg = 'Crédits API épuisés. Rechargez sur console.anthropic.com.'
      else if (raw.includes('rate_limit')) msg = 'Limite de débit atteinte — réessayez dans quelques secondes.'
      return NextResponse.json({ error: msg }, { status: 502 })
    }

    const rawText = message.content[0].type === 'text' ? message.content[0].text : ''
    const jsonMatch = rawText.match(/```json\n?([\s\S]*?)\n?```/) || rawText.match(/(\{[\s\S]*\})/)
    if (!jsonMatch) {
      await supabase.from('meetings').update({ status: 'draft' }).eq('id', meetingId).eq('user_id', user.id)
      return NextResponse.json({ error: 'Réponse IA illisible — réessayez.' }, { status: 422 })
    }
    let parsed: any
    try { parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]) } catch {
      await supabase.from('meetings').update({ status: 'draft' }).eq('id', meetingId).eq('user_id', user.id)
      return NextResponse.json({ error: 'Réponse IA invalide — réessayez.' }, { status: 422 })
    }

    const summary = {
      tldr: String(parsed.tldr || ''),
      decisions: Array.isArray(parsed.decisions) ? parsed.decisions.map(String).filter(Boolean) : [],
      topics: Array.isArray(parsed.topics)
        ? parsed.topics.map((t: any) => ({ title: String(t?.title || ''), points: Array.isArray(t?.points) ? t.points.map(String).filter(Boolean) : [] })).filter((t: any) => t.title)
        : [],
      risks: Array.isArray(parsed.risks) ? parsed.risks.map(String).filter(Boolean) : [],
      next_steps: Array.isArray(parsed.next_steps) ? parsed.next_steps.map(String).filter(Boolean) : [],
    }

    // Mapping "assignee" (nom) -> employee_id parmi les participants
    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
    function matchEmployee(name: any): string | null {
      if (!name || typeof name !== 'string') return null
      const n = norm(name)
      const exact = parts.find((p) => norm(p.full_name) === n)
      if (exact) return exact.id
      const partial = parts.find((p) => norm(p.full_name).split(/\s+/).some((tok) => tok && n.includes(tok)) || n.split(/\s+/).some((tok) => tok && norm(p.full_name).includes(tok)))
      return partial ? partial.id : null
    }
    const isoDate = (d: any) => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null)
    const prio = (p: any) => (p === 'low' || p === 'high' ? p : 'normal')

    const actionsIn = Array.isArray(parsed.actions) ? parsed.actions : []
    const actionRows = actionsIn
      .map((a: any, i: number) => ({
        user_id: user.id,
        meeting_id: meetingId,
        employee_id: matchEmployee(a?.assignee),
        project_id: meeting.project_id || null,
        title: String(a?.title || '').trim(),
        details: a?.details ? String(a.details).trim() : null,
        due_date: isoDate(a?.due_date),
        priority: prio(a?.priority),
        status: 'todo',
        sort_order: i,
      }))
      .filter((a: any) => a.title)

    // Régénération : on remplace les actions précédentes de cette réunion
    await supabase.from('meeting_actions').delete().eq('meeting_id', meetingId).eq('user_id', user.id)
    if (actionRows.length) await supabase.from('meeting_actions').insert(actionRows)

    await supabase
      .from('meetings')
      .update({ summary, status: 'ready', updated_at: new Date().toISOString() })
      .eq('id', meetingId)
      .eq('user_id', user.id)

    return NextResponse.json({ ok: true, actionsCount: actionRows.length })
  } catch (e) {
    console.error('reunions/generer error', e)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
