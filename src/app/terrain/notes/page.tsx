import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getEmployeeSession } from '@/lib/employeeSession'
import PinGate from '../messages/PinGate'
import EmployeeNotesView, { type TerrainNote } from './EmployeeNotesView'

export default async function TerrainNotesPage({ searchParams }: { searchParams: Promise<{ emp?: string }> }) {
  const session = await getEmployeeSession()

  if (session) {
    const service = createServiceClient()
    const [{ data: projects }, { data: notes }] = await Promise.all([
      service.from('projects').select('id, title').eq('user_id', session.userId).neq('status', 'archive').order('created_at', { ascending: false }),
      service.from('notes')
        .select('id, project_id, body, author_name, author_employee_id, created_at, projects(title)')
        .eq('user_id', session.userId).order('created_at', { ascending: false }),
    ])
    const rows: TerrainNote[] = (notes || []).map(n => ({
      id: n.id,
      project_id: n.project_id,
      project_title: (n.projects as { title?: string } | null)?.title || 'Chantier',
      body: n.body,
      author_name: n.author_name,
      author_employee_id: n.author_employee_id,
      created_at: n.created_at,
    }))
    return <EmployeeNotesView projects={(projects || []) as { id: string; title: string }[]} initial={rows} myEmployeeId={session.employeeId} />
  }

  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: employees } = await supabase.from('employees').select('id, full_name, color').eq('user_id', user.id).eq('active', true).order('full_name')

  return <PinGate employees={employees || []} preselected={sp.emp} />
}
