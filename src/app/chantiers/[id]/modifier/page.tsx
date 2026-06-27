import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { Suspense } from 'react'
import type { Project } from '@/types'
import ChantierForm from '../../ChantierForm'

export default async function ModifierChantierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: project } = await supabase
    .from('projects').select('*').eq('id', id).eq('user_id', user.id).single()

  if (!project) return notFound()

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href={`/chantiers/${id}`}>
          <Button variant="ghost" size="sm" className="gap-1">
            <ArrowLeft className="w-4 h-4" /> Retour
          </Button>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Modifier le chantier</h1>
      </div>
      <Suspense>
        <ChantierForm project={project as Project} />
      </Suspense>
    </div>
  )
}
