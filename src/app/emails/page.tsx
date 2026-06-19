import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Mail } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default async function EmailsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: gmailConnection } = await supabase
    .from('gmail_connections')
    .select('gmail_email')
    .eq('user_id', user.id)
    .single()

  if (!gmailConnection) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">Mes mails du jour</h1>
        <Card>
          <CardContent className="py-12 text-center">
            <Mail className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="font-medium text-gray-700">Gmail non connecté</p>
            <p className="text-sm text-gray-500 mt-1 mb-4">
              Connectez votre Gmail pour voir et traiter vos emails ici
            </p>
            <Link href="/parametres/gmail">
              <Button>Connecter Gmail</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  const { data: emails } = await supabase
    .from('emails')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'non_traite')
    .order('received_at', { ascending: false })
    .limit(50)

  const importanceOrder = ['urgent', 'important', 'normal', 'faible', 'ignorer']
  const sorted = [...(emails || [])].sort((a, b) =>
    importanceOrder.indexOf(a.importance) - importanceOrder.indexOf(b.importance)
  )

  const importanceColors: Record<string, string> = {
    urgent: 'border-l-red-500', important: 'border-l-orange-400',
    normal: 'border-l-blue-400', faible: 'border-l-gray-300', ignorer: 'border-l-gray-200',
  }
  const categoryLabels: Record<string, string> = {
    demande_devis: '📋 Demande de devis', client_a_repondre: '💬 Client à répondre',
    relance_client: '🔔 Relance', fournisseur: '📦 Fournisseur',
    facture_recue: '🧾 Facture reçue', document_admin: '📄 Document admin',
    pub_newsletter: '📣 Pub / Newsletter', spam: '🗑️ Spam',
    personnel: '👤 Personnel', a_verifier: '❓ À vérifier',
  }

  const summary = {
    total: emails?.length || 0,
    devisRequests: emails?.filter(e => e.category === 'demande_devis').length || 0,
    clientsARepondre: emails?.filter(e => e.category === 'client_a_repondre').length || 0,
    factures: emails?.filter(e => e.category === 'facture_recue').length || 0,
    pubs: emails?.filter(e => e.category === 'pub_newsletter' || e.category === 'spam').length || 0,
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Mes mails du jour</h1>
        <form action="/api/gmail/sync" method="POST">
          <Button variant="outline" type="submit">Actualiser</Button>
        </form>
      </div>

      {summary.total > 0 && (
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4">
            <p className="font-medium text-blue-900">
              {summary.total} email{summary.total > 1 ? 's' : ''} à traiter
            </p>
            <div className="mt-2 flex flex-wrap gap-3 text-sm text-blue-700">
              {summary.devisRequests > 0 && <span>📋 {summary.devisRequests} demande{summary.devisRequests > 1 ? 's' : ''} de devis</span>}
              {summary.clientsARepondre > 0 && <span>💬 {summary.clientsARepondre} client{summary.clientsARepondre > 1 ? 's' : ''} à répondre</span>}
              {summary.factures > 0 && <span>🧾 {summary.factures} facture{summary.factures > 1 ? 's' : ''}</span>}
              {summary.pubs > 0 && <span>📣 {summary.pubs} pub{summary.pubs > 1 ? 's' : ''}</span>}
            </div>
          </CardContent>
        </Card>
      )}

      {!sorted.length ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            <Mail className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="font-medium">Aucun email à traiter</p>
            <p className="text-sm mt-1">Cliquez sur Actualiser pour charger vos emails</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {sorted.map(email => (
            <Link key={email.id} href={`/emails/${email.id}`}>
              <Card className={`hover:shadow-md transition-shadow cursor-pointer border-l-4 ${importanceColors[email.importance] || 'border-l-gray-200'}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-gray-900 truncate text-sm">
                          {email.from_name || email.from_email}
                        </span>
                        {email.category && (
                          <span className="text-xs text-gray-500 flex-shrink-0">
                            {categoryLabels[email.category] || email.category}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-700 font-medium truncate">{email.subject}</p>
                      {email.ai_summary && (
                        <p className="text-sm text-gray-500 mt-1 line-clamp-2">{email.ai_summary}</p>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 flex-shrink-0">
                      {email.received_at && new Date(email.received_at).toLocaleDateString('fr-FR')}
                    </div>
                  </div>
                  {email.ai_recommended_action && (
                    <div className="mt-2 text-xs text-blue-600 bg-blue-50 rounded px-2 py-1">
                      → {email.ai_recommended_action}
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
