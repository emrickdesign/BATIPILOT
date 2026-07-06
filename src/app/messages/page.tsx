import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
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

  // Signature via le client service_role : les fichiers vocaux sont uploadés par ce même
  // client (nécessaire pour les salariés, sans session auth.uid()), donc le client authentifié
  // classique n'a pas les droits RLS pour les signer lui-même (objet non "possédé" par l'admin).
  const service = createServiceClient()
  const initialMessages = await Promise.all(
    (messages || []).map(async m => {
      if (!m.audio_path) return m
      const { data } = await service.storage.from('documents').createSignedUrl(m.audio_path, 3600)
      return { ...m, audio_url: data?.signedUrl || null }
    })
  )

  return (
    <MessagesView
      currentAdminName={user.email?.split('@')[0] || 'Vous'}
      conversations={conversations || []}
      participants={participants || []}
      employees={(employees as Employee[]) || []}
      initialMessages={initialMessages}
      viewer={{ kind: 'admin' }}
    />
  )
}
