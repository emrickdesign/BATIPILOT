'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Camera, Binoculars, Info, UserPlus, Search, MapPin, User, Plus } from 'lucide-react'
import { clientDisplayName } from '@/lib/chantiers'
import { prospectStatuses } from '@/lib/clients'
import ClientCombobox from '@/components/ClientCombobox'

type ClientOption = { id: string; type: string; first_name: string | null; last_name: string | null; company_name: string | null; site_address: string | null; billing_address: string | null }
const clientAddress = (c?: ClientOption | null) => (c ? (c.site_address || c.billing_address || '') : '')

export default function NouvelleVisiteDialog({ variant = 'default' }: { variant?: 'default' | 'empty' }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [prospects, setProspects] = useState<ClientOption[]>([])
  const [mode, setMode] = useState<'existant' | 'nouveau'>('existant')
  const [clientId, setClientId] = useState('')
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [title, setTitle] = useState('')
  const [address, setAddress] = useState('')
  const [busy, setBusy] = useState(false)

  // Charge les prospects à l'ouverture du pop-up.
  useEffect(() => {
    if (!open) return
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('clients').select('id, type, first_name, last_name, company_name, site_address, billing_address')
        .eq('user_id', user.id).in('status', prospectStatuses).order('created_at', { ascending: false })
        .then(({ data }) => setProspects((data as ClientOption[]) || []))
    })
  }, [open])

  const canStart = mode === 'existant' ? !!clientId : !!newName.trim()

  async function start() {
    if (!canStart) { toast.error('Choisissez un prospect (ou créez-en un).'); return }
    setBusy(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setBusy(false); return }

    let linkedId = clientId || null
    if (mode === 'nouveau') {
      const parts = newName.trim().split(/\s+/)
      const first_name = parts[0] || null
      const last_name = parts.slice(1).join(' ') || null
      const { data: created, error: cErr } = await supabase.from('clients')
        .insert({ user_id: user.id, type: 'particulier', first_name, last_name, phone: newPhone.trim() || null, site_address: address.trim() || null, status: 'nouveau' })
        .select('id').single()
      if (cErr || !created) { toast.error('Impossible de créer le prospect'); setBusy(false); return }
      linkedId = created.id
    }

    const finalTitle = title.trim() || `Visite du ${new Date().toLocaleDateString('fr-FR')}`
    const { data, error } = await supabase.from('site_visits')
      .insert({ user_id: user.id, client_id: linkedId, title: finalTitle, address: address.trim() || null })
      .select('id').single()
    if (error || !data) { toast.error('Impossible de démarrer la visite'); setBusy(false); return }
    router.push(`/visites/${data.id}`)
  }

  return (
    <>
      {variant === 'empty' ? (
        <Button onClick={() => setOpen(true)} className="mt-4 gap-1.5"><Plus className="w-4 h-4" /> Démarrer une visite</Button>
      ) : (
        <Button onClick={() => setOpen(true)} className="gap-1.5"><Plus className="w-4 h-4" /> Nouvelle visite</Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex flex-col gap-0 w-screen h-[100dvh] max-w-none max-h-[100dvh] rounded-none border-0 ring-0 p-0">
          {/* En-tête fixe */}
          <DialogHeader className="flex-shrink-0 border-b border-gray-100 px-5 py-4 sm:px-6">
            <DialogTitle className="flex items-center gap-3">
              <span className="grid place-items-center w-11 h-11 rounded-2xl bg-gradient-to-br from-[#FF8A2B] to-[#FF6A00] text-white shadow-[var(--shadow-brand)] flex-shrink-0">
                <Binoculars className="w-5 h-5" />
              </span>
              <span>
                <span className="block text-lg font-bold font-heading text-marine leading-tight">Nouvelle visite de repérage</span>
                <span className="block text-xs font-normal text-gray-500">Chez un prospect : photos + notes, avant le devis.</span>
              </span>
            </DialogTitle>
          </DialogHeader>

          {/* Corps scrollable — contenu centré et confortable sur grand écran */}
          <div className="flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-xl px-5 py-6 sm:px-6 space-y-5">
              {/* Explication prospect → client */}
              <div className="flex gap-2.5 rounded-xl bg-primary/[0.05] border border-primary/15 p-3 text-xs text-marine/80">
                <Info className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                <span>Une visite se fait chez un <span className="font-semibold">prospect</span>. Il deviendra <span className="font-semibold">client</span> automatiquement dès qu&apos;un devis sera signé.</span>
              </div>

              {/* Prospect : existant / nouveau */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5"><User className="w-3.5 h-3.5 text-gray-400" /> Prospect</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setMode('existant')}
                    className={`h-10 rounded-lg text-sm font-medium border transition-colors inline-flex items-center justify-center gap-1.5 ${mode === 'existant' ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200 hover:border-primary/40'}`}>
                    <Search className="w-4 h-4" /> Existant
                  </button>
                  <button type="button" onClick={() => setMode('nouveau')}
                    className={`h-10 rounded-lg text-sm font-medium border transition-colors inline-flex items-center justify-center gap-1.5 ${mode === 'nouveau' ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200 hover:border-primary/40'}`}>
                    <UserPlus className="w-4 h-4" /> Nouveau
                  </button>
                </div>

                {mode === 'existant' ? (
                  <>
                    <ClientCombobox
                      options={prospects.map(c => ({ id: c.id, label: clientDisplayName(c) }))}
                      value={clientId}
                      onChange={id => {
                        setClientId(id)
                        const addr = clientAddress(prospects.find(c => c.id === id))
                        if (id && addr && !address.trim()) setAddress(addr)
                      }}
                      placeholder="Rechercher un prospect…"
                    />
                    {prospects.length === 0 && <p className="text-xs text-gray-400">Aucun prospect enregistré — créez-en un via « Nouveau ».</p>}
                  </>
                ) : (
                  <div className="space-y-2">
                    <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nom du prospect (ex : M. Martin)" className="h-11" />
                    <Input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="Téléphone (optionnel)" className="h-11" inputMode="tel" />
                    <p className="text-xs text-gray-400">Le prospect sera créé dans votre pipeline (statut « Nouveau »).</p>
                  </div>
                )}
              </div>

              {/* Adresse */}
              <div className="space-y-1.5">
                <Label htmlFor="visit-address" className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-gray-400" /> Adresse du chantier</Label>
                <Input id="visit-address" value={address} onChange={e => setAddress(e.target.value)} placeholder="12 rue de la Paix, 75001 Paris" className="h-11" />
              </div>

              {/* Nom de la visite */}
              <div className="space-y-1.5">
                <Label htmlFor="visit-title">Nom de la visite <span className="text-gray-400 font-normal">(optionnel)</span></Label>
                <Input id="visit-title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex : Réno SDB — M. Martin" className="h-11" />
                <p className="text-xs text-gray-400">Laissez vide pour un nom automatique (date du jour).</p>
              </div>
            </div>
          </div>

          {/* Pied fixe : CTA toujours visible */}
          <div className="flex-shrink-0 border-t border-gray-100 bg-white/90 supports-backdrop-filter:backdrop-blur px-5 py-4 sm:px-6">
            <div className="mx-auto w-full max-w-xl">
              <Button onClick={start} disabled={busy || !canStart} className="w-full h-12 text-base gap-2">
                <Camera className="w-5 h-5" /> {busy ? 'Démarrage…' : 'Démarrer la visite'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
