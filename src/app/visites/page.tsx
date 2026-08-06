import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus, MapPin, Camera, ChevronRight } from 'lucide-react'
import { visitStatusLabels } from '@/lib/visites'

type VisitRow = {
  id: string; title: string; address: string | null; status: string; created_at: string
  clients: { type: string; first_name: string | null; last_name: string | null; company_name: string | null } | null
}

export default async function VisitesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: visits } = await supabase.from('site_visits')
    .select('id, title, address, status, created_at, client_id, clients(type, first_name, last_name, company_name)')
    .eq('user_id', user.id).order('created_at', { ascending: false })

  const list = (visits || []) as unknown as VisitRow[]

  // Première photo de chaque visite → miniature sur la carte
  const ids = list.map(v => v.id)
  const firstPhotoPath = new Map<string, string>()
  if (ids.length) {
    const { data: ph } = await supabase.from('site_visit_photos')
      .select('visit_id, storage_path, sort_order').eq('user_id', user.id).in('visit_id', ids).order('sort_order')
    for (const p of ph || []) if (!firstPhotoPath.has(p.visit_id as string)) firstPhotoPath.set(p.visit_id as string, p.storage_path as string)
  }
  const paths = [...firstPhotoPath.values()]
  const urlByPath = new Map<string, string>()
  if (paths.length) {
    const { data: signed } = await supabase.storage.from('documents').createSignedUrls(paths, 3600)
    paths.forEach((p, i) => urlByPath.set(p, signed?.[i]?.signedUrl || ''))
  }
  const thumbOf = (id: string) => { const p = firstPhotoPath.get(id); return p ? urlByPath.get(p) || null : null }

  const active = list.filter(v => v.status !== 'archive')
  const archived = list.filter(v => v.status === 'archive')

  const renderCard = (v: VisitRow) => {
    const cli = v.clients
    const cliName = cli ? (cli.company_name || [cli.first_name, cli.last_name].filter(Boolean).join(' ')) : null
    const thumb = thumbOf(v.id)
    return (
      <Link key={v.id} href={`/visites/${v.id}`}>
        <Card className="border-0 shadow-[var(--shadow-sm)] card-interactive">
          <CardContent className="p-4 flex items-center gap-3">
            {thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumb} alt="" className="w-11 h-11 rounded-xl object-cover flex-shrink-0 border border-gray-200" />
            ) : (
              <span className="grid place-items-center w-11 h-11 rounded-xl flex-shrink-0 bg-[#FCE7DE] text-[#C14E33]"><Camera className="w-5 h-5" /></span>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-marine truncate">{v.title}</p>
              <p className="text-xs text-gray-400 truncate flex items-center gap-2">
                <span>{new Date(v.created_at).toLocaleDateString('fr-FR')}</span>
                {cliName && <>· {cliName}</>}
                {v.address && <span className="inline-flex items-center gap-0.5"><MapPin className="w-3 h-3" /> {v.address}</span>}
              </p>
            </div>
            <span className={`text-xs font-medium px-2 py-1 rounded-full flex-shrink-0 ${v.status === 'valide' ? 'bg-[#F1F6E9] text-[#3F7A2E]' : 'bg-gray-100 text-gray-500'}`}>
              {visitStatusLabels[v.status] || v.status}
            </span>
            <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
          </CardContent>
        </Card>
      </Link>
    )
  }

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-[26px] font-bold font-heading text-marine">Visites de repérage</h1>
          <p className="text-gray-500 mt-1 text-sm">Sur place : photos + notes vocales, à rattacher au chantier.</p>
        </div>
        <Link href="/visites/nouveau"><Button className="gap-1.5"><Plus className="w-4 h-4" /> Nouvelle visite</Button></Link>
      </div>

      {active.length === 0 && archived.length === 0 ? (
        <Card className="border-0 shadow-[var(--shadow-sm)]">
          <CardContent className="py-14 text-center text-gray-500">
            <Camera className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="font-medium text-marine">Aucune visite pour l&apos;instant</p>
            <p className="text-sm mt-1 max-w-md mx-auto">Chez un client, démarrez une visite : prenez des photos, dictez vos notes, puis rattachez le tout au chantier.</p>
            <Link href="/visites/nouveau"><Button className="mt-4 gap-1.5"><Plus className="w-4 h-4" /> Démarrer une visite</Button></Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {active.map(renderCard)}
          {archived.length > 0 && (
            <details className="mt-2">
              <summary className="text-sm font-medium text-gray-500 cursor-pointer hover:text-gray-700 select-none">Visites archivées ({archived.length})</summary>
              <div className="grid gap-3 mt-3 opacity-70">{archived.map(renderCard)}</div>
            </details>
          )}
        </div>
      )}
    </div>
  )
}
