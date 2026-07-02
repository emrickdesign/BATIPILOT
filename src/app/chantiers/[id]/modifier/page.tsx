import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft, PencilLine } from 'lucide-react'
import { Suspense } from 'react'
import type { Project } from '@/types'
import ChantierForm from '../../ChantierForm'
import { FormPageTitle } from '@/components/ui/form-section'
import { entityColors } from '@/lib/entityColors'

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
      <Link href={`/chantiers/${id}`}>
        <Button variant="ghost" size="sm" className="gap-1 -ml-2">
          <ArrowLeft className="w-4 h-4" /> Retour
        </Button>
      </Link>
      <FormPageTitle icon={PencilLine} color={entityColors.chantier} title="Modifier le chantier" />
      <Suspense>
        <ChantierForm project={project as Project} />
      </Suspense>
    </div>
  )
}
