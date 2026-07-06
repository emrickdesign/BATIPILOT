'use server'

import { createClient } from '@/lib/supabase/server'
import { getEmployeeSession } from '@/lib/employeeSession'
import { createServiceClient } from '@/lib/supabase/service'
import { getValidGmailToken } from '@/lib/gmail-token'
import { revalidatePath } from 'next/cache'
import type { Message } from '@/types'

export type ViewerClaim = { kind: 'admin' } | { kind: 'employee'; employeeId: string }

const VOICE_BUCKET = 'documents'

/** Attache une URL signée (1h) aux messages vocaux ; ne stocke jamais l'URL en base. */
async function withAudioUrls<T extends Pick<Message, 'audio_path'>>(
  service: ReturnType<typeof createServiceClient>,
  msgs: T[]
): Promise<(T & { audio_url?: string | null })[]> {
  const paths = msgs.filter(m => m.audio_path).map(m => m.audio_path as string)
  if (paths.length === 0) return msgs
  const signed = await Promise.all(paths.map(p => service.storage.from(VOICE_BUCKET).createSignedUrl(p, 3600)))
  const urlByPath = new Map(paths.map((p, i) => [p, signed[i].data?.signedUrl || null]))
  return msgs.map(m => m.audio_path ? { ...m, audio_url: urlByPath.get(m.audio_path) || null } : m)
}

/**
 * Résout l'expéditeur à partir de ce que revendique le CLIENT (viewer côté page), et vérifie
 * cette revendication précisément — jamais une priorité ambiguë entre les deux sessions.
 * Sur un appareil partagé (tablette chantier), l'admin ET un salarié peuvent être connectés
 * en même temps ; sans ce garde-fou, un message salarié pourrait être attribué à l'admin.
 */
async function currentSender(claim: ViewerClaim): Promise<
  | { kind: 'admin'; userId: string }
  | { kind: 'employee'; userId: string; employeeId: string }
  | null
> {
  if (claim.kind === 'admin') {
    const authed = await createClient()
    const { data: { user } } = await authed.auth.getUser()
    return user ? { kind: 'admin', userId: user.id } : null
  }

  const empSession = await getEmployeeSession()
  if (!empSession || empSession.employeeId !== claim.employeeId) return null
  return { kind: 'employee', userId: empSession.userId, employeeId: empSession.employeeId }
}

export async function createConversation(employeeIds: string[], name: string | undefined, viewer: ViewerClaim) {
  const sender = await currentSender(viewer)
  if (!sender) return { error: 'Non connecté.' }
  if (employeeIds.length === 0) return { error: 'Choisis au moins un salarié.' }

  const service = createServiceClient()
  const { data: conv, error } = await service
    .from('conversations')
    .insert({ user_id: sender.userId, type: employeeIds.length > 1 ? 'group' : 'direct', name: employeeIds.length > 1 ? name || null : null })
    .select('id')
    .single()
  if (error || !conv) return { error: 'Erreur lors de la création.' }

  const rows = employeeIds.map(employee_id => ({ conversation_id: conv.id, user_id: sender.userId, employee_id }))
  const { error: partError } = await service.from('conversation_participants').insert(rows)
  if (partError) return { error: 'Erreur lors de l\'ajout des participants.' }

  revalidatePath('/messages')
  revalidatePath('/terrain')
  return { success: true, conversationId: conv.id as string }
}

/** Poll léger (pas de vrai websocket temps réel ici) : nouveaux messages depuis `afterIso`. */
export async function getNewMessages(conversationId: string, afterIso: string, viewer: ViewerClaim) {
  const sender = await currentSender(viewer)
  if (!sender) return { error: 'Non connecté.' }
  const service = createServiceClient()

  const { data: conv } = await service.from('conversations').select('id, user_id').eq('id', conversationId).single()
  if (!conv || conv.user_id !== sender.userId) return { error: 'Conversation introuvable.' }
  if (sender.kind === 'employee') {
    const { data: participant } = await service
      .from('conversation_participants')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('employee_id', sender.employeeId)
      .single()
    if (!participant) return { error: 'Accès refusé.' }
  }

  const { data } = await service
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .gt('created_at', afterIso)
    .order('created_at', { ascending: true })
  return { messages: await withAudioUrls(service, data || []) }
}

/** Upload + insertion d'un message vocal. `formData` doit contenir conversationId, audio (Blob) et duration (secondes). */
export async function sendVoiceMessage(formData: FormData, viewer: ViewerClaim) {
  const conversationId = formData.get('conversationId')
  const audio = formData.get('audio')
  const durationRaw = formData.get('duration')
  if (typeof conversationId !== 'string' || !(audio instanceof Blob) || audio.size === 0) {
    return { error: 'Message vocal invalide.' }
  }
  const duration = typeof durationRaw === 'string' && durationRaw ? Math.round(Number(durationRaw)) : null

  const sender = await currentSender(viewer)
  if (!sender) return { error: 'Non connecté.' }

  const service = createServiceClient()

  const { data: conv } = await service.from('conversations').select('id, user_id').eq('id', conversationId).single()
  if (!conv || conv.user_id !== sender.userId) return { error: 'Conversation introuvable.' }
  if (sender.kind === 'employee') {
    const { data: participant } = await service
      .from('conversation_participants')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('employee_id', sender.employeeId)
      .single()
    if (!participant) return { error: 'Tu ne fais pas partie de cette conversation.' }
  }

  const mime = audio.type || 'audio/webm'
  const ext = mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm'
  const path = `voice-messages/${conversationId}/${crypto.randomUUID()}.${ext}`
  const buffer = Buffer.from(await audio.arrayBuffer())

  const { error: upErr } = await service.storage.from(VOICE_BUCKET).upload(path, buffer, { contentType: mime, upsert: false })
  if (upErr) return { error: "Erreur lors de l'envoi du message vocal." }

  const { error } = await service.from('messages').insert({
    conversation_id: conversationId,
    user_id: sender.userId,
    sender_type: sender.kind,
    sender_employee_id: sender.kind === 'employee' ? sender.employeeId : null,
    body: '🎤 Message vocal',
    audio_path: path,
    audio_mime: mime,
    duration_sec: duration,
  })
  if (error) return { error: "Erreur lors de l'envoi du message vocal." }

  revalidatePath('/messages')
  revalidatePath('/terrain')
  return { success: true }
}

