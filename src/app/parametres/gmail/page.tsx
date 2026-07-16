'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Mail, CheckCircle, Loader2, ShieldCheck, Unlink } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

function GmailPageInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setLoading(false); return }
      supabase.from('gmail_connections').select('gmail_email').eq('user_id', user.id).maybeSingle()
        .then(({ data }) => {
          if (data?.gmail_email) setConnectedEmail(data.gmail_email)
          setLoading(false)
        })
    })

    const success = searchParams.get('success')
    const error = searchParams.get('error')
    if (success === 'connected') toast.success('Gmail connecté !')
    if (error === 'denied') toast.error('Connexion refusée par Google')
    if (error === 'token-failed') toast.error('Erreur lors de la connexion, réessayez')
    if (error === 'no-credentials') toast.error('Connexion Gmail indisponible — contactez le support')
    if (success || error) router.replace('/parametres/gmail')
  }, [searchParams, router])

  async function disconnect() {
    if (!confirm('Déconnecter Gmail ? Vous ne pourrez plus envoyer de devis, factures ou dossiers comptables par email.')) return
    setBusy(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setBusy(false); return }
    const { error } = await supabase.from('gmail_connections').delete().eq('user_id', user.id)
    setBusy(false)
    if (error) { toast.error('Erreur'); return }
    setConnectedEmail(null)
    toast.success('Gmail déconnecté')
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <Link href="/parametres" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
        <ArrowLeft className="w-4 h-4" /> Paramètres
      </Link>

      <div>
        <h1 className="text-2xl font-bold font-heading text-marine">Connexion Gmail</h1>
        <p className="text-gray-500 mt-1 text-sm">
          Pour envoyer vos devis, factures et contrats depuis votre propre adresse — et les retrouver dans vos « Envoyés ».
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="w-4 h-4 text-primary" /> Votre boîte mail
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Chargement…
            </div>
          ) : connectedEmail ? (
            <>
              <div className="flex items-center gap-3 rounded-xl bg-[#E9F2DB] p-3">
                <CheckCircle className="w-5 h-5 text-[#3F7A2E] flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#3F7A2E]">Gmail connecté</p>
                  <p className="text-xs text-gray-600 truncate">{connectedEmail}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { window.location.href = '/api/auth/gmail/initiate' }}>
                  Reconnecter
                </Button>
                <Button variant="destructive-soft" size="sm" className="gap-1" onClick={disconnect} disabled={busy}>
                  <Unlink className="w-3.5 h-3.5" /> Déconnecter
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-600">
                Un clic, vous vous connectez avec votre compte Google, et c&apos;est fini. Aucune clé à créer.
              </p>
              <Button className="gap-2 h-11" onClick={() => { setBusy(true); window.location.href = '/api/auth/gmail/initiate' }} disabled={busy}>
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                Connecter mon compte Gmail
              </Button>
              <p className="text-xs text-gray-400">
                Google affichera peut-être un écran « Application non validée » : c&apos;est normal pendant notre phase de test.
                Cliquez sur <strong>Paramètres avancés</strong> puis <strong>Continuer vers BatiPilot</strong>.
              </p>
            </>
          )}

          <div className="border-t border-gray-100 pt-3 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-gray-500">
              BatiPilot n&apos;accède qu&apos;à ce qui est nécessaire pour envoyer vos documents et afficher vos échanges clients.
              Vos identifiants Google ne transitent jamais par BatiPilot, et vous pouvez déconnecter à tout moment.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function GmailPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-400">Chargement…</div>}>
      <GmailPageInner />
    </Suspense>
  )
}
