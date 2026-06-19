'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function NouveauClientPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [type, setType] = useState<'particulier' | 'professionnel'>('particulier')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const form = e.currentTarget
    const data = new FormData(form)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: client, error } = await supabase.from('clients').insert({
      user_id: user.id,
      type,
      first_name: data.get('first_name') as string || null,
      last_name: data.get('last_name') as string || null,
      company_name: data.get('company_name') as string || null,
      email: data.get('email') as string || null,
      phone: data.get('phone') as string || null,
      billing_address: data.get('billing_address') as string || null,
      site_address: data.get('site_address') as string || null,
      siret: data.get('siret') as string || null,
      notes: data.get('notes') as string || null,
      status: 'nouveau',
    }).select().single()

    if (error) {
      toast.error('Erreur lors de la création du client')
    } else {
      toast.success('Client créé !')
      router.push(`/clients/${client.id}`)
    }
    setLoading(false)
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/clients">
          <Button variant="ghost" size="sm" className="gap-1">
            <ArrowLeft className="w-4 h-4" /> Retour
          </Button>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Nouveau client</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Type */}
        <Card>
          <CardHeader className="pb-3 pt-4 px-4">
            <CardTitle className="text-base">Type de client</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="grid grid-cols-2 gap-3">
              {(['particulier', 'professionnel'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`py-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                    type === t
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {t === 'particulier' ? '👤 Particulier' : '🏢 Professionnel'}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Infos */}
        <Card>
          <CardHeader className="pb-3 pt-4 px-4">
            <CardTitle className="text-base">Informations</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            {type === 'professionnel' && (
              <div className="space-y-1">
                <Label htmlFor="company_name">Nom de la société *</Label>
                <Input id="company_name" name="company_name" placeholder="Société Dupont" />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="first_name">Prénom</Label>
                <Input id="first_name" name="first_name" placeholder="Jean" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="last_name">Nom</Label>
                <Input id="last_name" name="last_name" placeholder="Dupont" />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="phone">Téléphone</Label>
              <Input id="phone" name="phone" type="tel" placeholder="06 12 34 56 78" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" placeholder="jean@email.com" />
            </div>
            {type === 'professionnel' && (
              <div className="space-y-1">
                <Label htmlFor="siret">SIRET</Label>
                <Input id="siret" name="siret" placeholder="123 456 789 00012" />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Adresses */}
        <Card>
          <CardHeader className="pb-3 pt-4 px-4">
            <CardTitle className="text-base">Adresses</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <div className="space-y-1">
              <Label htmlFor="billing_address">Adresse de facturation</Label>
              <Textarea id="billing_address" name="billing_address" rows={2} placeholder="12 rue de la Paix, 75001 Paris" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="site_address">Adresse du chantier (si différente)</Label>
              <Textarea id="site_address" name="site_address" rows={2} placeholder="Même adresse ou adresse du chantier" />
            </div>
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardHeader className="pb-3 pt-4 px-4">
            <CardTitle className="text-base">Notes internes</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <Textarea name="notes" rows={3} placeholder="Notes sur ce client (pas visibles par le client)..." />
          </CardContent>
        </Card>

        <Button type="submit" className="w-full h-12 text-base" disabled={loading}>
          {loading ? 'Création...' : 'Créer le client'}
        </Button>
      </form>
    </div>
  )
}
