import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import type { VisitResult } from '@/lib/visites'
import VisiteTunnel, { type VisitPhoto } from './VisiteTunnel'

export default async function VisitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: visit } = await supabase.from('site_visits')
    .select('id, title, address, transcript, notes, ai_result, status, client_id, analyzed_at')
    .eq('id', id).eq('user_id', user.id).single()
  if (!visit) return notFound()

  const [{ data: photos }, { data: clients }] = await Promise.all([
    supabase.from('site_visit_photos').select('id, storage_path, caption, sort_order').eq('visit_id', id).eq('user_id', user.id).order('sort_order'),
    supabase.from('clients').select('id, type, first_name, last_name, company_name').eq('user_id', user.id).neq('status', 'archive').order('created_at', { ascending: false }),
  ])

  const withUrls: VisitPhoto[] = await Promise.all((photos || []).map(async p => {
    const { data } = await supabase.storage.from('documents').createSignedUrl(p.storage_path as string, 3600)
    return { id: p.id, url: data?.signedUrl || '', caption: p.caption as string | null, storage_path: p.storage_path as string }
  }))

  return (
    <VisiteTunnel
      visit={{
        id: visit.id, title: visit.title, address: visit.address,
        transcript: visit.transcript, notes: visit.notes, status: visit.status,
        client_id: visit.client_id, ai_result: (visit.ai_result as VisitResult | null),
      }}
      photos={withUrls}
      clients={(clients as { id: string; type: string; first_name: string | null; last_name: string | null; company_name: string | null }[]) || []}
    />
  )
}
