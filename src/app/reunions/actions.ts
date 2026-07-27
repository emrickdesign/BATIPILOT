'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { notify } from '@/lib/notifications'
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

/** Met à jour le texte de la transcription (nettoyage manuel : suppression de passages, corrections). */
export async function updateTranscript(meetingId: string, transcript: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non authentifié')
  const { error } = await supabase
    .from('meetings')
    .update({ transcript, updated_at: new Date().toISOString() })
    .eq('id', meetingId)
    .eq('user_id', user.id)
  if (error) throw new Error(error.message)
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

  // Notifier chaque salarié participant (sauf réunion confidentielle RH)
  const [{ data: mtg }, { data: parts }, { data: acts }] = await Promise.all([
    supabase.from('meetings').select('title, confidential').eq('id', meetingId).eq('user_id', user.id).single(),
    supabase.from('meeting_participants').select('employee_id').eq('meeting_id', meetingId).eq('user_id', user.id),
    supabase.from('meeting_actions').select('employee_id').eq('meeting_id', meetingId).eq('user_id', user.id),
  ])
  if (mtg && !mtg.confidential) {
    const countByEmp: Record<string, number> = {}
    for (const a of acts || []) if (a.employee_id) countByEmp[a.employee_id] = (countByEmp[a.employee_id] || 0) + 1
    for (const p of parts || []) {
      const n = countByEmp[p.employee_id] || 0
      await notify(supabase, {
        user_id: user.id,
        employee_id: p.employee_id,
        kind: 'meeting_published',
        title: `Réunion : ${mtg.title}`,
        body: n > 0 ? `${n} action${n > 1 ? 's' : ''} à faire pour toi` : 'Compte-rendu disponible',
        href: '/terrain/reunions',
        meeting_id: meetingId,
      })
    }
  }

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

/** Transforme une action de réunion en affectation planning (table assignments). */
export async function assignActionToPlanning(actionId: string, date: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non authentifié')

  const { data: action } = await supabase
    .from('meeting_actions')
    .select('employee_id, project_id, title')
    .eq('id', actionId)
    .eq('user_id', user.id)
    .single()
  if (!action) throw new Error('Action introuvable')
  if (!action.employee_id) throw new Error('Assigne d’abord un salarié à cette action.')
  if (!action.project_id) throw new Error('Cette action n’est liée à aucun chantier.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Date invalide')

  const { error } = await supabase.from('assignments').insert({
    user_id: user.id,
    employee_id: action.employee_id,
    project_id: action.project_id,
    date,
    start_hour: 8,
    end_hour: 17,
    note: action.title,
  })
  if (error) throw new Error(error.message)
  // On bascule l'action en "en cours"
  await supabase.from('meeting_actions').update({ status: 'doing' }).eq('id', actionId).eq('user_id', user.id)
  revalidatePath('/reunions/actions')
  revalidatePath('/planning')
}
