import { createClient } from '@/lib/supabase/server'
import PlanningView, { type PlanningViewMode } from './PlanningView'

function isoDate(d: Date) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function mondayOf(d: Date) {
  const x = new Date(d)
  const offset = (x.getDay() + 6) % 7
  x.setDate(x.getDate() - offset)
  x.setHours(0, 0, 0, 0)
  return x
}
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x }
function addMonths(d: Date, n: number) { const x = new Date(d); x.setMonth(x.getMonth() + n); return x }

export default async function PlanningPage({
  searchParams,
}: { searchParams: Promise<{ view?: string; date?: string }> }) {
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const view: PlanningViewMode = sp.view === 'jour' || sp.view === 'mois' ? sp.view : 'semaine'
  const anchor = sp.date ? new Date(sp.date + 'T00:00:00') : new Date()

  let days: string[], prevDate: string, nextDate: string
  if (view === 'jour') {
    days = [isoDate(anchor)]
    prevDate = isoDate(addDays(anchor, -1)); nextDate = isoDate(addDays(anchor, 1))
  } else if (view === 'mois') {
    const y = anchor.getFullYear(), m = anchor.getMonth()
    const nb = new Date(y, m + 1, 0).getDate()
    days = Array.from({ length: nb }, (_, i) => isoDate(new Date(y, m, i + 1)))
    prevDate = isoDate(addMonths(new Date(y, m, 1), -1)); nextDate = isoDate(addMonths(new Date(y, m, 1), 1))
  } else {
    const monday = mondayOf(anchor)
    days = Array.from({ length: 7 }, (_, i) => isoDate(addDays(monday, i)))
    prevDate = isoDate(addDays(monday, -7)); nextDate = isoDate(addDays(monday, 7))
  }

  const closed = ['termine', 'facture', 'paye', 'archive']
  const [{ data: projects }, { data: employees }, { data: assignments }] = await Promise.all([
    supabase.from('projects').select('id,title,status,address').eq('user_id', user.id).not('status', 'in', `(${closed.join(',')})`).order('created_at', { ascending: false }),
    supabase.from('employees').select('id,full_name,color').eq('user_id', user.id).eq('active', true).order('full_name'),
    supabase.from('assignments').select('id,employee_id,project_id,date').eq('user_id', user.id).gte('date', days[0]).lte('date', days[days.length - 1]),
  ])

  return (
    <PlanningView
      view={view}
      days={days}
      anchor={isoDate(anchor)}
      prevDate={prevDate}
      nextDate={nextDate}
      projects={projects || []}
      employees={employees || []}
      assignments={assignments || []}
    />
  )
}
