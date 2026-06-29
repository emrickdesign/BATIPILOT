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

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      toast.error('Email ou mot de passe incorrect')
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
          <CardTitle className="text-2xl font-bold font-heading">Bati<span className="text-primary">Pilot</span></CardTitle>
          <p className="text-muted-foreground text-sm -mt-1">Votre assistant administratif</p>
        </CardHeader>
        <CardContent>
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
              <Label htmlFor="password">Mot de passe</Label>
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
        </CardContent>
      </Card>
    </div>
  )
}
