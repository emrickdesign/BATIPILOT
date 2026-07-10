import { createClient } from '@/lib/supabase/server'
import type { Subcontractor, SubcontractorDocument } from '@/types'

type InvoiceRow = { subcontractor_id: string; amount_ttc: number | null; status: string }
import SousTraitantsList, { type SubMeta } from './SousTraitantsList'

export default async function SousTraitantsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: subs }, { data: docs }, { data: invoices }, { data: contracts }] = await Promise.all([
    supabase.from('subcontractors').select('*').eq('user_id', user.id)
      .order('status').order('company_name'),
    supabase.from('subcontractor_documents').select('id, subcontractor_id, type, expiry_date').eq('user_id', user.id),
    supabase.from('subcontractor_invoices').select('subcontractor_id, amount_ttc, status').eq('user_id', user.id),
    supabase.from('subcontractor_contracts').select('subcontractor_id, status').eq('user_id', user.id),
  ])

  const docsBySub = new Map<string, SubcontractorDocument[]>()
  for (const d of (docs || []) as SubcontractorDocument[]) {
    const arr = docsBySub.get(d.subcontractor_id) || []
    arr.push(d); docsBySub.set(d.subcontractor_id, arr)
  }

  const meta: Record<string, SubMeta> = {}
  for (const s of (subs || []) as Subcontractor[]) {
    meta[s.id] = {
      docs: docsBySub.get(s.id) || [],
      openContracts: (contracts || []).filter(c => c.subcontractor_id === s.id && (c.status === 'signe' || c.status === 'en_cours')).length,
      unpaid: ((invoices || []) as InvoiceRow[]).filter(i => i.subcontractor_id === s.id && i.status !== 'payee')
        .reduce((t, i) => t + (Number(i.amount_ttc) || 0), 0),
      toValidate: ((invoices || []) as InvoiceRow[]).filter(i => i.subcontractor_id === s.id && i.status === 'a_valider').length,
    }
  }

  return <SousTraitantsList subs={(subs as Subcontractor[]) || []} meta={meta} />
}
