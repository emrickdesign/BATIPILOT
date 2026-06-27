import { createClient } from '@/lib/supabase/server'
import type { Employee } from '@/types'
import EquipeManager from './EquipeManager'

export default async function EquipePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: employees } = await supabase
    .from('employees')
    .select('*')
    .eq('user_id', user.id)
    .order('active', { ascending: false })
    .order('full_name')

  return <EquipeManager employees={(employees as Employee[]) || []} />
}
