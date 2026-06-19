import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Mail, FileText, Receipt, Users, Tag, Search } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

async function getStats(userId: string) {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]

  const [quotes, invoices, clients] = await Promise.all([
    supabase.from('quotes').select('status').eq('user_id', userId),
    supabase.from('invoices').select('status, due_date').eq('user_id', userId),
    supabase.from('clients').select('id').eq('user_id', userId),
  ])

  const quotesData = quotes.data || []
  const invoicesData = invoices.data || []

  return {
    devisEnAttente: quotesData.filter(q => q.status === 'envoye').length,
    devisBrouillon: quotesData.filter(q => q.status === 'brouillon').length,
    facturesAEnvoyer: invoicesData.filter(i => i.status === 'brouillon').length,
    facturesEnRetard: invoicesData.filter(i =>
      i.status === 'envoyee' && i.due_date && i.due_date < today
    ).length,
    totalClients: clients.data?.length || 0,
  }
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  const stats = await getStats(user.id)
  const prenom = profile?.full_name?.split(' ')[0] || 'vous'

  const actions = [
    { href: '/emails', label: 'Mes mails du jour', icon: Mail, color: 'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200', count: null },
    { href: '/devis/nouveau', label: 'Créer un devis', icon: FileText, color: 'bg-green-50 hover:bg-green-100 text-green-700 border-green-200', count: null },
    { href: '/factures/nouveau', label: 'Créer une facture', icon: Receipt, color: 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200', count: null },
    { href: '/clients', label: 'Mes clients', icon: Users, color: 'bg-orange-50 hover:bg-orange-100 text-orange-700 border-orange-200', count: stats.totalClients },
    { href: '/prix', label: 'Mes prix', icon: Tag, color: 'bg-yellow-50 hover:bg-yellow-100 text-yellow-700 border-yellow-200', count: null },
    { href: '/plans', label: 'Analyser un plan', icon: Search, color: 'bg-gray-50 hover:bg-gray-100 text-gray-700 border-gray-200', count: null },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Bonjour {prenom} 👋
        </h1>
        <p className="text-gray-500 mt-1">Que voulez-vous faire aujourd&apos;hui ?</p>
      </div>

      {/* Alertes */}
      {(stats.devisEnAttente > 0 || stats.facturesEnRetard > 0 || stats.facturesAEnvoyer > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {stats.devisEnAttente > 0 && (
            <Link href="/devis?statut=envoye">
              <Card className="border-orange-200 bg-orange-50 hover:bg-orange-100 transition-colors cursor-pointer">
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-orange-700">{stats.devisEnAttente}</div>
                  <div className="text-sm text-orange-600 font-medium">
                    devis en attente de réponse
                  </div>
                </CardContent>
              </Card>
            </Link>
          )}
          {stats.facturesAEnvoyer > 0 && (
            <Link href="/factures?statut=brouillon">
              <Card className="border-blue-200 bg-blue-50 hover:bg-blue-100 transition-colors cursor-pointer">
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-blue-700">{stats.facturesAEnvoyer}</div>
                  <div className="text-sm text-blue-600 font-medium">
                    factures à envoyer
                  </div>
                </CardContent>
              </Card>
            </Link>
          )}
          {stats.facturesEnRetard > 0 && (
            <Link href="/factures?statut=en_retard">
              <Card className="border-red-200 bg-red-50 hover:bg-red-100 transition-colors cursor-pointer">
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-red-700">{stats.facturesEnRetard}</div>
                  <div className="text-sm text-red-600 font-medium">
                    factures en retard
                  </div>
                </CardContent>
              </Card>
            </Link>
          )}
        </div>
      )}

      {/* Actions principales */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {actions.map(({ href, label, icon: Icon, color, count }) => (
          <Link key={href} href={href}>
            <Card className={`border ${color} transition-colors cursor-pointer h-full`}>
              <CardContent className="p-5 flex flex-col items-center text-center gap-3">
                <Icon className="w-8 h-8" />
                <span className="font-semibold text-sm leading-tight">{label}</span>
                {count !== null && count > 0 && (
                  <span className="text-xs opacity-70">{count} enregistré{count > 1 ? 's' : ''}</span>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
