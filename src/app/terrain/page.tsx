import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import {
  Sun, HardHat, MapPin, Navigation, Camera, ReceiptText, Clock, User, Users2, LogIn, ArrowRight, ChevronLeft, MessageSquare, Building2,
} from 'lucide-react'
import { employeeInitials } from '@/lib/equipe'

const num = (v: unknown) => Number(v) || 0

export default async function TerrainPage({ searchParams }: { searchParams: Promise<{ emp?: string }> }) {
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: employees } = await supabase.from('employees').select('id, full_name, role, color, skills, phone, email').eq('user_id', user.id).eq('active', true).order('full_name')
  const emps = employees || []
  const me = sp.emp ? emps.find(e => e.id === sp.emp) : null

  // ─── Sélecteur "qui suis-je" (en attendant l'auth par salarié) ───
  if (!me) {
    return (
      <div className="min-h-screen bg-[#0F172A] text-white p-5">
        <div className="max-w-md mx-auto pt-4 space-y-6">
          <div className="flex justify-end">
            <Link href="/dashboard" className="inline-flex items-center gap-1 rounded-full bg-white/10 hover:bg-white/20 px-3 py-1.5 text-xs font-medium text-white transition-colors"><Building2 className="w-4 h-4" /> Vue admin</Link>
          </div>
          <div className="text-center">
            <span className="inline-grid place-items-center w-14 h-14 rounded-2xl bg-gradient-to-br from-[#FF8A2B] to-[#FF6A00] mb-3"><HardHat className="w-7 h-7 text-white" /></span>
            <h1 className="text-xl font-bold">BatiPilot <span className="text-primary">Terrain</span></h1>
            <p className="text-slate-400 text-sm mt-1">Qui es-tu ? Sélectionne ton profil pour commencer ta journée.</p>
          </div>
          {emps.length === 0 ? (
            <p className="text-center text-slate-400 text-sm">Aucun salarié. Ajoutez l&apos;équipe côté admin.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {emps.map(e => (
                <Link key={e.id} href={`/terrain?emp=${e.id}`}>
                  <div className="rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 p-4 flex flex-col items-center gap-2 text-center transition-colors">
                    <span className="grid place-items-center w-12 h-12 rounded-full text-white font-bold" style={{ backgroundColor: e.color }}>{employeeInitials(e.full_name)}</span>
                    <span className="text-sm font-medium truncate w-full">{e.full_name}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
          <p className="text-center text-[11px] text-slate-500">Aperçu de l&apos;interface salarié. La connexion individuelle par salarié arrivera dans une prochaine version.</p>
        </div>
      </div>
    )
  }

  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const monday = new Date(now); monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
  const mondayStr = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`

  const [{ data: myAssign }, { data: todayAll }, { data: times }, { data: projects }] = await Promise.all([
    supabase.from('assignments').select('project_id, date').eq('user_id', user.id).eq('employee_id', me.id).gte('date', mondayStr).order('date'),
    supabase.from('assignments').select('employee_id, project_id').eq('user_id', user.id).eq('date', todayStr),
    supabase.from('time_entries').select('hours, date').eq('user_id', user.id).eq('employee_id', me.id).gte('date', mondayStr),
    supabase.from('projects').select('id, title, address, notes').eq('user_id', user.id),
  ])

  const projById = new Map((projects || []).map(p => [p.id, p]))
  const empName = new Map(emps.map(e => [e.id, e.full_name]))
  const todayProjectIds = [...new Set((myAssign || []).filter(a => a.date === todayStr).map(a => a.project_id))]
  const myProjectIds = [...new Set((myAssign || []).map(a => a.project_id).filter(Boolean))] as string[]
  const heuresSemaine = (times || []).reduce((s, t) => s + num(t.hours), 0)
  const itineraire = (addr?: string | null) => addr ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}` : null

  const prenom = me.full_name.split(' ')[0]
  const dateLabel = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="min-h-screen bg-app-bg">
      {/* Header salarié */}
      <header className="bg-[#0F172A] text-white px-4 pt-4 pb-5">
        <div className="max-w-md mx-auto">
          <div className="flex items-center justify-between gap-2">
            <Link href="/terrain" className="flex items-center gap-1 text-slate-400 text-xs hover:text-white"><ChevronLeft className="w-4 h-4" /> Changer</Link>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 capitalize">{dateLabel}</span>
              <Link href="/dashboard" className="inline-flex items-center gap-1 rounded-full bg-white/10 hover:bg-white/20 px-2.5 py-1 text-[11px] font-medium text-white transition-colors"><Building2 className="w-3.5 h-3.5" /> Vue admin</Link>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-3">
            <span className="grid place-items-center w-11 h-11 rounded-full text-white font-bold" style={{ backgroundColor: me.color }}>{employeeInitials(me.full_name)}</span>
            <div>
              <h1 className="text-lg font-bold leading-tight">Bonjour {prenom} 👋</h1>
              <p className="text-slate-400 text-sm">{me.role || 'Salarié terrain'}</p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-md mx-auto p-4 space-y-5 -mt-2">
        {/* Aujourd'hui */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-1.5"><Sun className="w-3.5 h-3.5" /> Aujourd&apos;hui</h2>
          {todayProjectIds.length === 0 ? (
            <Card className="border border-gray-200/80"><CardContent className="p-4 text-sm text-gray-400 text-center">Aucun chantier prévu aujourd&apos;hui.</CardContent></Card>
          ) : (
            <div className="space-y-3">
              {todayProjectIds.map(pid => {
                const p = projById.get(pid!)
                if (!p) return null
                const team = (todayAll || []).filter(a => a.project_id === pid && a.employee_id !== me.id).map(a => empName.get(a.employee_id)).filter(Boolean)
                const itin = itineraire(p.address)
                return (
                  <Card key={pid} className="border border-gray-200/80">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="grid place-items-center w-9 h-9 rounded-lg bg-accent text-primary flex-shrink-0"><HardHat className="w-4 h-4" /></span>
                        <div className="font-semibold text-marine">{p.title}</div>
                      </div>
                      {p.address && <div className="flex items-start gap-2 text-sm text-gray-600"><MapPin className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />{p.address}</div>}
                      {team.length > 0 && <div className="flex items-center gap-2 text-sm text-gray-600"><Users2 className="w-4 h-4 text-gray-400" />Avec {team.join(', ')}</div>}
                      {p.notes && <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-2 whitespace-pre-line"><span className="font-medium text-gray-600">Consignes : </span>{p.notes}</div>}
                      <div className="flex gap-2">
                        {itin && <a href={itin} target="_blank" rel="noopener noreferrer" className="flex-1"><div className="flex items-center justify-center gap-1.5 h-11 rounded-xl border border-gray-200 text-sm font-medium text-marine"><Navigation className="w-4 h-4" /> Itinéraire</div></a>}
                        <Link href="/pointage" className="flex-1"><div className="flex items-center justify-center gap-1.5 h-11 rounded-xl bg-primary text-white text-sm font-semibold"><LogIn className="w-4 h-4" /> J&apos;arrive</div></Link>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </section>

        {/* Actions rapides */}
        <section className="grid grid-cols-4 gap-3">
          <QuickAction href="/pointage" icon={<Clock className="w-5 h-5" />} label="Pointer" />
          <QuickAction href="/tickets" icon={<ReceiptText className="w-5 h-5" />} label="Ticket" />
          <QuickAction href="/documents" icon={<Camera className="w-5 h-5" />} label="Photo" />
          <QuickAction href={`/terrain/messages?emp=${me.id}`} icon={<MessageSquare className="w-5 h-5" />} label="Messages" />
        </section>

        {/* Mes chantiers */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-1.5"><HardHat className="w-3.5 h-3.5" /> Mes chantiers</h2>
          {myProjectIds.length === 0 ? (
            <Card className="border border-gray-200/80"><CardContent className="p-4 text-sm text-gray-400 text-center">Aucun chantier affecté cette semaine.</CardContent></Card>
          ) : (
            <div className="space-y-2">
              {myProjectIds.map(pid => {
                const p = projById.get(pid)
                if (!p) return null
                const itin = itineraire(p.address)
                return (
                  <Card key={pid} className="border border-gray-200/80">
                    <CardContent className="p-3 flex items-center gap-3">
                      <span className="grid place-items-center w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex-shrink-0"><HardHat className="w-4 h-4" /></span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-marine truncate">{p.title}</div>
                        {p.address && <div className="text-xs text-gray-400 truncate">{p.address}</div>}
                      </div>
                      {itin && <a href={itin} target="_blank" rel="noopener noreferrer" className="grid place-items-center w-9 h-9 rounded-lg bg-gray-50 text-gray-500 flex-shrink-0"><Navigation className="w-4 h-4" /></a>}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </section>

        {/* Mes heures */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Mes heures</h2>
          <Card className="border border-gray-200/80"><CardContent className="p-4 flex items-center justify-between">
            <div><div className="text-2xl font-bold text-marine">{heuresSemaine.toFixed(1).replace('.0', '')} h</div><div className="text-xs text-gray-500">cette semaine</div></div>
            <Link href="/pointage" className="text-sm font-medium text-primary flex items-center gap-1">Pointer <ArrowRight className="w-3.5 h-3.5" /></Link>
          </CardContent></Card>
        </section>

        {/* Profil */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> Mon profil</h2>
          <Card className="border border-gray-200/80"><CardContent className="p-4 space-y-2">
            <div className="text-sm"><span className="text-gray-400">Nom : </span><span className="font-medium text-marine">{me.full_name}</span></div>
            {me.role && <div className="text-sm"><span className="text-gray-400">Rôle : </span>{me.role}</div>}
            {me.phone && <div className="text-sm"><span className="text-gray-400">Tél : </span>{me.phone}</div>}
            {me.skills?.length > 0 && <div className="flex flex-wrap gap-1 pt-1">{me.skills.map((s: string) => <span key={s} className="text-[11px] bg-accent text-primary rounded-full px-2 py-0.5">{s}</span>)}</div>}
          </CardContent></Card>
        </section>

        <p className="text-center text-[11px] text-gray-400 pb-4">Interface salarié — pas de données financières. Connexion individuelle par salarié à venir.</p>
      </div>
    </div>
  )
}

function QuickAction({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link href={href}>
      <div className="rounded-2xl bg-white border border-gray-200/80 p-3 flex flex-col items-center gap-1.5 text-center card-interactive">
        <span className="grid place-items-center w-10 h-10 rounded-xl bg-accent text-primary">{icon}</span>
        <span className="text-xs font-medium text-marine">{label}</span>
      </div>
    </Link>
  )
}
