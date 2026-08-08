import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Camera } from 'lucide-react'
import VisitesGallery, { type VisitItem } from './VisitesGallery'
import NouvelleVisiteDialog from './NouvelleVisiteDialog'

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

  // Photos : première (miniature) + nombre par visite
  const ids = list.map(v => v.id)
  const firstPhotoPath = new Map<string, string>()
  const photoCount = new Map<string, number>()
  if (ids.length) {
    const { data: ph } = await supabase.from('site_visit_photos')
      .select('visit_id, storage_path, sort_order').eq('user_id', user.id).in('visit_id', ids).order('sort_order')
    for (const p of ph || []) {
      const vid = p.visit_id as string
      if (!firstPhotoPath.has(vid)) firstPhotoPath.set(vid, p.storage_path as string)
      photoCount.set(vid, (photoCount.get(vid) || 0) + 1)
    }
  }
  const paths = [...firstPhotoPath.values()]
  const urlByPath = new Map<string, string>()
  if (paths.length) {
    const { data: signed } = await supabase.storage.from('documents').createSignedUrls(paths, 3600)
    paths.forEach((p, i) => urlByPath.set(p, signed?.[i]?.signedUrl || ''))
  }
  const thumbOf = (id: string) => { const p = firstPhotoPath.get(id); return p ? urlByPath.get(p) || null : null }

  const items: VisitItem[] = list.map(v => {
    const cli = v.clients
    return {
      id: v.id,
      title: v.title,
      address: v.address,
      status: v.status,
      createdAt: v.created_at,
      clientName: cli ? (cli.company_name || [cli.first_name, cli.last_name].filter(Boolean).join(' ') || null) : null,
      thumb: thumbOf(v.id),
      photoCount: photoCount.get(v.id) || 0,
    }
  })

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-[26px] font-bold font-heading text-marine">Visites de repérage</h1>
          <p className="text-gray-500 mt-1 text-sm">Sur place : photos + notes vocales, à rattacher au chantier.</p>
        </div>
        <NouvelleVisiteDialog />
      </div>

      {items.length === 0 ? (
        <Card className="border-0 shadow-[var(--shadow-sm)]">
          <CardContent className="py-14 text-center text-gray-500">
            <Camera className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="font-medium text-marine">Aucune visite pour l&apos;instant</p>
            <p className="text-sm mt-1 max-w-md mx-auto">Chez un prospect, démarrez une visite : prenez des photos, dictez vos notes, puis rattachez le tout au chantier.</p>
            <div className="mt-4 flex justify-center"><NouvelleVisiteDialog variant="empty" /></div>
          </CardContent>
        </Card>
      ) : (
        <VisitesGallery visits={items} />
      )}
    </div>
  )
}
