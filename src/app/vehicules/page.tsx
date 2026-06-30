import { createClient } from '@/lib/supabase/server'
import VehiculesManager, { type VehicleMeta } from './VehiculesManager'

const num = (v: unknown) => Number(v) || 0

export default async function VehiculesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [vehiclesRes, employeesRes, logsRes, projectsRes] = await Promise.all([
    supabase.from('vehicles').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    supabase.from('employees').select('*').eq('user_id', user.id).eq('active', true).order('full_name'),
    supabase.from('vehicle_logs').select('vehicle_id, project_id, date, hours_present, km').eq('user_id', user.id),
    supabase.from('projects').select('id, title').eq('user_id', user.id).neq('status', 'archive').order('created_at', { ascending: false }),
  ])

  const vehicles = vehiclesRes.data || []
  const logs = logsRes.data || []
  const projTitle = new Map((projectsRes.data || []).map(p => [p.id, p.title]))
  const since7d = new Date(); since7d.setDate(since7d.getDate() - 7)
  const since7 = since7d.toISOString().split('T')[0]

  const meta: Record<string, VehicleMeta> = {}
  for (const v of vehicles) {
    const mine = logs.filter(l => l.vehicle_id === v.id).sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    const last = mine[0] || null
    meta[v.id] = {
      chantier: last?.project_id ? { id: last.project_id, title: projTitle.get(last.project_id) || 'Chantier' } : null,
      dernierTrajet: last?.date || null,
      tempsTotal: mine.reduce((s, l) => s + num(l.hours_present), 0),
      kmTotal: mine.reduce((s, l) => s + num(l.km), 0),
      alerte: v.active && (!last || (last.date || '') < since7) ? 'Aucun relevé récent' : null,
    }
  }

  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <h1 className="text-2xl md:text-[28px] font-heading font-bold text-marine">Flotte & véhicules</h1>
        <p className="text-gray-500 mt-1 text-sm">Tes véhicules, leurs conducteurs et leur présence sur les chantiers. Saisie manuelle ou import.</p>
      </div>
      <VehiculesManager vehicles={vehicles} employees={employeesRes.data || []} meta={meta} projects={projectsRes.data || []} />
    </div>
  )
}
