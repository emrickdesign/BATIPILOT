import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getEmployeeSession } from '@/lib/employeeSession'
import MessagesView from '@/app/messages/MessagesView'
import PinGate from './PinGate'
import type { Employee } from '@/types'

export default async function TerrainMessagesPage({ searchParams }: { searchParams: Promise<{ emp?: string }> }) {
  const session = await getEmployeeSession()

  if (session) {
    const service = createServiceClient()
    const [{ data: conversations }, { data: participants }, { data: employees }, { data: messages }] = await Promise.all([
      service.from('conversations').select('*').eq('user_id', session.userId).order('created_at', { ascending: false }),
      service.from('conversation_participants').select('*, employees(*)').eq('user_id', session.userId),
      service.from('employees').select('*').eq('user_id', session.userId).eq('active', true).order('full_name'),
      service.from('messages').select('*').eq('user_id', session.userId).order('created_at', { ascending: true }).limit(2000),
    ])

    return (
      <div className="min-h-screen bg-app-bg p-4">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-xl font-bold font-heading text-marine mb-4">Messages</h1>
          <MessagesView
            currentAdminName="Direction"
            conversations={conversations || []}
            participants={participants || []}
            employees={(employees as Employee[]) || []}
            initialMessages={messages || []}
            viewer={{ kind: 'employee', employeeId: session.employeeId }}
          />
        </div>
      </div>
    )
  }

  // Pas de session salarié : sélecteur + PIN (nécessite un appareil déjà connecté au compte, comme le reste de /terrain)
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: employees } = await supabase.from('employees').select('id, full_name, color').eq('user_id', user.id).eq('active', true).order('full_name')

  return <PinGate employees={employees || []} preselected={sp.emp} />
}