export async function sendMessage(conversationId: string, body: string, viewer: ViewerClaim) {
  const trimmed = body.trim()
  if (!trimmed) return { error: 'Message vide.' }
  const sender = await currentSender(viewer)
  if (!sender) return { error: 'Non connecté.' }

  const service = createServiceClient()

  // Vérifie que l'appelant a bien le droit d'écrire dans cette conversation.
  const { data: conv } = await service.from('conversations').select('id, user_id').eq('id', conversationId).single()
  if (!conv || conv.user_id !== sender.userId) return { error: 'Conversation introuvable.' }
  if (sender.kind === 'employee') {
    const { data: participant } = await service
      .from('conversation_participants')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('employee_id', sender.employeeId)
      .single()
    if (!participant) return { error: 'Tu ne fais pas partie de cette conversation.' }
  }

  const { error } = await service.from('messages').insert({
    conversation_id: conversationId,
    user_id: sender.userId,
    sender_type: sender.kind,
    sender_employee_id: sender.kind === 'employee' ? sender.employeeId : null,
    body: trimmed,
  })
  if (error) return { error: 'Erreur lors de l\'envoi.' }

  revalidatePath('/messages')
  revalidatePath('/terrain')
  return { success: true }
}

/** Planifie un appel interne : événement Google Calendar + lien Meet + invitations email natives (accepter/refuser côté Google). */
export async function createCalendarMeeting(
  conversationId: string,
  startIso: string,
  durationMinutes: number,
  title: string | undefined,
  viewer: ViewerClaim
) {
  const sender = await currentSender(viewer)
  if (!sender) return { error: 'Non connecté.' }

  const start = new Date(startIso)
  if (Number.isNaN(start.getTime())) return { error: 'Date invalide.' }

  const service = createServiceClient()

  const { data: conv } = await service.from('conversations').select('id, user_id').eq('id', conversationId).single()
  if (!conv || conv.user_id !== sender.userId) return { error: 'Conversation introuvable.' }
  if (sender.kind === 'employee') {
    const { data: participant } = await service
      .from('conversation_participants')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('employee_id', sender.employeeId)
      .single()
    if (!participant) return { error: 'Tu ne fais pas partie de cette conversation.' }
  }

  const token = await getValidGmailToken(service, sender.userId)
  if (!token) return { error: 'Connecte Google Calendar (Paramètres > Connexions) pour planifier des appels.' }

  const { data: participants } = await service
    .from('conversation_participants')
    .select('employee_id, employees(email)')
    .eq('conversation_id', conversationId)

  const attendeeEmails = new Set<string>()
  for (const p of participants || []) {
    const emp = p.employees as unknown as { email?: string } | null
    if (emp?.email && !(sender.kind === 'employee' && p.employee_id === sender.employeeId)) attendeeEmails.add(emp.email)
  }
  // Une conversation directe salarié↔Direction ne contient que le salarié comme participant :
  // l'admin (organisateur du calendrier connecté) n'y figure pas, il faut l'ajouter explicitement.
  if (sender.kind === 'employee' && token.gmailEmail) attendeeEmails.add(token.gmailEmail)

  if (attendeeEmails.size === 0) return { error: 'Aucun destinataire avec une adresse email pour cette conversation.' }

  const end = new Date(start.getTime() + durationMinutes * 60_000)

  const res = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: title?.trim() || 'Appel BatiPilot',
        start: { dateTime: start.toISOString() },
        end: { dateTime: end.toISOString() },
        attendees: Array.from(attendeeEmails).map(email => ({ email })),
        conferenceData: {
          createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } },
        },
      }),
    }
  )

  if (!res.ok) return { error: "Erreur lors de la création de l'événement Google Calendar." }
  const event = await res.json()
  const meetLink = event.hangoutLink as string | undefined
  const eventLink = event.htmlLink as string | undefined

  const dateLabel = start.toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })
  const body = `📅 Appel planifié le ${dateLabel}${meetLink ? `\n${meetLink}` : eventLink ? `\n${eventLink}` : ''}`

  await service.from('messages').insert({
    conversation_id: conversationId,
    user_id: sender.userId,
    sender_type: sender.kind,
    sender_employee_id: sender.kind === 'employee' ? sender.employeeId : null,
    body,
  })

  revalidatePath('/messages')
  revalidatePath('/terrain')
  return { success: true, meetLink, eventLink }
}
