import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Plus, User, Building2, Phone, Mail } from 'lucide-react'

const statusLabels: Record<string, string> = {
  nouveau: 'Nouveau', infos_a_recuperer: 'Infos à récupérer',
  devis_a_faire: 'Devis à faire', devis_envoye: 'Devis envoyé',
  devis_accepte: 'Devis accepté', devis_refuse: 'Devis refusé',
  chantier_a_planifier: 'À planifier', chantier_en_cours: 'Chantier en cours',
  facture_a_envoyer: 'Facture à envoyer', facture_envoyee: 'Facture envoyée',
  paye: 'Payé', termine: 'Terminé', archive: 'Archivé',
}
const statusColors: Record<string, string> = {
  nouveau: 'bg-gray-100 text-gray-700', devis_a_faire: 'bg-yellow-100 text-yellow-700',
  devis_envoye: 'bg-blue-100 text-blue-700', devis_accepte: 'bg-green-100 text-green-700',
  chantier_en_cours: 'bg-orange-100 text-orange-700', facture_a_envoyer: 'bg-purple-100 text-purple-700',
  paye: 'bg-green-100 text-green-800', termine: 'bg-gray-100 text-gray-500',
}

export default async function ClientsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Les prospects (leads pas encore convertis) ont leur propre onglet.
  const { data: clients } = await supabase
    .from('clients')
    .select('*')
    .eq('user_id', user.id)
    .not('status', 'in', '(nouveau,infos_a_recuperer,devis_a_faire,devis_envoye,devis_refuse,archive)')
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-[26px] font-bold font-heading text-marine">Mes clients</h1>
          <p className="text-gray-500 mt-1 text-sm">
            Vos clients convertis. Les pistes sont dans <Link href="/prospects" className="text-[#FF6A00] hover:underline">Prospects</Link>.
          </p>
        </div>
        <Link href="/clients/nouveau">
          <Button className="h-10 gap-2 shadow-sm">
            <Plus className="w-4 h-4" />
            Ajouter un client
          </Button>
        </Link>
      </div>

      {!clients?.length ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            <User className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="font-medium">Aucun client pour l&apos;instant</p>
            <p className="text-sm mt-1">Ajoutez votre premier client pour commencer</p>
            <Link href="/clients/nouveau" className="mt-4 inline-block">
              <Button>Ajouter un client</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {clients.map(client => (
            <Link key={client.id} href={`/clients/${client.id}`}>
              <Card className="hover:border-blue-300 transition-colors cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                        {client.type === 'professionnel'
                          ? <Building2 className="w-5 h-5 text-blue-600" />
                          : <User className="w-5 h-5 text-blue-600" />
                        }
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-gray-900 truncate">
                          {client.type === 'professionnel'
                            ? client.company_name
                            : `${client.first_name || ''} ${client.last_name || ''}`.trim() || 'Sans nom'
                          }
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                          {client.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="w-3 h-3" />{client.phone}
                            </span>
                          )}
                          {client.email && (
                            <span className="flex items-center gap-1 truncate">
                              <Mail className="w-3 h-3" />{client.email}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <Badge className={`${statusColors[client.status] || 'bg-gray-100 text-gray-700'} border-0 flex-shrink-0 text-xs`}>
                      {statusLabels[client.status] || client.status}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
