import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, UserPlus, Phone, Mail, Building2, User } from 'lucide-react'
import type { Client, ClientStatus } from '@/types'
import { clientStatusLabels, prospectStatuses, prospectStatusOrder, clientDisplayName } from '@/lib/clients'
import ClientStatusSelect from './ClientStatusSelect'

export default async function ProspectsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: prospects } = await supabase
    .from('clients')
    .select('*')
    .eq('user_id', user.id)
    .in('status', prospectStatuses)
    .order('created_at', { ascending: false })

  const list = (prospects as Client[]) || []
  const countByStatus = (s: ClientStatus) => list.filter(p => p.status === s).length

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 animate-fade-up">
        <div>
          <h1 className="text-2xl md:text-[26px] font-bold font-heading text-marine">Prospects</h1>
          <p className="text-gray-500 mt-1 text-sm">Vos pistes commerciales, du premier contact au devis accepté.</p>
        </div>
        <Link href="/clients/nouveau">
          <Button className="h-10 gap-2 shadow-sm">
            <Plus className="w-4 h-4" /> Nouveau prospect
          </Button>
        </Link>
      </div>

      {/* Entonnoir par étape */}
      {list.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 animate-fade-up">
          {prospectStatusOrder.map(s => (
            <Card key={s} className="border border-gray-200/80">
              <CardContent className="p-3">
                <div className="text-2xl font-bold text-[#0F172A] leading-none">{countByStatus(s)}</div>
                <div className="text-[11px] text-gray-500 mt-1 leading-tight">{clientStatusLabels[s]}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Liste */}
      {list.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            <UserPlus className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="font-medium">Aucun prospect pour l&apos;instant</p>
            <p className="text-sm mt-1">Ajoutez une piste, ou elle se créera automatiquement depuis vos demandes.</p>
            <Link href="/clients/nouveau" className="mt-4 inline-block">
              <Button>Nouveau prospect</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {list.map(p => (
            <Card key={p.id} className="card-interactive border border-gray-200/80">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/clients/${p.id}`} className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center flex-shrink-0">
                      {p.type === 'professionnel'
                        ? <Building2 className="w-5 h-5 text-primary" />
                        : <User className="w-5 h-5 text-primary" />}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-900 truncate">{clientDisplayName(p)}</div>
                      <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                        {p.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{p.phone}</span>}
                        {p.email && <span className="flex items-center gap-1 truncate"><Mail className="w-3 h-3" />{p.email}</span>}
                      </div>
                    </div>
                  </Link>
                  <ClientStatusSelect clientId={p.id} current={p.status} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
