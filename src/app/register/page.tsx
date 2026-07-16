'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'

export default function RegisterPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [pendingEmail, setPendingEmail] = useState<string | null>(null)

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const supabase = createClient()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    })
    if (error) {
      toast.error(error.message)
      setLoading(false)
      return
    }
    // Sans confirmation d'email, signUp ouvre directement une session → dashboard.
    // Avec confirmation, il n'y a PAS de session : envoyer sur /dashboard renvoyait
    // l'utilisateur vers /login, où l'erreur s'affichait en « mot de passe incorrect ».
    if (data.session) {
      toast.success('Bienvenue sur BatiPilot !')
      router.push('/dashboard')
      router.refresh()
    } else {
      setPendingEmail(email)
    }
    setLoading(false)
  }

  async function resendConfirmation() {
    setLoading(true)
    const { error } = await createClient().auth.resend({ type: 'signup', email })
    setLoading(false)
    toast[error ? 'error' : 'success'](error ? error.message : 'Lien renvoyé — pense à regarder tes spams.')
  }

  // Confirmation requise : on l'annonce clairement au lieu d'envoyer dans le mur
  if (pendingEmail) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="text-4xl mb-2">📬</div>
            <CardTitle className="text-2xl font-bold">Confirme ton email</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <p className="text-sm text-gray-600">
              On vient d&apos;envoyer un lien à <strong>{pendingEmail}</strong>. Clique dessus pour activer ton compte,
              puis reviens te connecter.
            </p>
            <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-2">
              Rien reçu ? <strong>Regarde tes spams</strong> — c&apos;est là que ça finit le plus souvent.
            </p>
            <div className="flex flex-col gap-2">
              <Button variant="outline" onClick={resendConfirmation} disabled={loading}>
                {loading ? 'Envoi…' : 'Renvoyer le lien'}
              </Button>
              <Button variant="ghost" onClick={() => router.push('/login')}>Aller à la connexion</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="text-4xl mb-2">🏗️</div>
          <CardTitle className="text-2xl font-bold">Créer votre compte</CardTitle>
          <p className="text-gray-500 text-sm">BatiPilot — Assistant artisan</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Votre prénom et nom</Label>
              <Input
                id="name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Jean Dupont"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="votre@email.com"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Au moins 8 caractères"
                minLength={8}
                required
              />
            </div>
            <Button type="submit" className="w-full h-12 text-base" disabled={loading}>
              {loading ? 'Création...' : 'Créer mon compte'}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm text-gray-500">
            Déjà un compte ?{' '}
            <a href="/login" className="text-blue-600 hover:underline font-medium">
              Se connecter
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
