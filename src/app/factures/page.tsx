import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Plus, Receipt } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'

const statusLabels: Record<string, string> = {
  brouillon: 'Brouillon', envoyee: 'Envoyée', payee_partiellement: 'Partiellement payée',
  payee: 'Payée', en_retard: 'En retard', annulee: 'Annulée',
}
const statusColors: Record<string, string> = {
  brouillon: 'bg-gray-100 text-gray-700', envoyee: 'bg-blue-100 text-blue-700',
  payee_partiellement: 'bg-yellow-100 text-yellow-700', payee: 'bg-green-100 text-green-700',
  en_retard: 'bg-red-100 text-red-700', annulee: 'bg-gray-100 text-gray-400',
}

export default async function FacturesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: invoices } = await supabase
    .from('invoices')
    .select('*, clients(first_name, last_name, company_name, type)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Mes factures</h1>
        <Link href="/factures/nouveau">
          <Button className="h-10 gap-2">
            <Plus className="w-4 h-4" />
            Créer une facture
          </Button>
        </Link>
      </div>

      {!invoices?.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Receipt className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="font-medium text-gray-700">Aucune facture pour l&apos;instant</p>
            <p className="text-sm text-gray-500 mt-1 mb-4">
              Transformez un devis accepté en facture, ou créez-en une directement
            </p>
            <Link href="/factures/nouveau"><Button>Créer une facture</Button></Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {invoices.map(inv => {
            const client = inv.clients as any
            const clientName = client
              ? client.type === 'professionnel'
                ? client.company_name
                : `${client.first_name || ''} ${client.last_name || ''}`.trim()
              : 'Sans client'
            return (
              <Link key={inv.id} href={`/factures/${inv.id}`}>
                <Card className="hover:border-blue-300 transition-colors cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-gray-400">{inv.invoice_number}</span>
                          <Badge className={`${statusColors[inv.status]} border-0 text-xs`}>
                            {statusLabels[inv.status]}
                          </Badge>
                        </div>
                        <p className="font-semibold text-gray-900 mt-1">{clientName}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{formatDate(inv.issue_date)}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-bold text-gray-900">{formatCurrency(inv.amount_due)}</p>
                        <p className="text-xs text-gray-400">Reste à payer</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
