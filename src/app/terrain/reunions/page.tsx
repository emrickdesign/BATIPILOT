import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getEmployeeSession } from '@/lib/employeeSession'
import PinGate from '../messages/PinGate'
import EmployeeReunionsView from './EmployeeReunionsView'

export default async function TerrainReunionsPage({ searchParams }: { searchParams: Promise<{ emp?: string }> }) {
  const session = await getEmployeeSession()

  if (session) {
    const service = createServiceClient()
    const { data: parts } = await service
      .from('meeting_participants')
      .select('meeting_id')
      .eq('user_id', session.userId)
      .eq('employee_id', session.employeeId)
    const meetingIds = (parts || []).map((p) => p.meeting_id)

    let meetings: any[] = []
    let actions: any[] = []
    if (meetingIds.length) {
      const [{ data: mtgs }, { data: acts }] = await Promise.all([
        service
          .from('meetings')
          .select('id, title, type, occurred_at, summary, projects(title)')
          .in('id', meetingIds)
          .eq('status', 'published')
          .order('occurred_at', { ascending: false }),
        service
          .from('meeting_actions')
          .select('*')
          .eq('user_id', session.userId)
          .eq('employee_id', session.employeeId)
          .in('meeting_id', meetingIds)
          .order('created_at'),
      ])
      meetings = mtgs || []
      const pubIds = new Set(meetings.map((m) => m.id))
      actions = (acts || []).filter((a) => pubIds.has(a.meeting_id))
    }

    return <EmployeeReunionsView meetings={meetings} actions={actions} />
  }

  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: employees } = await supabase
    .from('employees')
    .select('id, full_name, color')
    .eq('user_id', user.id)
    .eq('active', true)
    .order('full_name')

  return <PinGate employees={employees || []} preselected={sp.emp} />
}
