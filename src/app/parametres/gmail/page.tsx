'use client'

import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Mail, CheckCircle, AlertCircle, ExternalLink, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Suspense } from 'react'

function GmailPageInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  // Refs pour lire la valeur DOM réelle même si l'autofill ne déclenche pas onChange
  const clientIdRef = useRef<HTMLInputElement>(null)
  const clientSecretRef = useRef<HTMLInputElement>(null)
  const [clientId, setClientId] = useState('')
  const [saving, setSaving] = useState(false)
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('gmail_connections').select('client_id, gmail_email').eq('user_id', user.id).single().then(({ data }) => {
        if (data?.client_id) setClientId(data.client_id)
        if (data?.gmail_email) setConnectedEmail(data.gmail_email)
        setLoading(false)
      })
    })

    const success = searchParams.get('success')
    const error = searchParams.get('error')
    if (success === 'connected') toast.success('Gmail connecté avec succès !')
    if (error === 'denied') toast.error('Connexion refusée par Google')
    if (error === 'token-failed') toast.error('Erreur lors de l\'échange de tokens — vérifiez vos clés')
    if (error === 'no-credentials') toast.error('Clés non trouvées — réessayez')
    // Nettoie l'URL après lecture des params
    if (success || error) router.replace('/parametres/gmail')
  }, [searchParams, router])

  async function handleConnectGmail(e: React.FormEvent) {
    e.preventDefault()

    // Lire la valeur DOM réelle (gère l'autofill navigateur)
    const idVal = clientIdRef.current?.value?.trim() || clientId.trim()
    const secretVal = clientSecretRef.current?.value?.trim() || ''

    if (!idVal) { toast.error('Entrez votre Client ID'); return }
    if (!secretVal) { toast.error('Entrez votre Client Secret'); return }

    setSaving(true)
    try {
      const res = await fetch('/api/auth/gmail/save-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: idVal, client_secret: secretVal }),
      })

      let json: any = {}
      try { json = await res.json() } catch {}

      if (!res.ok) {
        toast.error(json.error || `Erreur sauvegarde (${res.status})`)
        setSaving(false)
        return
      }

      // Sauvegarde OK → redirection OAuth Google
      window.location.href = '/api/auth/gmail/initiate'
    } catch {
      toast.error('Erreur réseau — réessayez')
      setSaving(false)
    }
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Chargement...</div>

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/parametres">
          <Button variant="ghost" size="sm" className="gap-1"><ArrowLeft className="w-4 h-4" /> Retour</Button>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Connexion Gmail</h1>
      </div>

      {connectedEmail ? (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
              <div>
                <p className="font-medium text-green-800">Gmail connecté</p>
                <p className="text-sm text-green-600">{connectedEmail}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" className="border-green-300 text-green-700"
              onClick={() => { window.location.href = '/api/auth/gmail/initiate' }}>
              Reconnecter
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <p className="text-sm text-amber-800">Gmail non connecté — entrez vos clés et cliquez sur "Connecter Gmail"</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3 pt-4 px-4">
          <CardTitle className="text-base">Vos clés Google OAuth</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <form onSubmit={handleConnectGmail} className="space-y-3">
            <div className="space-y-1">
              <Label>Client ID</Label>
              <Input
                ref={clientIdRef}
                defaultValue={clientId}
                autoComplete="off"
                placeholder="710084271817-xxx.apps.googleusercontent.com"
              />
            </div>
            <div className="space-y-1">
              <Label>Client Secret</Label>
              <Input
                ref={clientSecretRef}
                type="text"
                autoComplete="off"
                placeholder="GOCSPX-..."
              />
              <p className="text-xs text-gray-400">Visible en clair pour éviter les problèmes d'autofill</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <ExternalLink className="w-3 h-3" />
              <a href="https://console.cloud.google.com/auth/clients" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">
                Retrouver mes clés sur Google Cloud Console
              </a>
            </div>
            <Button type="submit" disabled={saving} className="w-full h-11 gap-2 text-base">
              {saving
                ? <><Loader2 className="w-4 h-4 animate-spin" />Connexion en cours...</>
                : <><Mail className="w-5 h-5" />Connecter Gmail</>}
            </Button>
            <p className="text-xs text-gray-400 text-center">
              Vous serez redirigé vers Google, puis automatiquement ramené sur BatiPilot.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

export default function GmailPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">Chargement...</div>}>
      <GmailPageInner />
    </Suspense>
  )
}
