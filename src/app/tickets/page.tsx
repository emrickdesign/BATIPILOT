import { createClient } from '@/lib/supabase/server'
import type { Expense } from '@/types'
import TicketsManager from './TicketsManager'

export default async function TicketsPage({
  searchParams,
}: { searchParams: Promise<{ project?: string }> }) {
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: expenses }, { data: projects }] = await Promise.all([
    supabase
      .from('expenses')
      .select('*, projects(title)')
      .eq('user_id', user.id)
      .eq('source', 'ticket')
      .neq('status', 'archive')
      .order('created_at', { ascending: false }),
    supabase.from('projects').select('id, title').eq('user_id', user.id).neq('status', 'archive').order('created_at', { ascending: false }),
  ])

  const list = expenses || []
  const signed = await Promise.all(
    list.map(e => e.storage_path
      ? supabase.storage.from('documents').createSignedUrl(e.storage_path, 3600)
      : Promise.resolve({ data: null })),
  )
  const withUrls = list.map((e, i) => ({ ...e, signedUrl: signed[i].data?.signedUrl })) as (Expense & { signedUrl?: string })[]

  return (
    <TicketsManager
      expenses={withUrls}
      projects={projects || []}
      preselectProject={sp.project}
    />
  )
}
