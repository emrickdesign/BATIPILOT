import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft, UserCog } from 'lucide-react'
import { Suspense } from 'react'
import type { Client } from '@/types'
import ClientForm from '../../ClientForm'
import { FormPageTitle } from '@/components/ui/form-section'
import { entityColors } from '@/lib/entityColors'

export default async function ModifierClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: client } = await supabase
    .from('clients').select('*').eq('id', id).eq('user_id', user.id).single()

  if (!client) return notFound()

  return (
    <div className="space-y-4 max-w-2xl">
      <Link href={`/clients/${id}`}>
        <Button variant="ghost" size="sm" className="gap-1 -ml-2">
          <ArrowLeft className="w-4 h-4" /> Retour
        </Button>
      </Link>
      <FormPageTitle icon={UserCog} color={entityColors.client} title="Modifier le client" />
      <Suspense>
        <ClientForm client={client as Client} />
      </Suspense>
    </div>
  )
}
