import { createClient } from '@/lib/supabase/server'
import type { Expense } from '@/types'
import DepensesLedger from './DepensesLedger'

export default async function DepensesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: expenses }, { data: projects }] = await Promise.all([
    supabase
      .from('expenses')
      .select('*, projects(title)')
      .eq('user_id', user.id)
      .neq('status', 'archive')
      .order('expense_date', { ascending: false, nullsFirst: false }),
    supabase.from('projects').select('id, title').eq('user_id', user.id).neq('status', 'archive').order('created_at', { ascending: false }),
  ])

  return <DepensesLedger expenses={(expenses as Expense[]) || []} projects={projects || []} />
}
