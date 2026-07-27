import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import MeetingRecorder from './MeetingRecorder'

export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: meeting } = await supabase
    .from('meetings')
    .select('*, projects(title)')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()
  if (!meeting) notFound()

  const [{ data: participants }, { data: actions }, { data: employees }] = await Promise.all([
    supabase
      .from('meeting_participants')
      .select('employee_id, employees(id, full_name, color)')
      .eq('meeting_id', id)
      .eq('user_id', user.id),
    supabase
      .from('meeting_actions')
      .select('*')
      .eq('meeting_id', id)
      .eq('user_id', user.id)
      .order('sort_order'),
    supabase
      .from('employees')
      .select('id, full_name, color')
      .eq('user_id', user.id)
      .eq('active', true)
      .order('full_name'),
  ])

  return (
    <MeetingRecorder
      meeting={meeting as any}
      participants={(participants as any) || []}
      actions={actions || []}
      employees={employees || []}
    />
  )
}
