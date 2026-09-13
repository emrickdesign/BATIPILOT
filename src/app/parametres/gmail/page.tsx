'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ArrowLeft, Mail, CheckCircle, Loader2, ShieldCheck, Unlink, ArrowRight, Lock } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

function GmailPageInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  function proceedToGoogle() { setBusy(true); window.location.href = '/api/auth/gmail/initiate' }

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
                <Button variant="outline" size="sm" onClick={() => setShowHelp(true)}>
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
              <Button className="gap-2 h-11" onClick={() => setShowHelp(true)} disabled={busy}>
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                Connecter mon compte Gmail
              </Button>
            </>
          )}

          <div className="border-t border-gray-100 pt-3 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-gray-500">
              TonPilote n&apos;accède qu&apos;à ce qui est nécessaire pour envoyer vos documents et afficher vos échanges clients.
              Vos identifiants Google ne transitent jamais par TonPilote, et vous pouvez déconnecter à tout moment.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Écran d'explication AVANT Google : rassure et montre les 3 clics à faire,
          pour que l'utilisateur n'ait pas peur de l'écran « application non validée ». */}
      <Dialog open={showHelp} onOpenChange={setShowHelp}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Mail className="w-5 h-5 text-[#E0674C]" /> Avant de connecter Gmail</DialogTitle>
          </DialogHeader>

          <div className="rounded-xl bg-[#FBF3EF] border border-[#E0674C]/20 p-3 text-[13px] text-marine">
            Google va afficher un écran <b>« Google n’a pas validé cette application »</b>. C’est <b>normal</b> : TonPilote est en cours de validation officielle. Il n’y a <b>aucun risque</b> — voici les 3 clics à faire :
          </div>

          <ol className="mt-1 space-y-2.5">
            {[
              <>Clique <b>« Continuer vers Google »</b> ci-dessous.</>,
              <>Sur l’écran Google, en bas à gauche : clique <b>« Paramètres avancés »</b>.</>,
              <>Puis clique <b>« Continuer vers TonPilote (non sécurisé) »</b> et autorise l’accès.</>,
            ].map((txt, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="grid place-items-center w-6 h-6 rounded-full bg-[#E0674C] text-white text-xs font-bold flex-shrink-0">{i + 1}</span>
                <span className="text-sm text-gray-700 leading-snug">{txt}</span>
              </li>
            ))}
          </ol>

          <div className="mt-1 flex items-start gap-2 rounded-xl bg-[#F1F6E9] border border-[#4C6F18]/20 p-3">
            <Lock className="w-4 h-4 text-[#4C6F18] flex-shrink-0 mt-0.5" />
            <p className="text-[12px] text-[#3A5613] leading-snug">
              « Non sécurisé » est juste un message d’attente de Google. TonPilote ne lit et n’envoie des e-mails <b>que quand tu le demandes</b>, ne voit jamais ton mot de passe, et tu peux te déconnecter à tout moment.
            </p>
          </div>

          <Button className="w-full h-11 gap-2 mt-1" onClick={proceedToGoogle} disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />} Continuer vers Google
          </Button>
          <button onClick={() => setShowHelp(false)} className="w-full text-center text-xs text-gray-400 hover:text-gray-600">Annuler</button>
        </DialogContent>
      </Dialog>
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
