import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Landmark, CheckCircle2, AlertTriangle } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import BanqueConnect from './BanqueConnect'

export const dynamic = 'force-dynamic'

export default async function ParametresBanquePage({ searchParams }: { searchParams: Promise<{ connected?: string; error?: string }> }) {
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: connection }, { data: accounts }] = await Promise.all([
    supabase.from('bank_connections').select('id, status, institution_name, linked_at, expires_at')
      .eq('user_id', user.id).eq('status', 'linked').order('linked_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('bank_accounts').select('id, iban, name, last_synced_at').eq('user_id', user.id),
  ])
  const connected = !!connection

  const expires = connection?.expires_at ? new Date(connection.expires_at) : null
  const daysLeft = expires ? Math.ceil((expires.getTime() - Date.now()) / 86400000) : null
  const lastSync = (accounts || []).map(a => a.last_synced_at).filter(Boolean).sort().pop() as string | undefined

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/parametres"><Button variant="ghost" size="sm" className="gap-1"><ArrowLeft className="w-4 h-4" /> Retour</Button></Link>
        <h1 className="text-2xl font-bold text-marine">Connexion bancaire</h1>
      </div>

      <p className="text-sm text-gray-500">
        Connecte le compte bancaire de l&apos;entreprise (lecture seule, via un agrégateur agréé DSP2).
        Les virements reçus sont importés automatiquement et rapprochés de tes factures grâce à la
        référence indiquée dessus. Tu n&apos;as rien à saisir à la main.
      </p>

      {sp.connected && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" /> Banque connectée. Les virements vont se synchroniser automatiquement.
        </div>
      )}
      {sp.error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> La connexion n&apos;a pas abouti ({decodeURIComponent(sp.error)}). Réessaie.
        </div>
      )}

      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-start gap-3">
            <span className={`grid place-items-center w-11 h-11 rounded-xl flex-shrink-0 ${connected ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-500'}`}>
              <Landmark className="w-5 h-5" />
            </span>
            <div className="min-w-0 flex-1">
              {connected ? (
                <>
                  <p className="font-semibold text-marine">Banque connectée ✓</p>
                  <div className="mt-1 space-y-0.5 text-sm text-gray-500">
                    {(accounts || []).map(a => (
                      <p key={a.id} className="font-mono text-xs">{a.iban || a.name || 'Compte'}</p>
                    ))}
                    {lastSync && <p className="text-xs">Dernière synchro : {formatDate(lastSync)}</p>}
                    {daysLeft != null && (
                      <p className={`text-xs ${daysLeft < 15 ? 'text-amber-600 font-medium' : 'text-gray-400'}`}>
                        {daysLeft > 0 ? `Reconnexion à refaire dans ${daysLeft} j (obligation DSP2)` : 'Reconnexion nécessaire (consentement expiré)'}
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <p className="font-semibold text-marine">Aucune banque connectée</p>
                  <p className="text-sm text-gray-500 mt-0.5">Connecte ta banque pour suivre les encaissements automatiquement.</p>
                </>
              )}
            </div>
          </div>

          <BanqueConnect connected={connected} />
        </CardContent>
      </Card>

      <Link href="/banque" className="inline-block text-sm text-primary hover:underline">
        → Voir les paiements et virements à rapprocher
      </Link>
    </div>
  )
}
