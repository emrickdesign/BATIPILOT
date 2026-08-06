import { createClient } from '@/lib/supabase/server'
import { clientDisplayName } from '@/lib/chantiers'
import NotesClient, { type AdminNote, type NoteProject } from './NotesClient'

export default async function NotesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: notes }, { data: projects }] = await Promise.all([
    supabase.from('notes')
      .select('id, project_id, body, author_name, author_employee_id, created_at')
      .eq('user_id', user.id).order('created_at', { ascending: false }),
    supabase.from('projects')
      .select('id, title, clients(type, first_name, last_name, company_name)')
      .eq('user_id', user.id).neq('status', 'archive').order('created_at', { ascending: false }),
  ])

  const projectRows: NoteProject[] = (projects || []).map(p => ({
    id: p.id,
    title: p.title,
    clientName: p.clients ? clientDisplayName(p.clients as Parameters<typeof clientDisplayName>[0]) : null,
  }))

  return (
    <NotesClient
      ownerId={user.id}
      authorName={user.email?.split('@')[0] || 'Admin'}
      projects={projectRows}
      initial={(notes || []) as AdminNote[]}
    />
  )
}
