import { createClient } from '@/lib/supabase/server'
import HeuresView from './HeuresView'

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

export default async function HeuresPage({
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
  const [{ data: employees }, { data: projects }, { data: assignments }, { data: entries }, { data: presence }, { data: vehicleLogs }] = await Promise.all([
    supabase.from('employees').select('id,full_name,color,hourly_cost').eq('user_id', user.id).eq('active', true).order('full_name'),
    supabase.from('projects').select('id,title,status').eq('user_id', user.id).not('status', 'in', `(${closed.join(',')})`).order('created_at', { ascending: false }),
    supabase.from('assignments').select('employee_id,project_id,date').eq('user_id', user.id).gte('date', days[0]).lte('date', days[6]),
    supabase.from('time_entries').select('id,employee_id,project_id,date,hours,status').eq('user_id', user.id).gte('date', days[0]).lte('date', days[6]),
    supabase.from('presence_events').select('employee_id,type,photo_path,occurred_at').eq('user_id', user.id).gte('occurred_at', `${days[0]}T00:00:00`).lte('occurred_at', `${days[6]}T23:59:59`),
    supabase.from('vehicle_logs').select('project_id,date,hours_present').eq('user_id', user.id).gte('date', days[0]).lte('date', days[6]),
  ])

  return (
    <HeuresView
      days={days}
      prevWeek={prevWeek}
      nextWeek={nextWeek}
      employees={employees || []}
      projects={projects || []}
      assignments={assignments || []}
      entries={entries || []}
      presence={presence || []}
      vehicleLogs={vehicleLogs || []}
    />
  )
}
