'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { ArrowLeft, Search, ExternalLink, Star, Check } from 'lucide-react'
import Link from 'next/link'

export default function EntreprisePage() {
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [form, setForm] = useState({
    trade_name: '', legal_name: '', siret: '', vat_number: '', legal_status: '',
    address: '', phone: '', email: '', website: '',
    insurance_decennale: '', insurance_rc: '', iban: '',
    payment_terms: '30 jours à réception de facture',
    quote_validity_days: '30', default_deposit_percent: '30',
    default_vat_rate: '10', legal_mentions: 'TVA à taux réduit — Article 279-0 bis du CGI',
    google_review_url: '',
  })

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('companies').select('*').eq('user_id', user.id).single().then(({ data }) => {
        if (data) {
          setCompanyId(data.id)
          setForm({
            trade_name: data.trade_name || '',
            legal_name: data.legal_name || '',
            siret: data.siret || '',
            vat_number: data.vat_number || '',
            legal_status: data.legal_status || '',
            address: data.address || '',
            phone: data.phone || '',
            email: data.email || '',
            website: data.website || '',
            insurance_decennale: data.insurance_decennale || '',
            insurance_rc: data.insurance_rc || '',
            iban: data.iban || '',
            payment_terms: data.payment_terms || '30 jours à réception de facture',
            quote_validity_days: String(data.quote_validity_days || 30),
            default_deposit_percent: String(data.default_deposit_percent || 30),
            default_vat_rate: String(data.default_vat_rate || 10),
            legal_mentions: data.legal_mentions || '',
            google_review_url: data.google_review_url || '',
          })
        }
        setFetching(false)
      })
    })
  }, [])

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const payload = {
      user_id: user.id,
      trade_name: form.trade_name,
      legal_name: form.legal_name || null,
      siret: form.siret || null,
      vat_number: form.vat_number || null,
      legal_status: form.legal_status || null,
      address: form.address || null,
      phone: form.phone || null,
      email: form.email || null,
      website: form.website || null,
      insurance_decennale: form.insurance_decennale || null,
      insurance_rc: form.insurance_rc || null,
      iban: form.iban || null,
      payment_terms: form.payment_terms,
      quote_validity_days: parseInt(form.quote_validity_days) || 30,
      default_deposit_percent: parseFloat(form.default_deposit_percent) || 30,
      default_vat_rate: parseFloat(form.default_vat_rate) || 10,
      legal_mentions: form.legal_mentions || null,
      google_review_url: form.google_review_url.trim() || null,
    }

    let error
    if (companyId) {
      const res = await supabase.from('companies').update(payload).eq('id', companyId)
      error = res.error
    } else {
      const res = await supabase.from('companies').insert(payload).select().single()
      if (res.data) setCompanyId(res.data.id)
      error = res.error
    }

    if (error) toast.error('Erreur lors de la sauvegarde')
    else toast.success('Informations entreprise sauvegardées !')
    setLoading(false)
  }

  if (fetching) return <div className="p-8 text-center text-gray-400">Chargement...</div>

  // Étape 1 du guide avis : recherche Google du terme littéral « mon entreprise ».
  // Connecté à son compte Google, l'artisan voit alors les fiches qu'il gère.
  const googleBusinessUrl = `https://www.google.com/search?q=${encodeURIComponent('mon entreprise')}`

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/parametres">
          <Button variant="ghost" size="sm" className="gap-1"><ArrowLeft className="w-4 h-4" /> Retour</Button>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Mon entreprise</h1>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        <Card>
          <CardHeader className="pb-3 pt-4 px-4"><CardTitle className="text-base">Identité</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <div className="space-y-1">
              <Label>Nom commercial *</Label>
              <Input value={form.trade_name} onChange={e => set('trade_name', e.target.value)} placeholder="Mon Entreprise BTP" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Nom juridique</Label>
                <Input value={form.legal_name} onChange={e => set('legal_name', e.target.value)} placeholder="Dupont Jean-Pierre" />
              </div>
              <div className="space-y-1">
                <Label>Statut juridique</Label>
                <select value={form.legal_status} onChange={e => set('legal_status', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white">
                  <option value="">Sélectionner...</option>
                  <option value="micro-entreprise">Micro-entreprise</option>
                  <option value="EI">EI (Entreprise individuelle)</option>
                  <option value="EURL">EURL</option>
                  <option value="SARL">SARL</option>
                  <option value="SAS">SAS</option>
                  <option value="SASU">SASU</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>SIRET</Label>
                <Input value={form.siret} onChange={e => set('siret', e.target.value)} placeholder="123 456 789 00012" />
              </div>
              <div className="space-y-1">
                <Label>N° TVA intra.</Label>
                <Input value={form.vat_number} onChange={e => set('vat_number', e.target.value)} placeholder="FR12345678901" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3 pt-4 px-4"><CardTitle className="text-base">Coordonnées</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <div className="space-y-1">
              <Label>Adresse</Label>
              <Textarea value={form.address} onChange={e => set('address', e.target.value)} rows={2} placeholder="12 rue des Artisans, 75001 Paris" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Téléphone</Label>
                <Input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="06 12 34 56 78" />
              </div>
              <div className="space-y-1">
                <Label>Email pro</Label>
                <Input value={form.email} onChange={e => set('email', e.target.value)} type="email" placeholder="contact@entreprise.fr" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Site web (optionnel)</Label>
              <Input value={form.website} onChange={e => set('website', e.target.value)} placeholder="www.monentreprise.fr" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3 pt-4 px-4"><CardTitle className="text-base">Assurances</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <div className="space-y-1">
              <Label>Assurance décennale (n° contrat / assureur)</Label>
              <Input value={form.insurance_decennale} onChange={e => set('insurance_decennale', e.target.value)} placeholder="AXA — Contrat n°123456" />
            </div>
            <div className="space-y-1">
              <Label>RC Professionnelle</Label>
              <Input value={form.insurance_rc} onChange={e => set('insurance_rc', e.target.value)} placeholder="Allianz — Contrat n°789012" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3 pt-4 px-4"><CardTitle className="text-base">Facturation</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <div className="space-y-1">
              <Label>IBAN (affiché sur les factures)</Label>
              <Input value={form.iban} onChange={e => set('iban', e.target.value)} placeholder="FR76 1234 5678 9012 3456 7890 123" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Validité devis (jours)</Label>
                <Input type="number" value={form.quote_validity_days} onChange={e => set('quote_validity_days', e.target.value)} min="1" />
              </div>
              <div className="space-y-1">
                <Label>Acompte par défaut (%)</Label>
                <Input type="number" value={form.default_deposit_percent} onChange={e => set('default_deposit_percent', e.target.value)} min="0" max="100" />
              </div>
              <div className="space-y-1">
                <Label>TVA par défaut (%)</Label>
                <select value={form.default_vat_rate} onChange={e => set('default_vat_rate', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white">
                  <option value="5.5">5,5%</option>
                  <option value="10">10%</option>
                  <option value="20">20%</option>
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Conditions de paiement</Label>
              <Input value={form.payment_terms} onChange={e => set('payment_terms', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Mentions légales (affichées sur les documents)</Label>
              <Textarea value={form.legal_mentions} onChange={e => set('legal_mentions', e.target.value)} rows={3} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3 pt-4 px-4">
            <CardTitle className="text-base flex items-center gap-2"><Star className="w-4 h-4 text-amber-500" /> Avis clients (Google)</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-4">
            <p className="text-sm text-gray-500">
              Récupérez le lien « laisser un avis » de votre fiche Google — une seule fois. Ensuite, la page <span className="font-medium text-marine">Avis clients</span> le proposera à vos clients en un clic à chaque chantier terminé.
            </p>

            {/* Étape 1 */}
            <div className="flex gap-3">
              <span className="grid place-items-center w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex-shrink-0">1</span>
              <div className="flex-1 space-y-2">
                <p className="text-sm text-marine font-medium">Ouvrez votre fiche sur Google</p>
                <a href={googleBusinessUrl} target="_blank" rel="noopener noreferrer" className="inline-flex">
                  <Button type="button" variant="outline" className="gap-2">
                    <Search className="w-4 h-4" /> Rechercher « mon entreprise »
                    <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
                  </Button>
                </a>
                <p className="text-xs text-gray-400">
                  Connecté à votre compte Google, les fiches d&apos;établissement que vous gérez s&apos;affichent directement.
                </p>
              </div>
            </div>

            {/* Étape 2 */}
            <div className="flex gap-3">
              <span className="grid place-items-center w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex-shrink-0">2</span>
              <div className="flex-1">
                <p className="text-sm text-marine font-medium">Cliquez sur « Demandez des avis »</p>
                <p className="text-xs text-gray-400 mt-0.5">Sur votre fiche (bouton « Demandez des avis » ou « Obtenir plus d&apos;avis »), Google affiche un lien court à partager (il commence par <span className="font-mono">g.page/r/…</span>).</p>
              </div>
            </div>

            {/* Étape 3 */}
            <div className="flex gap-3">
              <span className="grid place-items-center w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex-shrink-0">3</span>
              <div className="flex-1 space-y-1.5">
                <p className="text-sm text-marine font-medium">Collez le lien ici</p>
                <Input value={form.google_review_url} onChange={e => set('google_review_url', e.target.value)} placeholder="https://g.page/r/XXXXXXXX/review" />
                {form.google_review_url.trim() && (
                  <p className="text-xs text-emerald-600 flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Lien enregistré au prochain « Sauvegarder ».</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Button type="submit" className="w-full h-12 text-base" disabled={loading}>
          {loading ? 'Sauvegarde...' : 'Sauvegarder'}
        </Button>
      </form>
    </div>
  )
}
