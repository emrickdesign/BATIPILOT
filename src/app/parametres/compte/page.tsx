'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { ArrowLeft, User } from 'lucide-react'
import Link from 'next/link'

export default function ComptePage() {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loadingProfile, setLoadingProfile] = useState(false)
  const [loadingPassword, setLoadingPassword] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      setEmail(user.email || '')
      supabase.from('profiles').select('full_name').eq('id', user.id).single().then(({ data }) => {
        if (data) setName(data.full_name || '')
      })
    })
  }, [])

  async function handleUpdateProfile(e: React.FormEvent) {
    e.preventDefault()
    setLoadingProfile(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from('profiles').update({ full_name: name }).eq('id', user.id)
    if (error) toast.error('Erreur mise à jour profil')
    else toast.success('Profil mis à jour !')
    setLoadingProfile(false)
  }

  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword !== confirmPassword) { toast.error('Les mots de passe ne correspondent pas'); return }
    if (newPassword.length < 8) { toast.error('Minimum 8 caractères'); return }
    setLoadingPassword(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) toast.error('Erreur changement de mot de passe')
    else { toast.success('Mot de passe mis à jour !'); setNewPassword(''); setConfirmPassword('') }
    setLoadingPassword(false)
  }

  return (
    <div className="space-y-4 max-w-lg">
      <div className="flex items-center gap-3">
        <Link href="/parametres">
          <Button variant="ghost" size="sm" className="gap-1"><ArrowLeft className="w-4 h-4" /> Retour</Button>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Mon compte</h1>
      </div>

      <Card>
        <CardHeader className="pb-3 pt-4 px-4">
          <CardTitle className="text-base flex items-center gap-2"><User className="w-4 h-4" /> Informations</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <form onSubmit={handleUpdateProfile} className="space-y-3">
            <div className="space-y-1">
              <Label>Prénom et nom</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Jean Dupont" />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input value={email} disabled className="bg-gray-50 text-gray-500" />
              <p className="text-xs text-gray-400">L'email ne peut pas être modifié pour l'instant</p>
            </div>
            <Button type="submit" disabled={loadingProfile} className="w-full">
              {loadingProfile ? 'Sauvegarde...' : 'Mettre à jour'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 pt-4 px-4">
          <CardTitle className="text-base">Changer le mot de passe</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <form onSubmit={handleUpdatePassword} className="space-y-3">
            <div className="space-y-1">
              <Label>Nouveau mot de passe</Label>
              <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Au moins 8 caractères" minLength={8} />
            </div>
            <div className="space-y-1">
              <Label>Confirmer</Label>
              <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Répétez le mot de passe" />
            </div>
            <Button type="submit" variant="outline" disabled={loadingPassword} className="w-full">
              {loadingPassword ? 'Mise à jour...' : 'Changer le mot de passe'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
