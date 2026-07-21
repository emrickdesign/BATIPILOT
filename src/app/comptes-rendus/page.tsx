import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, CalendarDays, HardHat, Camera, FileText, ImageOff } from 'lucide-react'
import { mondayOf, isoDate, addDays, fmtRange } from '@/lib/comptes-rendus'
import { clientDisplayName } from '@/lib/chantiers'
import ReportActions from './ReportActions'

export default async function ComptesRendusPage({
  searchParams,
}: { searchParams: Promise<{ week?: string }> }) {
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const anchor = sp.week ? new Date(sp.week + 'T00:00:00') : new Date()
  const monday = mondayOf(anchor)
  const sunday = addDays(monday, 6)
  const fromIso = isoDate(monday), toIso = isoDate(sunday)
  const prevWeek = isoDate(addDays(monday, -7)), nextWeek = isoDate(addDays(monday, 7))

  const [{ data: updates }, { data: projects }] = await Promise.all([
    supabase.from('site_updates').select('id,project_id,update_date,photo_path,progress,note,created_at')
      .eq('user_id', user.id).gte('update_date', fromIso).lte('update_date', toIso).order('created_at', { ascending: true }),
    supabase.from('projects').select('id,title,client_id, clients(type,first_name,last_name,company_name,email)')
      .eq('user_id', user.id).neq('status', 'archive'),
  ])

  const ups = updates || []
  // URLs signées pour les vignettes (bucket privé).
  const withPhotos = ups.filter(u => u.photo_path)
  const signed = await Promise.all(withPhotos.map(u => supabase.storage.from('documents').createSignedUrl(u.photo_path as string, 3600)))
  const urlByUpdate = new Map(withPhotos.map((u, i) => [u.id, signed[i].data?.signedUrl]))

  type Cli = { type: string; first_name: string | null; last_name: string | null; company_name: string | null; email: string | null }
  const projById = new Map((projects || []).map(p => [p.id, p as unknown as { id: string; title: string; client_id: string | null; clients: Cli | null }]))

  // Regroupe par chantier
  const byProject = new Map<string, typeof ups>()
  for (const u of ups) {
    if (!byProject.has(u.project_id)) byProject.set(u.project_id, [])
    byProject.get(u.project_id)!.push(u)
  }
  const groups = [...byProject.entries()]
    .map(([pid, list]) => ({ project: projById.get(pid), list }))
    .filter(g => g.project)
    .sort((a, b) => (a.project!.title).localeCompare(b.project!.title, 'fr'))

  const rangeLabel = fmtRange(fromIso, toIso)
  const totalPhotos = withPhotos.length

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-[26px] font-bold font-heading text-marine">Comptes-rendus de chantier</h1>
          <p className="text-gray-500 mt-1 text-sm">Les photos et l&apos;avancement saisis sur le terrain, compilés par semaine pour vos clients.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/comptes-rendus?week=${prevWeek}`}><Button variant="outline" size="icon-sm"><ChevronLeft className="w-4 h-4" /></Button></Link>
          <span className="inline-flex items-center gap-2 px-3 h-9 rounded-xl bg-white border border-gray-200 text-sm font-medium text-marine capitalize">
            <CalendarDays className="w-4 h-4 text-gray-400" /> Semaine {rangeLabel}
          </span>
          <Link href={`/comptes-rendus?week=${nextWeek}`}><Button variant="outline" size="icon-sm"><ChevronRight className="w-4 h-4" /></Button></Link>
          <Link href="/comptes-rendus"><Button variant="outline" size="sm">Cette semaine</Button></Link>
        </div>
      </div>

      {groups.length === 0 ? (
        <Card className="border-0 shadow-[var(--shadow-sm)]">
          <CardContent className="py-14 text-center text-gray-500">
            <Camera className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="font-medium text-marine">Aucun point d&apos;avancement cette semaine</p>
            <p className="text-sm mt-1 max-w-md mx-auto">Depuis le <Link href="/pointage" className="text-primary font-medium">Pointage</Link>, ajoutez une « Photo du chantier » ou renseignez l&apos;avancement en fin de journée : tout apparaît ici, prêt à envoyer au client.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-xs text-gray-400">{groups.length} chantier{groups.length > 1 ? 's' : ''} · {totalPhotos} photo{totalPhotos > 1 ? 's' : ''} cette semaine</p>
          <div className="grid gap-4">
            {groups.map(({ project, list }) => {
              const p = project!
              const photos = list.filter(u => u.photo_path)
              const progress = [...list].reverse().find(u => u.progress != null)?.progress ?? null
              const notes = list.filter(u => u.note).map(u => u.note as string)
              const client = p.clients
              return (
                <Card key={p.id} className="border-0 shadow-[var(--shadow-sm)] overflow-hidden">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="grid place-items-center w-10 h-10 rounded-xl bg-[#FCE7DE] text-[#C14E33] flex-shrink-0"><HardHat className="w-5 h-5" /></span>
                        <div className="min-w-0">
                          <Link href={`/chantiers/${p.id}`} className="text-base font-semibold text-marine hover:text-primary truncate block">{p.title}</Link>
                          <p className="text-xs text-gray-400">{client ? clientDisplayName(client) : 'Client non renseigné'}{progress != null && <> · avancement {progress} %</>}</p>
                        </div>
                      </div>
                      <ReportActions
                        projectId={p.id} from={fromIso} to={toIso}
                        clientEmail={client?.email ?? null}
                        clientName={client ? clientDisplayName(client) : null}
                        companyName={client?.company_name ?? null}
                        projectTitle={p.title} rangeLabel={rangeLabel}
                        progress={progress} highlights={notes} hasPhotos={photos.length > 0}
                      />
                    </div>

                    {photos.length > 0 && (
                      <div className="mt-3 grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-2">
                        {photos.map(u => {
                          const url = urlByUpdate.get(u.id)
                          return url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img key={u.id} src={url} alt="Photo chantier" className="aspect-square w-full object-cover rounded-lg border border-gray-100" />
                          ) : (
                            <div key={u.id} className="aspect-square w-full grid place-items-center rounded-lg bg-gray-50 text-gray-300"><ImageOff className="w-5 h-5" /></div>
                          )
                        })}
                      </div>
                    )}

                    {notes.length > 0 && (
                      <ul className="mt-3 space-y-1 text-sm text-gray-600">
                        {notes.slice(0, 4).map((n, i) => <li key={i} className="flex gap-2"><FileText className="w-3.5 h-3.5 mt-0.5 text-gray-300 flex-shrink-0" />{n}</li>)}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
