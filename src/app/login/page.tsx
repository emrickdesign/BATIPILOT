'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { HardHat } from 'lucide-react'
import { toast } from 'sonner'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'login' | 'forgot'>('login')

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault()
    if (!email) { toast.error('Entre ton email d’abord.'); return }
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setLoading(false)
    if (error) {
      toast.error(error.message)
    } else {
      // Message neutre : on ne révèle pas si l'email existe ou non.
      toast.success('Si un compte existe pour cet email, un lien de réinitialisation vient d’être envoyé. Pense à regarder tes spams.', { duration: 9000 })
      setMode('login')
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      // Ne jamais annoncer « mot de passe incorrect » quand ce n'est pas la cause :
      // un email non confirmé bloque la connexion alors que le mot de passe est bon.
      const code = (error as { code?: string }).code
      const msg = error.message?.toLowerCase() || ''
      if (code === 'email_not_confirmed' || msg.includes('not confirmed')) {
        const { error: resendErr } = await supabase.auth.resend({ type: 'signup', email })
        toast.error(
          resendErr
            ? "Ton email n'est pas encore confirmé. Regarde ta boîte (et les spams) — le lien t'a déjà été envoyé."
            : "Ton email n'est pas encore confirmé. On vient de te renvoyer le lien — pense à regarder tes spams.",
          { duration: 8000 },
        )
      } else if (code === 'invalid_credentials' || msg.includes('invalid login')) {
        toast.error('Email ou mot de passe incorrect')
      } else {
        toast.error(error.message)
      }
    } else {
      router.push('/dashboard')
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-app-bg p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center items-center gap-3 pt-2">
          <span className="grid place-items-center w-14 h-14 rounded-2xl bg-gradient-to-br from-[#FF8A2B] to-[#FF6A00] shadow-[var(--shadow-brand)]">
            <HardHat className="w-7 h-7 text-white" strokeWidth={2.2} />
          </span>
          <CardTitle className="text-2xl font-bold font-heading">Ton<span className="text-primary">Pilote</span></CardTitle>
          <p className="text-muted-foreground text-sm -mt-1">Votre assistant administratif</p>
        </CardHeader>
        <CardContent>
          {mode === 'login' ? (
            <>
              <form onSubmit={handleLogin} className="space-y-4">
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
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Mot de passe</Label>
                    <button
                      type="button"
                      onClick={() => setMode('forgot')}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Mot de passe oublié ?
                    </button>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                  />
                </div>
                <Button type="submit" className="w-full h-12 text-base" disabled={loading}>
                  {loading ? 'Connexion...' : 'Se connecter'}
                </Button>
              </form>
              <div className="mt-5 text-center text-sm text-muted-foreground">
                Pas encore de compte ?{' '}
                <a href="/register" className="text-primary hover:underline font-medium">
                  Créer un compte
                </a>
              </div>
            </>
          ) : (
            <>
              <p className="mb-4 text-sm text-muted-foreground">
                Entre l’email de ton compte : on t’envoie un lien pour définir un nouveau mot de passe.
              </p>
              <form onSubmit={handleForgot} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reset-email">Email</Label>
                  <Input
                    id="reset-email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="votre@email.com"
                    required
                  />
                </div>
                <Button type="submit" className="w-full h-12 text-base" disabled={loading}>
                  {loading ? 'Envoi...' : 'Envoyer le lien de réinitialisation'}
                </Button>
              </form>
              <div className="mt-5 text-center text-sm">
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="text-primary hover:underline font-medium"
                >
                  ← Retour à la connexion
                </button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
