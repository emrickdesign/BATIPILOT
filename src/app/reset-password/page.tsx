'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { HardHat, Loader2, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'

type Phase = 'checking' | 'form' | 'invalid' | 'done'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('checking')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    async function init() {
      const params = new URLSearchParams(window.location.search)
      if (params.get('error')) { setPhase('invalid'); return }
      const code = params.get('code')
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error) { setPhase('form'); return }
      }
      // Repli : le client a peut-être déjà établi la session via le lien (#access_token…)
      const { data } = await supabase.auth.getSession()
      setPhase(data.session ? 'form' : 'invalid')
    }
    init()
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) { toast.error('Mot de passe : 8 caractères minimum.'); return }
    if (password !== confirm) { toast.error('Les deux mots de passe ne correspondent pas.'); return }
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    setSaving(false)
    if (error) { toast.error(error.message); return }
    setPhase('done')
    toast.success('Mot de passe mis à jour.')
    setTimeout(() => { router.push('/dashboard'); router.refresh() }, 1200)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-app-bg p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center items-center gap-3 pt-2">
          <span className="grid place-items-center w-14 h-14 rounded-2xl bg-gradient-to-br from-[#FF8A2B] to-[#FF6A00] shadow-[var(--shadow-brand)]">
            <HardHat className="w-7 h-7 text-white" strokeWidth={2.2} />
          </span>
          <CardTitle className="text-2xl font-bold font-heading">Nouveau mot de passe</CardTitle>
        </CardHeader>
        <CardContent>
          {phase === 'checking' && (
            <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin" />
              <p className="text-sm">Vérification du lien…</p>
            </div>
          )}

          {phase === 'invalid' && (
            <div className="py-4 text-center">
              <p className="text-sm text-muted-foreground">
                Ce lien de réinitialisation est invalide ou a expiré. Redemande un lien depuis la page de connexion.
              </p>
              <Button className="mt-4 w-full h-11" onClick={() => router.push('/login')}>
                Retour à la connexion
              </Button>
            </div>
          )}

          {phase === 'form' && (
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pwd">Nouveau mot de passe</Label>
                <Input id="pwd" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pwd2">Confirmer</Label>
                <Input id="pwd2" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="••••••••" required />
              </div>
              <Button type="submit" className="w-full h-12 text-base" disabled={saving}>
                {saving ? 'Enregistrement…' : 'Définir le nouveau mot de passe'}
              </Button>
            </form>
          )}

          {phase === 'done' && (
            <div className="flex flex-col items-center gap-2 py-6 text-green-600">
              <CheckCircle2 className="w-8 h-8" />
              <p className="text-sm font-medium">Mot de passe mis à jour — redirection…</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
