import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import {
  Clock, ReceiptText, Camera, BellRing, Landmark, HardHat, Sun, ArrowRight, CheckCircle2, type LucideIcon,
} from 'lucide-react'

const DAY = 86_400_000
const daysSince = (d?: string | null) => (d ? Math.floor((Date.now() - new Date(d).getTime()) / DAY) : 0)
const num = (v: unknown) => Number(v) || 0
const CLOSED = ['termine', 'facture', 'paye', 'archive']

type Line = { icon: LucideIcon; tile: string; text: string; href?: string }

async function getData(userId: string) {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0)
  const iso = startOfDay.toISOString()

  const [timesRes, expRes, presRes, quotesRes, invRes, projRes] = await Promise.all([
    supabase.from('time_entries').select('employee_id, hours').eq('user_id', userId).eq('date', today),
    supabase.from('expenses').select('id').eq('user_id', userId).gte('created_at', iso),
    supabase.from('presence_events').select('id').eq('user_id', userId).gte('occurred_at', iso),
    supabase.from('quotes').select('status, issue_date, reminded_at').eq('user_id', userId),
    supabase.from('invoices').select('status, due_date').eq('user_id', userId),
    supabase.from('projects').select('status, end_date').eq('user_id', userId),
  ])

  const times = timesRes.data || []
  const quotes = quotesRes.data || []
  const invoices = invRes.data || []
  const projects = projRes.data || []

  const employeesDeclared = new Set(times.map(t => t.employee_id)).size
  const totalHours = times.reduce((s, t) => s + num(t.hours), 0)
  const ticketsToday = (expRes.data || []).length
  const pointagesToday = (presRes.data || []).length
  const aRelancer = quotes.filter(q => q.status === 'envoye' && daysSince(q.issue_date) >= 7 && (!q.reminded_at || daysSince(q.reminded_at) >= 7)).length
  const echues = invoices.filter(i => i.status === 'envoyee' && i.due_date && i.due_date < today).length
  const enRetard = projects.filter(p => !CLOSED.includes(p.status) && p.end_date && p.end_date < today).length

  const lines: Line[] = []
  if (employeesDeclared > 0) lines.push({ icon: Clock, tile: 'bg-blue-100 text-blue-600', text: `${employeesDeclared} salarié${employeesDeclared > 1 ? 's ont' : ' a'} déclaré ${totalHours} h aujourd'hui`, href: '/heures' })
  if (pointagesToday > 0) lines.push({ icon: Camera, tile: 'bg-violet-100 text-violet-600', text: `${pointagesToday} pointage${pointagesToday > 1 ? 's' : ''} chantier enregistré${pointagesToday > 1 ? 's' : ''}`, href: '/pointage' })
  if (ticketsToday > 0) lines.push({ icon: ReceiptText, tile: 'bg-rose-100 text-rose-600', text: `${ticketsToday} ticket${ticketsToday > 1 ? 's' : ''} / dépense${ticketsToday > 1 ? 's' : ''} ajouté${ticketsToday > 1 ? 's' : ''}`, href: '/depenses' })
  if (aRelancer > 0) lines.push({ icon: BellRing, tile: 'bg-accent text-primary', text: `${aRelancer} devis attend${aRelancer > 1 ? 'ent' : ''} une relance`, href: '/relances' })
  if (echues > 0) lines.push({ icon: Landmark, tile: 'bg-amber-100 text-amber-600', text: `${echues} facture${echues > 1 ? 's' : ''} échue${echues > 1 ? 's' : ''} à encaisser`, href: '/banque' })
  if (enRetard > 0) lines.push({ icon: HardHat, tile: 'bg-rose-100 text-rose-600', text: `${enRetard} chantier${enRetard > 1 ? 's ont' : ' a'} dépassé la date de fin prévue`, href: '/chantiers' })

  return { lines, totalHours, employeesDeclared, ticketsToday, aRelancer }
}

export default async function ResumePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single()
  const prenom = profile?.full_name?.split(' ')[0] || 'vous'
  const d = await getData(user.id)
  const dateLabel = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="animate-fade-up">
        <h1 className="text-2xl md:text-[28px] font-heading font-bold text-marine flex items-center gap-2">
          <Sun className="w-6 h-6 text-primary" /> Résumé du jour
        </h1>
        <p className="text-gray-500 mt-1 text-sm capitalize">{dateLabel}</p>
      </div>

      <Card className="border border-gray-200/80 bg-white animate-fade-up">
        <CardContent className="p-5">
          <p className="text-sm text-gray-500 mb-4">Bonjour <span className="font-semibold text-marine">{prenom}</span>, voici ta journée en un coup d&apos;œil :</p>
          {d.lines.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Rien à signaler pour l&apos;instant — journée calme.
            </div>
          ) : (
            <div className="space-y-2">
              {d.lines.map((l, i) => (
                <Link key={i} href={l.href || '#'} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 transition-colors group">
                  <span className={`grid place-items-center w-9 h-9 rounded-lg flex-shrink-0 ${l.tile}`}><l.icon className="w-4 h-4" /></span>
                  <span className="text-sm text-gray-700 flex-1">{l.text}</span>
                  <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-primary transition-colors" />
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
