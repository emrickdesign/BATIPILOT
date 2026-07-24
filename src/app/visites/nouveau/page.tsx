'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { ArrowLeft, Camera } from 'lucide-react'
import { clientDisplayName } from '@/lib/chantiers'

type ClientOption = { id: string; type: string; first_name: string | null; last_name: string | null; company_name: string | null }

export default function NouvelleVisitePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [clients, setClients] = useState<ClientOption[]>([])
  const [clientId, setClientId] = useState(searchParams.get('client') || '')
  const [title, setTitle] = useState('')
  const [address, setAddress] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('clients').select('id, type, first_name, last_name, company_name')
        .eq('user_id', user.id).neq('status', 'archive').order('created_at', { ascending: false })
        .then(({ data }) => setClients((data as ClientOption[]) || []))
    })
  }, [])

  async function start() {
    setBusy(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setBusy(false); return }
    const finalTitle = title.trim() || `Visite du ${new Date().toLocaleDateString('fr-FR')}`
    const { data, error } = await supabase.from('site_visits')
      .insert({ user_id: user.id, client_id: clientId || null, title: finalTitle, address: address.trim() || null })
      .select('id').single()
    if (error || !data) { toast.error('Impossible de démarrer la visite'); setBusy(false); return }
    router.replace(`/visites/${data.id}`)
  }

  return (
    <div className="space-y-5 max-w-lg animate-fade-up">
      <div className="flex items-center gap-3">
        <Link href="/visites"><Button variant="ghost" size="sm" className="gap-1"><ArrowLeft className="w-4 h-4" /> Retour</Button></Link>
      </div>
      <div>
        <h1 className="text-2xl font-bold font-heading text-marine">Nouvelle visite</h1>
        <p className="text-gray-500 mt-1 text-sm">Deux infos et c&apos;est parti — vous compléterez sur place.</p>
      </div>

      <Card className="border-0 shadow-[var(--shadow-sm)]">
        <CardContent className="p-4 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Nom de la visite</Label>
            <Input id="title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex : Réno SDB — M. Martin" className="h-11" />
            <p className="text-xs text-gray-400">Laissez vide pour un nom automatique (date du jour).</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="client">Client / prospect (optionnel)</Label>
            <select id="client" value={clientId} onChange={e => setClientId(e.target.value)}
              className="w-full h-11 rounded-md border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="">— Aucun pour l&apos;instant —</option>
              {clients.map(c => <option key={c.id} value={c.id}>{clientDisplayName(c)}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="address">Adresse (optionnel)</Label>
            <Input id="address" value={address} onChange={e => setAddress(e.target.value)} placeholder="12 rue de la Paix, 75001 Paris" className="h-11" />
          </div>
          <Button onClick={start} disabled={busy} className="w-full h-12 text-base gap-2">
            <Camera className="w-5 h-5" /> {busy ? 'Démarrage…' : 'Démarrer la visite'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
