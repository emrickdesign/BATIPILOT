import { createClient } from '@/lib/supabase/server'
import PlanningView, { type PlanningViewMode } from './PlanningView'
import { geocodeAddress, fetchForecast, coordKey, FORECAST_DAYS, type DayWeather } from '@/lib/meteo'

export type WeatherAlert = {
  projectId: string
  projectTitle: string
  date: string
  dateLabel: string
  risk: DayWeather['risk']
  emoji: string
  detail: string
  nbAffectes: number
  suggestDate: string | null
  suggestLabel: string | null
}

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
  const [{ data: projectsRaw }, { data: employees }, { data: assignments }, { data: absencesRaw }] = await Promise.all([
    supabase.from('projects').select('id,title,status,address,is_outdoor,latitude,longitude').eq('user_id', user.id).not('status', 'in', `(${closed.join(',')})`).order('created_at', { ascending: false }),
    supabase.from('employees').select('id,full_name,color').eq('user_id', user.id).eq('active', true).order('full_name'),
    supabase.from('assignments').select('id,employee_id,project_id,date,start_hour,end_hour').eq('user_id', user.id).gte('date', days[0]).lte('date', days[days.length - 1]),
    supabase.from('absences').select('employee_id,start_date,end_date').eq('user_id', user.id).lte('start_date', days[days.length - 1]).gte('end_date', days[0]),
  ])
  const projects = projectsRaw || []

  // Salariés absents par jour (congés/maladie…) → exclus des disponibilités et des affectations.
  const absentByDate: Record<string, string[]> = {}
  for (const d of days) {
    absentByDate[d] = ((absencesRaw || []) as { employee_id: string; start_date: string; end_date: string }[])
      .filter(a => a.start_date <= d && a.end_date >= d).map(a => a.employee_id)
  }

  // ── Météo : géocodage lazy + prévisions + alertes replanification ──────
  const todayIso = isoDate(new Date())
  const horizon = new Set(Array.from({ length: FORECAST_DAYS }, (_, i) => isoDate(addDays(new Date(), i))))
  // On ne calcule la météo que pour les chantiers extérieurs (déclencheurs de l'alerte).
  const outdoor = projects.filter(p => p.is_outdoor && p.address)

  // Géocode ceux qui ont une adresse mais pas encore de coordonnées (1 seule fois, persisté).
  await Promise.all(outdoor.filter(p => p.latitude == null).map(async p => {
    const g = await geocodeAddress(p.address as string)
    if (!g) return
    p.latitude = g.lat; p.longitude = g.lon
    await supabase.from('projects').update({ latitude: g.lat, longitude: g.lon, geocoded_at: new Date().toISOString() }).eq('id', p.id)
  }))

  // Prévisions par coordonnée (dédupliquées), uniquement si des jours visibles tombent dans l'horizon.
  const visibleInHorizon = days.some(d => horizon.has(d))
  const forecastByKey = new Map<string, DayWeather[]>()
  const geocoded = outdoor.filter(p => p.latitude != null && p.longitude != null)
  if (visibleInHorizon && geocoded.length) {
    const keys = new Map<string, { lat: number; lon: number }>()
    for (const p of geocoded) keys.set(coordKey(p.latitude!, p.longitude!), { lat: p.latitude!, lon: p.longitude! })
    await Promise.all([...keys].map(async ([k, c]) => { forecastByKey.set(k, await fetchForecast(c.lat, c.lon)) }))
  }

  // weather[projectId][date] = DayWeather (pour les jours visibles dans l'horizon)
  const weather: Record<string, Record<string, DayWeather>> = {}
  for (const p of geocoded) {
    const fc = forecastByKey.get(coordKey(p.latitude!, p.longitude!))
    if (!fc) continue
    const byDate: Record<string, DayWeather> = {}
    for (const dw of fc) if (days.includes(dw.date)) byDate[dw.date] = dw
    if (Object.keys(byDate).length) weather[p.id] = byDate
  }

  // Alertes : chantier extérieur + météo dégradée + équipe affectée un jour à venir.
  const assignCount = new Map<string, number>()
  for (const a of assignments || []) assignCount.set(`${a.project_id}|${a.date}`, (assignCount.get(`${a.project_id}|${a.date}`) || 0) + 1)
  const fmtDay = (iso: string) => {
    const dt = new Date(iso + 'T00:00:00')
    return `${['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'][dt.getDay()]} ${dt.getDate()}/${String(dt.getMonth() + 1).padStart(2, '0')}`
  }
  const weatherAlerts: WeatherAlert[] = []
  for (const p of geocoded) {
    const fc = forecastByKey.get(coordKey(p.latitude!, p.longitude!))
    if (!fc) continue
    const goodDays = new Set(fc.filter(d => !d.bad && d.date >= todayIso).map(d => d.date))
    for (const d of days) {
      if (d < todayIso || !horizon.has(d)) continue
      const dw = (weather[p.id] || {})[d]
      if (!dw || !dw.bad) continue
      const nb = assignCount.get(`${p.id}|${d}`) || 0
      if (nb === 0) continue
      // Suggère le prochain jour clément (dans l'horizon, après le jour concerné).
      const suggest = [...goodDays].filter(g => g > d).sort()[0] || null
      weatherAlerts.push({
        projectId: p.id, projectTitle: p.title, date: d, dateLabel: fmtDay(d),
        risk: dw.risk, emoji: dw.emoji, detail: dw.label, nbAffectes: nb,
        suggestDate: suggest, suggestLabel: suggest ? fmtDay(suggest) : null,
      })
    }
  }
  weatherAlerts.sort((a, b) => a.date.localeCompare(b.date))

  return (
    <PlanningView
      view={view}
      days={days}
      anchor={isoDate(anchor)}
      prevDate={prevDate}
      nextDate={nextDate}
      projects={projects}
      employees={employees || []}
      assignments={assignments || []}
      absentByDate={absentByDate}
      weather={weather}
      weatherAlerts={weatherAlerts}
    />
  )
}
