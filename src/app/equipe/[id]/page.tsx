import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Phone, Mail, HardHat, Clock, Truck, Camera, LogIn, LogOut, Coffee, Play } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { employeeInitials } from '@/lib/equipe'
import { presenceShort } from '@/lib/pointage'
import AbsencesPanel, { type Absence } from './AbsencesPanel'
import EmployeeDocsPanel, { type EmpDoc } from './EmployeeDocsPanel'
import type { Employee, PresenceType } from '@/types'

const num = (v: unknown) => Number(v) || 0
const PIC: Record<string, typeof LogIn> = { arrivee: LogIn, depart: LogOut, pause: Coffee, reprise: Play, photo: Camera }

export default async function FicheSalariePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: emp } = await supabase.from('employees').select('*').eq('id', id).eq('user_id', user.id).single()
  if (!emp) return notFound()
  const e = emp as Employee

  const [{ data: assignments }, { data: times }, { data: presence }, { data: vehicles }, { data: projects }] = await Promise.all([
    supabase.from('assignments').select('project_id, date').eq('user_id', user.id).eq('employee_id', id).order('date', { ascending: false }).limit(60),
    supabase.from('time_entries').select('project_id, hours, date').eq('user_id', user.id).eq('employee_id', id),
    supabase.from('presence_events').select('type, occurred_at, photo_path, project_id').eq('user_id', user.id).eq('employee_id', id).order('occurred_at', { ascending: false }).limit(8),
    supabase.from('vehicles').select('id, name, plate').eq('user_id', user.id).eq('driver_employee_id', id),
    supabase.from('projects').select('id, title').eq('user_id', user.id),
  ])

  const [{ data: absences }, { data: empDocs }] = await Promise.all([
    supabase.from('absences').select('*').eq('user_id', user.id).eq('employee_id', id).order('start_date', { ascending: false }),
    supabase.from('documents').select('id,name,category,expiry_date,storage_path,created_at').eq('user_id', user.id).eq('employee_id', id).order('created_at', { ascending: false }),
  ])

  const projTitle = new Map((projects || []).map(p => [p.id, p.title]))
  const totalHeures = (times || []).reduce((s, t) => s + num(t.hours), 0)
  const heuresByProject = new Map<string, number>()
  for (const t of times || []) if (t.project_id) heuresByProject.set(t.project_id, (heuresByProject.get(t.project_id) || 0) + num(t.hours))
  const chantiers = [...new Set((assignments || []).map(a => a.project_id).filter(Boolean))] as string[]

  const presenceItems = await Promise.all((presence || []).map(async ev => {
    let photoUrl: string | null = null
    if (ev.photo_path) { const { data } = await supabase.storage.from('documents').createSignedUrl(ev.photo_path, 3600); photoUrl = data?.signedUrl ?? null }
    return { ...ev, photoUrl }
  }))

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/equipe"><Button variant="ghost" size="sm" className="gap-1"><ArrowLeft className="w-4 h-4" /> Retour</Button></Link>
        <span className="grid place-items-center w-10 h-10 rounded-full text-white font-bold text-sm flex-shrink-0" style={{ backgroundColor: e.color }}>{employeeInitials(e.full_name)}</span>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 truncate leading-tight">{e.full_name}</h1>
          <div className="flex items-center gap-2">
            {e.role && <span className="text-sm text-gray-500">{e.role}</span>}
            {!e.active && <Badge className="bg-gray-100 text-gray-500 border-0 text-xs">Inactif</Badge>}
          </div>
        </div>
      </div>

      {/* Coordonnées + compétences */}
      <Card><CardContent className="p-4 space-y-3">
        {e.phone && <div className="flex items-center gap-2 text-sm"><Phone className="w-4 h-4 text-gray-400" /><a href={`tel:${e.phone}`} className="text-primary">{e.phone}</a></div>}
        {e.email && <div className="flex items-center gap-2 text-sm"><Mail className="w-4 h-4 text-gray-400" /><a href={`mailto:${e.email}`} className="text-primary truncate">{e.email}</a></div>}
        {e.hourly_cost != null && <div className="text-sm text-gray-600">Coût horaire : <span className="font-medium">{e.hourly_cost} €/h</span></div>}
        {(vehicles || []).length > 0 && (
          <div className="flex items-center gap-2 text-sm text-gray-600"><Truck className="w-4 h-4 text-gray-400" />{vehicles!.map(v => v.name + (v.plate ? ` (${v.plate})` : '')).join(', ')}</div>
        )}
        {e.skills?.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">{e.skills.map(s => <Badge key={s} className="bg-accent text-primary border-0 text-[11px]">{s}</Badge>)}</div>
        )}
        {e.notes && <div className="pt-2 border-t border-gray-100"><p className="text-sm text-gray-500 italic whitespace-pre-line">{e.notes}</p></div>}
      </CardContent></Card>

      {/* Heures */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-base flex items-center gap-2"><Clock className="w-4 h-4 text-gray-400" /> Heures · {totalHeures.toFixed(1).replace('.0', '')} h au total</CardTitle></CardHeader>
        <CardContent className="px-4 pb-4">
          {heuresByProject.size === 0 ? <p className="text-sm text-gray-400 py-1">Aucune heure déclarée.</p> : (
            <div className="space-y-1.5">
              {[...heuresByProject.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([pid, h]) => (
                <div key={pid} className="flex items-center justify-between text-sm">
                  <Link href={`/chantiers/${pid}`} className="text-gray-700 hover:text-primary truncate">{projTitle.get(pid) || 'Chantier'}</Link>
                  <span className="font-medium tabular-nums">{h.toFixed(1).replace('.0', '')} h</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Chantiers affectés */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-base flex items-center gap-2"><HardHat className="w-4 h-4 text-gray-400" /> Chantiers affectés ({chantiers.length})</CardTitle></CardHeader>
        <CardContent className="px-4 pb-4">
          {chantiers.length === 0 ? <p className="text-sm text-gray-400 py-1">Aucune affectation. <Link href="/planning" className="text-primary hover:underline">Planifier</Link></p> : (
            <div className="space-y-2">
              {chantiers.map(pid => (
                <Link key={pid} href={`/chantiers/${pid}`}>
                  <div className="flex items-center gap-2 py-2 hover:bg-gray-50 rounded px-2 -mx-2">
                    <HardHat className="w-4 h-4 text-gray-400 flex-shrink-0" /><span className="text-sm text-gray-700 truncate">{projTitle.get(pid) || 'Chantier'}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pointages récents */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-base flex items-center gap-2"><Camera className="w-4 h-4 text-gray-400" /> Pointages récents</CardTitle></CardHeader>
        <CardContent className="px-4 pb-4">
          {presenceItems.length === 0 ? <p className="text-sm text-gray-400 py-1">Aucun pointage enregistré.</p> : (
            <div className="divide-y divide-gray-50">
              {presenceItems.map((ev, i) => {
                const I = PIC[ev.type] || Camera
                return (
                  <div key={i} className="flex items-center gap-3 py-2">
                    <span className="grid place-items-center w-8 h-8 rounded-lg bg-gray-100 text-gray-500 flex-shrink-0"><I className="w-4 h-4" /></span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-gray-700">{presenceShort[ev.type as PresenceType]}</div>
                      <div className="text-xs text-gray-400 truncate">{ev.project_id ? projTitle.get(ev.project_id) || 'Chantier' : 'Sans chantier'}</div>
                    </div>
                    {ev.photoUrl && <a href={ev.photoUrl} target="_blank" rel="noopener noreferrer" className="flex-shrink-0"><img src={ev.photoUrl} alt="" className="w-9 h-9 rounded-lg object-cover border border-gray-200" /></a>}
                    <span className="text-xs text-gray-400 flex-shrink-0">{formatDate(ev.occurred_at)} {new Date(ev.occurred_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <AbsencesPanel employeeId={id} initial={(absences || []) as Absence[]} />
      <EmployeeDocsPanel employeeId={id} initial={(empDocs || []) as EmpDoc[]} />

      <p className="text-[11px] text-gray-400">Modifier les infos du salarié depuis la liste Équipe.</p>
    </div>
  )
}
