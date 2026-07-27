'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { MeetingType } from '@/types'

/** Crée une réunion (statut "recording") + ses participants, renvoie son id. */
export async function createMeeting(input: {
  title: string
  type: MeetingType
  projectId?: string | null
  clientId?: string | null
  participantIds: string[]
  consent: boolean
  confidential?: boolean
}): Promise<{ id: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non authentifié')

  const { data: meeting, error } = await supabase
    .from('meetings')
    .insert({
      user_id: user.id,
      title: input.title.trim() || 'Réunion',
      type: input.type,
      project_id: input.projectId || null,
      client_id: input.clientId || null,
      consent: input.consent,
      confidential: input.confidential ?? false,
      status: 'recording',
    })
    .select('id')
    .single()

  if (error || !meeting) throw new Error(error?.message || 'Création de la réunion impossible')

  if (input.participantIds.length) {
    await supabase.from('meeting_participants').insert(
      input.participantIds.map((employee_id) => ({
        user_id: user.id,
        meeting_id: meeting.id,
        employee_id,
      })),
    )
  }

  revalidatePath('/reunions')
  return { id: meeting.id }
}

/** Enregistre la transcription (Web Speech) et passe la réunion en "draft". */
export async function saveTranscript(meetingId: string, transcript: string, durationSec: number) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non authentifié')

  const { error } = await supabase
    .from('meetings')
    .update({
      transcript,
      duration_sec: Math.max(0, Math.round(durationSec)),
      status: 'draft',
      updated_at: new Date().toISOString(),
    })
    .eq('id', meetingId)
    .eq('user_id', user.id)

  if (error) throw new Error(error.message)
  revalidatePath(`/reunions/${meetingId}`)
  revalidatePath('/reunions')
}

/** Ajoute un marqueur horodaté saisi pendant la réunion. */
export async function addMarker(meetingId: string, atSec: number, kind: 'note' | 'decision' | 'action', label: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non authentifié')
  if (!label.trim()) return
  await supabase.from('meeting_markers').insert({
    user_id: user.id,
    meeting_id: meetingId,
    at_sec: Math.max(0, Math.round(atSec)),
    kind,
    label: label.trim(),
  })
  revalidatePath(`/reunions/${meetingId}`)
}

export async function deleteMeeting(meetingId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non authentifié')
  await supabase.from('meetings').delete().eq('id', meetingId).eq('user_id', user.id)
  revalidatePath('/reunions')
}

/** Publie la réunion : visible + actions actives dans l'espace des salariés participants. */
export async function publishMeeting(meetingId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non authentifié')
  const { error } = await supabase
    .from('meetings')
    .update({ status: 'published', published_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', meetingId)
    .eq('user_id', user.id)
  if (error) throw new Error(error.message)
  revalidatePath(`/reunions/${meetingId}`)
  revalidatePath('/reunions')
  revalidatePath('/terrain/reunions')
}

type ActionPatch = {
  title?: string
  details?: string | null
  employee_id?: string | null
  due_date?: string | null
  priority?: 'low' | 'normal' | 'high'
  status?: 'todo' | 'doing' | 'done'
}

export async function updateAction(actionId: string, patch: ActionPatch) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non authentifié')
  const clean: Record<string, unknown> = { ...patch }
  if (patch.status) clean.done_at = patch.status === 'done' ? new Date().toISOString() : null
  const { error } = await supabase.from('meeting_actions').update(clean).eq('id', actionId).eq('user_id', user.id)
  if (error) throw new Error(error.message)
}

export async function addAction(meetingId: string, projectId: string | null) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non authentifié')
  const { data, error } = await supabase
    .from('meeting_actions')
    .insert({ user_id: user.id, meeting_id: meetingId, project_id: projectId, title: 'Nouvelle action', priority: 'normal', status: 'todo', sort_order: 999 })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function deleteAction(actionId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non authentifié')
  await supabase.from('meeting_actions').delete().eq('id', actionId).eq('user_id', user.id)
}
