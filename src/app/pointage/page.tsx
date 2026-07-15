import { createClient } from '@/lib/supabase/server'
import PointageClient from './PointageClient'
import type { PresenceType } from '@/types'

export default async function PointagePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  const [projectsRes, employeesRes, eventsRes, assignmentsRes] = await Promise.all([
    supabase.from('projects').select('id, title').eq('user_id', user.id).neq('status', 'archive').order('created_at', { ascending: false }),
    supabase.from('employees').select('id, full_name').eq('user_id', user.id).eq('active', true).order('full_name'),
    supabase.from('presence_events').select('id, type, occurred_at, note, lat, lng, project_id, employee_id')
      .eq('user_id', user.id).gte('occurred_at', startOfDay.toISOString()).order('occurred_at', { ascending: false }),
    supabase.from('assignments').select('employee_id').eq('user_id', user.id).eq('date', todayStr),
  ])

  const projects = projectsRes.data || []
  const employees = employeesRes.data || []
  const rawEvents = eventsRes.data || []
  const assignedToday = [...new Set((assignmentsRes.data || []).map(a => a.employee_id))]

  const projectTitle = new Map(projects.map(p => [p.id, p.title]))
  const employeeName = new Map(employees.map(e => [e.id, e.full_name]))

  const events = rawEvents.map((ev) => ({
    id: ev.id,
    type: ev.type as PresenceType,
    occurred_at: ev.occurred_at,
    note: ev.note,
    lat: ev.lat ?? null,
    lng: ev.lng ?? null,
    employee_id: ev.employee_id ?? null,
    projectTitle: ev.project_id ? projectTitle.get(ev.project_id) ?? null : null,
    employeeName: ev.employee_id ? employeeName.get(ev.employee_id) ?? null : null,
  }))

  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <h1 className="text-2xl md:text-[28px] font-heading font-bold text-marine">Pointage chantier</h1>
        <p className="text-gray-500 mt-1 text-sm">Pointage géolocalisé en un clic — arrivée, pause, départ. Pensé pour le mobile, sur le chantier.</p>
      </div>
      <PointageClient projects={projects} employees={employees} events={events} assignedToday={assignedToday} />
    </div>
  )
}
