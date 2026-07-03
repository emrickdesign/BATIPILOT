import { createClient } from '@/lib/supabase/server'
import MessagesView from './MessagesView'
import type { Employee } from '@/types'

export default async function MessagesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: conversations }, { data: participants }, { data: employees }, { data: messages }] = await Promise.all([
    supabase.from('conversations').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    supabase.from('conversation_participants').select('*, employees(*)').eq('user_id', user.id),
    supabase.from('employees').select('*').eq('user_id', user.id).eq('active', true).order('full_name'),
    supabase.from('messages').select('*').eq('user_id', user.id).order('created_at', { ascending: true }).limit(2000),
  ])

  return (
    <MessagesView
      currentAdminName={user.email?.split('@')[0] || 'Vous'}
      conversations={conversations || []}
      participants={participants || []}
      employees={(employees as Employee[]) || []}
      initialMessages={messages || []}
      viewer={{ kind: 'admin' }}
    />
  )
}
