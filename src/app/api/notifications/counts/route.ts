import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { isRelanceDue } from '@/lib/relances'

// Compteurs pour les pastilles de la sidebar (relances à faire, prospects à traiter).
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({})

  const today = new Date().toISOString().split('T')[0]

  const [quotesRes, invoicesRes, projectsRes, prospectsRes] = await Promise.all([
    supabase.from('quotes').select('id, status, issue_date, valid_until, reminded_at').eq('user_id', user.id).eq('status', 'envoye'),
    supabase.from('invoices').select('id, due_date').eq('user_id', user.id).in('status', ['envoyee', 'payee_partiellement', 'en_retard']),
    supabase.from('projects').select('id').eq('user_id', user.id).eq('status', 'a_planifier'),
    supabase.from('clients').select('id').eq('user_id', user.id).in('status', ['nouveau', 'infos_a_recuperer', 'devis_a_faire']),
  ])

  const relancer = (quotesRes.data || []).filter(q => isRelanceDue(q)).length
  const retard = (invoicesRes.data || []).filter(i => i.due_date && i.due_date < today).length
  const confirmer = (projectsRes.data || []).length
  const prospects = (prospectsRes.data || []).length

  return NextResponse.json({
    relances: relancer + retard + confirmer,
    prospects,
  })
}
