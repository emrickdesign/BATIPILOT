import { createClient } from '@/lib/supabase/server'
import NotesClient, { type AdminNote } from './NotesClient'

export default async function NotesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: notes }, { data: projects }] = await Promise.all([
    supabase.from('notes')
      .select('id, project_id, body, author_name, author_employee_id, created_at, projects(title)')
      .eq('user_id', user.id).order('created_at', { ascending: false }),
    supabase.from('projects').select('id, title').eq('user_id', user.id).neq('status', 'archive').order('created_at', { ascending: false }),
  ])

  const rows: AdminNote[] = (notes || []).map(n => ({
    id: n.id,
    project_id: n.project_id,
    project_title: (n.projects as { title?: string } | null)?.title || 'Chantier',
    body: n.body,
    author_name: n.author_name,
    author_employee_id: n.author_employee_id,
    created_at: n.created_at,
  }))

  return (
    <NotesClient
      ownerId={user.id}
      authorName={user.email?.split('@')[0] || 'Admin'}
      projects={(projects || []) as { id: string; title: string }[]}
      initial={rows}
    />
  )
}
