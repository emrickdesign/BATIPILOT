'use server'

import { createClient } from '@/lib/supabase/server'
import { getEmployeeSession } from '@/lib/employeeSession'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'

async function currentSender(): Promise<
  | { kind: 'admin'; userId: string }
  | { kind: 'employee'; userId: string; employeeId: string }
  | null
> {
  const authed = await createClient()
  const { data: { user } } = await authed.auth.getUser()
  if (user) return { kind: 'admin', userId: user.id }

  const empSession = await getEmployeeSession()
  if (empSession) return { kind: 'employee', userId: empSession.userId, employeeId: empSession.employeeId }
  return null
}

export async function createConversation(employeeIds: string[], name?: string) {
  const sender = await currentSender()
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
export async function getNewMessages(conversationId: string, afterIso: string) {
  const sender = await currentSender()
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
  return { messages: data || [] }
}

export async function sendMessage(conversationId: string, body: string) {
  const trimmed = body.trim()
  if (!trimmed) return { error: 'Message vide.' }
  const sender = await currentSender()
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
