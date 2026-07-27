import { createClient } from '@/lib/supabase/server'
import ReunionsClient from './ReunionsClient'

export default async function ReunionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: meetings }, { data: employees }, { data: projects }] = await Promise.all([
    supabase
      .from('meetings')
      .select('*, meeting_participants(employee_id), meeting_actions(id, status)')
      .eq('user_id', user.id)
      .order('occurred_at', { ascending: false }),
    supabase
      .from('employees')
      .select('id, full_name, color, role')
      .eq('user_id', user.id)
      .eq('active', true)
      .order('full_name'),
    supabase
      .from('projects')
      .select('id, title')
      .eq('user_id', user.id)
      .neq('status', 'archive')
      .order('created_at', { ascending: false }),
  ])

  return (
    <ReunionsClient
      meetings={meetings || []}
      employees={employees || []}
      projects={projects || []}
    />
  )
}
