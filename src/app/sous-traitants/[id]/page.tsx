import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import type {
  Subcontractor, SubcontractorDocument, SubcontractorContract,
  SubcontractorInvoice,
} from '@/types'
import SousTraitantDetail from './SousTraitantDetail'

export type ContractSignature = { id: string; contract_id: string | null; status: string; signed_at: string | null; signer_name: string | null }

type DB = Awaited<ReturnType<typeof createClient>>

async function signed(supabase: DB, path?: string | null): Promise<string | null> {
  if (!path) return null
  const { data } = await supabase.storage.from('documents').createSignedUrl(path, 3600)
  return data?.signedUrl ?? null
}

export default async function FicheSousTraitantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: sub } = await supabase.from('subcontractors').select('*').eq('id', id).eq('user_id', user.id).single()
  if (!sub) return notFound()

  const [{ data: docs }, { data: contracts }, { data: invoices }, { data: projects }, { data: signatures }] = await Promise.all([
    supabase.from('subcontractor_documents').select('*').eq('user_id', user.id).eq('subcontractor_id', id).order('created_at', { ascending: false }),
    supabase.from('subcontractor_contracts').select('*').eq('user_id', user.id).eq('subcontractor_id', id).order('created_at', { ascending: false }),
    supabase.from('subcontractor_invoices').select('*').eq('user_id', user.id).eq('subcontractor_id', id).order('issue_date', { ascending: false, nullsFirst: false }),
    supabase.from('projects').select('id, title').eq('user_id', user.id).neq('status', 'archive').order('created_at', { ascending: false }),
    supabase.from('document_signatures').select('id, contract_id, status, signed_at, signer_name').eq('user_id', user.id).not('contract_id', 'is', null),
  ])

  const docItems = await Promise.all(((docs || []) as SubcontractorDocument[]).map(async d => ({ ...d, url: await signed(supabase, d.storage_path) })))
  const invoiceItems = await Promise.all(((invoices || []) as SubcontractorInvoice[]).map(async i => ({ ...i, url: await signed(supabase, i.storage_path) })))

  return (
    <SousTraitantDetail
      sub={sub as Subcontractor}
      docs={docItems}
      contracts={(contracts as SubcontractorContract[]) || []}
      invoices={invoiceItems}
      projects={projects || []}
      signatures={(signatures as ContractSignature[]) || []}
    />
  )
}
