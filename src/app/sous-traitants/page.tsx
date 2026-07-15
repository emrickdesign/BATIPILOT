import { createClient } from '@/lib/supabase/server'
import type { Subcontractor, SubcontractorDocument, SubcontractorContract, SubcontractorInvoice } from '@/types'
import { profitability } from '@/lib/soustraitants'
import SousTraitantsList, { type SubMeta } from './SousTraitantsList'

export default async function SousTraitantsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: subs }, { data: docs }, { data: invoices }, { data: contracts }] = await Promise.all([
    supabase.from('subcontractors').select('*').eq('user_id', user.id)
      .order('status').order('company_name'),
    supabase.from('subcontractor_documents').select('id, subcontractor_id, type, expiry_date').eq('user_id', user.id),
    supabase.from('subcontractor_invoices').select('subcontractor_id, amount_ht, amount_ttc, status, due_date').eq('user_id', user.id),
    supabase.from('subcontractor_contracts').select('subcontractor_id, status, amount_ht, sale_price_ht, retention_pct, end_date').eq('user_id', user.id),
  ])

  const docsBySub = new Map<string, SubcontractorDocument[]>()
  for (const d of (docs || []) as SubcontractorDocument[]) {
    const arr = docsBySub.get(d.subcontractor_id) || []
    arr.push(d); docsBySub.set(d.subcontractor_id, arr)
  }

  const allContracts = (contracts || []) as (SubcontractorContract & { subcontractor_id: string })[]
  const allInvoices = (invoices || []) as (SubcontractorInvoice & { subcontractor_id: string })[]

  const meta: Record<string, SubMeta> = {}
  for (const s of (subs || []) as Subcontractor[]) {
    const cs = allContracts.filter(c => c.subcontractor_id === s.id)
    const iv = allInvoices.filter(i => i.subcontractor_id === s.id)
    meta[s.id] = {
      docs: docsBySub.get(s.id) || [],
      openContracts: cs.filter(c => c.status === 'signe' || c.status === 'en_cours').length,
      toValidate: iv.filter(i => i.status === 'a_valider').length,
      ...profitability(cs, iv),
    }
  }

  return <SousTraitantsList subs={(subs as Subcontractor[]) || []} meta={meta} />
}
