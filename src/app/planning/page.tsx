import { createClient } from '@/lib/supabase/server'
import PlanningView from './PlanningView'

function isoDate(d: Date) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function mondayOf(d: Date) {
  const x = new Date(d)
  const offset = (x.getDay() + 6) % 7 // 0 = lundi
  x.setDate(x.getDate() - offset)
  x.setHours(0, 0, 0, 0)
  return x
}
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x }

export default async function PlanningPage({
  searchParams,
}: { searchParams: Promise<{ week?: string }> }) {
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const base = sp.week ? new Date(sp.week + 'T00:00:00') : new Date()
  const monday = mondayOf(base)
  const days = Array.from({ length: 7 }, (_, i) => isoDate(addDays(monday, i)))
  const prevWeek = isoDate(addDays(monday, -7))
  const nextWeek = isoDate(addDays(monday, 7))

  const closed = ['termine', 'facture', 'paye', 'archive']
  const [{ data: projects }, { data: employees }, { data: assignments }] = await Promise.all([
    supabase.from('projects').select('id,title,status').eq('user_id', user.id).not('status', 'in', `(${closed.join(',')})`).order('created_at', { ascending: false }),
    supabase.from('employees').select('id,full_name,color').eq('user_id', user.id).eq('active', true).order('full_name'),
    supabase.from('assignments').select('id,employee_id,project_id,date').eq('user_id', user.id).gte('date', days[0]).lte('date', days[6]),
  ])

  return (
    <PlanningView
      days={days}
      prevWeek={prevWeek}
      nextWeek={nextWeek}
      projects={projects || []}
      employees={employees || []}
      assignments={assignments || []}
    />
  )
}
