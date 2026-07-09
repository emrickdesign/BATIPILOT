import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, AlertTriangle, HelpCircle } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import AddVehicleLog from './AddVehicleLog'

const num = (v: unknown) => Number(v) || 0

type Status = 'coherent' | 'ecart_faible' | 'ecart_important' | 'sans_vehicule' | 'sans_heures'
const STATUS: Record<Status, { label: string; cls: string }> = {
  coherent: { label: 'Cohérent', cls: 'bg-[#E9F2DB] text-[#3F7A2E]' },
  ecart_faible: { label: 'Écart faible', cls: 'bg-amber-100 text-amber-700' },
  ecart_important: { label: 'Écart important', cls: 'bg-[#FBE0DA] text-[#C0392B]' },
  sans_vehicule: { label: 'Heures sans véhicule', cls: 'bg-amber-100 text-amber-700' },
  sans_heures: { label: 'Véhicule sans heures', cls: 'bg-amber-100 text-amber-700' },
}

function classify(emp: number, veh: number): Status {
  if (veh === 0 && emp > 0) return 'sans_vehicule'
  if (emp === 0 && veh > 0) return 'sans_heures'
  const d = Math.abs(emp - veh)
  if (d <= 1) return 'coherent'
  if (d <= 3) return 'ecart_faible'
  return 'ecart_important'
}

async function getData(userId: string) {
  const supabase = await createClient()
  const [timesRes, logsRes, projectsRes, vehiclesRes] = await Promise.all([
    supabase.from('time_entries').select('project_id, date, hours').eq('user_id', userId),
    supabase.from('vehicle_logs').select('project_id, date, hours_present').eq('user_id', userId),
    supabase.from('projects').select('id, title').eq('user_id', userId),
    supabase.from('vehicles').select('id, name').eq('user_id', userId).eq('active', true),
  ])

  const times = timesRes.data || []
  const logs = logsRes.data || []
  const projectTitle = new Map((projectsRes.data || []).map(p => [p.id, p.title]))

  const rows = new Map<string, { project_id: string | null; date: string; emp: number; veh: number }>()
  const key = (pid: string | null, d: string) => `${pid || 'none'}__${d}`
  for (const t of times) {
    if (!t.date) continue
    const k = key(t.project_id, t.date)
    const r = rows.get(k) || { project_id: t.project_id, date: t.date, emp: 0, veh: 0 }
    r.emp += num(t.hours); rows.set(k, r)
  }
  for (const l of logs) {
    if (!l.date) continue
    const k = key(l.project_id, l.date)
    const r = rows.get(k) || { project_id: l.project_id, date: l.date, emp: 0, veh: 0 }
    r.veh += num(l.hours_present); rows.set(k, r)
  }

  const list = [...rows.values()]
    .map(r => ({ ...r, title: r.project_id ? projectTitle.get(r.project_id) ?? 'Chantier' : 'Sans chantier', status: classify(r.emp, r.veh) }))
    .sort((a, b) => b.date.localeCompare(a.date))

  return {
    list,
    projects: projectsRes.data || [],
    vehicles: vehiclesRes.data || [],
    nbAlertes: list.filter(r => r.status !== 'coherent').length,
  }
}

export default async function ControlePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const d = await getData(user.id)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3 animate-fade-up">
        <div>
          <h1 className="text-2xl md:text-[28px] font-heading font-bold text-marine">Contrôle croisé heures / véhicules</h1>
          <p className="text-gray-500 mt-1 text-sm">Compare les heures déclarées par les salariés avec la présence des véhicules sur chantier.</p>
        </div>
        <Badge className={`${d.nbAlertes > 0 ? 'bg-amber-100 text-amber-700' : 'bg-[#E9F2DB] text-[#3F7A2E]'} border-0 gap-1`}>
          {d.nbAlertes > 0 ? <AlertTriangle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
          {d.nbAlertes > 0 ? `${d.nbAlertes} à vérifier` : 'Tout cohérent'}
        </Badge>
      </div>

      <AddVehicleLog vehicles={d.vehicles} projects={d.projects} />

      <Card className="border border-gray-200/80 bg-white">
        <CardContent className="p-2 sm:p-4">
          {d.list.length === 0 ? (
            <div className="flex flex-col items-center gap-2 text-sm text-gray-400 py-10 text-center">
              <HelpCircle className="w-6 h-6 text-gray-300" />
              Aucune donnée à comparer. Déclare des heures (module Heures) et ajoute des relevés véhicules ci-dessus.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                    <th className="pb-2 font-medium">Chantier</th>
                    <th className="pb-2 font-medium">Date</th>
                    <th className="pb-2 font-medium text-right">Heures déclarées</th>
                    <th className="pb-2 font-medium text-right">Présence véhicule</th>
                    <th className="pb-2 font-medium text-right">État</th>
                  </tr>
                </thead>
                <tbody>
                  {d.list.map((r, i) => (
                    <tr key={i} className="border-b border-gray-50 last:border-0">
                      <td className="py-2.5 text-marine font-medium truncate max-w-[180px]">{r.title}</td>
                      <td className="py-2.5 text-gray-500">{formatDate(r.date)}</td>
                      <td className="py-2.5 text-right tabular-nums text-gray-700">{r.emp} h</td>
                      <td className="py-2.5 text-right tabular-nums text-gray-700">{r.veh} h</td>
                      <td className="py-2.5 text-right">
                        <Badge className={`${STATUS[r.status].cls} border-0 text-[11px]`}>{STATUS[r.status].label}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
