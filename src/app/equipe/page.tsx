import { createClient } from '@/lib/supabase/server'
import type { Employee } from '@/types'
import EquipeManager, { type EmployeeMeta } from './EquipeManager'

const num = (v: unknown) => Number(v) || 0

export default async function EquipePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const monday = new Date(now); monday.setDate(now.getDate() - ((now.getDay() + 6) % 7)); monday.setHours(0, 0, 0, 0)
  const mondayStr = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`

  const [{ data: employees }, { data: assignments }, { data: times }, { data: vehicles }, { data: projects }] = await Promise.all([
    supabase.from('employees').select('*').eq('user_id', user.id).order('active', { ascending: false }).order('full_name'),
    supabase.from('assignments').select('employee_id, project_id').eq('user_id', user.id).eq('date', todayStr),
    supabase.from('time_entries').select('employee_id, hours, date').eq('user_id', user.id).gte('date', mondayStr),
    supabase.from('vehicles').select('id, name, plate, driver_employee_id').eq('user_id', user.id).eq('active', true),
    supabase.from('projects').select('id, title').eq('user_id', user.id),
  ])

  const projTitle = new Map((projects || []).map(p => [p.id, p.title]))
  const chantierActuel = new Map<string, { id: string; title: string }>()
  for (const a of assignments || []) if (a.project_id) chantierActuel.set(a.employee_id, { id: a.project_id, title: projTitle.get(a.project_id) || 'Chantier' })
  const heuresSemaine = new Map<string, number>()
  for (const t of times || []) heuresSemaine.set(t.employee_id, (heuresSemaine.get(t.employee_id) || 0) + num(t.hours))
  const vehicule = new Map<string, { name: string; plate: string | null }>()
  for (const v of vehicles || []) if (v.driver_employee_id) vehicule.set(v.driver_employee_id, { name: v.name, plate: v.plate })

  const meta: Record<string, EmployeeMeta> = {}
  for (const e of employees || []) {
    meta[e.id] = {
      chantier: chantierActuel.get(e.id) || null,
      heuresSemaine: heuresSemaine.get(e.id) || 0,
      vehicule: vehicule.get(e.id) || null,
    }
  }

  return <EquipeManager employees={(employees as Employee[]) || []} meta={meta} />
}
