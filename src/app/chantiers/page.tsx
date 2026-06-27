import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import type { Project } from '@/types'
import ChantiersList from './ChantiersList'

export default async function ChantiersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: projects } = await supabase
    .from('projects')
    .select('*, clients(type, first_name, last_name, company_name)')
    .eq('user_id', user.id)
    .neq('status', 'archive')
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 animate-fade-up">
        <div>
          <h1 className="text-2xl md:text-[26px] font-bold font-heading text-marine">Mes chantiers</h1>
          <p className="text-gray-500 mt-1 text-sm">Pilotez vos chantiers, du devis à la facturation.</p>
        </div>
        <Link href="/chantiers/nouveau">
          <Button className="h-10 gap-2 shadow-sm">
            <Plus className="w-4 h-4" />
            Nouveau chantier
          </Button>
        </Link>
      </div>

      <ChantiersList projects={(projects as Project[]) || []} />
    </div>
  )
}
