import { createClient } from '@/lib/supabase/server'
import ActionsBoard from './ActionsBoard'

export default async function ReunionsActionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: actions }, { data: employees }, { data: projects }] = await Promise.all([
    supabase
      .from('meeting_actions')
      .select('*, meetings(id, title, occurred_at, status), employees(id, full_name, color), projects(id, title)')
      .eq('user_id', user.id)
      .order('due_date', { ascending: true, nullsFirst: false }),
    supabase.from('employees').select('id, full_name, color').eq('user_id', user.id).eq('active', true).order('full_name'),
    supabase.from('projects').select('id, title').eq('user_id', user.id).neq('status', 'archive').order('created_at', { ascending: false }),
  ])

  return <ActionsBoard actions={(actions as any) || []} employees={employees || []} projects={projects || []} />
}
