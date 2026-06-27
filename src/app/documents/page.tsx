import { createClient } from '@/lib/supabase/server'
import type { Document } from '@/types'
import DocumentsManager from './DocumentsManager'

export default async function DocumentsPage({
  searchParams,
}: { searchParams: Promise<{ client?: string; project?: string }> }) {
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: documents }, { data: clients }, { data: projects }] = await Promise.all([
    supabase
      .from('documents')
      .select('*, clients(type, first_name, last_name, company_name), projects(title)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase.from('clients').select('id, type, first_name, last_name, company_name').eq('user_id', user.id).neq('status', 'archive').order('created_at', { ascending: false }),
    supabase.from('projects').select('id, title').eq('user_id', user.id).neq('status', 'archive').order('created_at', { ascending: false }),
  ])

  // URLs signées (bucket privé) — 1h
  const docs = documents || []
  const signed = await Promise.all(
    docs.map(d => supabase.storage.from('documents').createSignedUrl(d.storage_path, 3600)),
  )
  const withUrls = docs.map((d, i) => ({ ...d, signedUrl: signed[i].data?.signedUrl })) as (Document & { signedUrl?: string })[]

  return (
    <DocumentsManager
      documents={withUrls}
      clients={clients || []}
      projects={projects || []}
      preselectClient={sp.client}
      preselectProject={sp.project}
    />
  )
}
