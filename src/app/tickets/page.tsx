import { createClient } from '@/lib/supabase/server'
import type { Expense } from '@/types'
import TicketsManager, { type SupplierDocLite } from './TicketsManager'

export default async function TicketsPage({
  searchParams,
}: { searchParams: Promise<{ project?: string; type?: string }> }) {
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: expenses }, { data: projects }, { data: supplierDocs }] = await Promise.all([
    supabase
      .from('expenses')
      .select('*, projects(title)')
      .eq('user_id', user.id)
      .eq('source', 'ticket')
      .neq('status', 'archive')
      .order('created_at', { ascending: false }),
    supabase.from('projects').select('id, title').eq('user_id', user.id).neq('status', 'archive').order('created_at', { ascending: false }),
    supabase
      .from('supplier_documents')
      .select('id, doc_type, supplier, doc_number, doc_date, total_ht, total_ttc, is_selected, storage_path, project_id, created_at, projects(title)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
  ])

  const list = expenses || []
  const signed = await Promise.all(
    list.map(e => e.storage_path
      ? supabase.storage.from('documents').createSignedUrl(e.storage_path, 3600)
      : Promise.resolve({ data: null })),
  )
  const withUrls = list.map((e, i) => ({ ...e, signedUrl: signed[i].data?.signedUrl })) as (Expense & { signedUrl?: string })[]

  // Docs fournisseurs (BL / factures / devis) — miniatures signées
  const docs = supplierDocs || []
  const docSigned = await Promise.all(
    docs.map(d => d.storage_path
      ? supabase.storage.from('documents').createSignedUrl(d.storage_path as string, 3600)
      : Promise.resolve({ data: null })),
  )
  const docsWithUrls = docs.map((d, i) => ({ ...d, signedUrl: docSigned[i].data?.signedUrl }))

  return (
    <TicketsManager
      expenses={withUrls}
      projects={projects || []}
      supplierDocs={docsWithUrls as unknown as SupplierDocLite[]}
      preselectProject={sp.project}
      initialType={sp.type}
    />
  )
}
