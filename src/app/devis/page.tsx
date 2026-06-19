import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Plus, FileText } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'

const statusLabels: Record<string, string> = {
  brouillon: 'Brouillon', pret: 'Prêt', envoye: 'Envoyé',
  accepte: 'Accepté', refuse: 'Refusé', expire: 'Expiré', transforme: 'Transformé en facture',
}
const statusColors: Record<string, string> = {
  brouillon: 'bg-gray-100 text-gray-700', pret: 'bg-blue-100 text-blue-700',
  envoye: 'bg-yellow-100 text-yellow-700', accepte: 'bg-green-100 text-green-700',
  refuse: 'bg-red-100 text-red-700', expire: 'bg-red-50 text-red-500',
  transforme: 'bg-purple-100 text-purple-700',
}

export default async function DevisPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: quotes } = await supabase
    .from('quotes')
    .select('*, clients(first_name, last_name, company_name, type)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Mes devis</h1>
        <Link href="/devis/nouveau">
          <Button className="h-10 gap-2">
            <Plus className="w-4 h-4" />
            Créer un devis
          </Button>
        </Link>
      </div>

      {!quotes?.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="font-medium text-gray-700">Aucun devis pour l&apos;instant</p>
            <p className="text-sm text-gray-500 mt-1 mb-4">Créez votre premier devis</p>
            <Link href="/devis/nouveau"><Button>Créer un devis</Button></Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {quotes.map(quote => {
            const client = quote.clients as any
            const clientName = client
              ? client.type === 'professionnel'
                ? client.company_name
                : `${client.first_name || ''} ${client.last_name || ''}`.trim()
              : 'Sans client'
            return (
              <Link key={quote.id} href={`/devis/${quote.id}`}>
                <Card className="hover:border-blue-300 transition-colors cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-gray-400">{quote.quote_number}</span>
                          <Badge className={`${statusColors[quote.status]} border-0 text-xs`}>
                            {statusLabels[quote.status]}
                          </Badge>
                        </div>
                        <p className="font-semibold text-gray-900 mt-1">
                          {clientName}
                          {quote.title && <span className="font-normal text-gray-500"> — {quote.title}</span>}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">{formatDate(quote.issue_date)}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-bold text-gray-900">{formatCurrency(quote.total_ttc)}</p>
                        <p className="text-xs text-gray-400">TTC</p>
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
