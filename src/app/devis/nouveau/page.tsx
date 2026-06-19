'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { ArrowLeft, Plus, Trash2, Search, GripVertical, ChevronDown, ChevronUp } from 'lucide-react'
import Link from 'next/link'
import { formatCurrency } from '@/lib/utils'
import type { Client, PriceItem, QuoteLine } from '@/types'

type LineItem = Omit<QuoteLine, 'id' | 'quote_id' | 'created_at'> & { tempId: string }

function DevisForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const preselectedClient = searchParams.get('client')

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [clients, setClients] = useState<Client[]>([])
  const [priceItems, setPriceItems] = useState<PriceItem[]>([])
  const [selectedClientId, setSelectedClientId] = useState(preselectedClient || '')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [siteAddress, setSiteAddress] = useState('')
  const [depositPercent, setDepositPercent] = useState('')
  const [validDays, setValidDays] = useState('30')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<LineItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [showDepot, setShowDepot] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    Promise.all([
      supabase.from('clients').select('*').order('created_at', { ascending: false }),
      supabase.from('price_items').select('*, price_categories(name)').eq('is_active', true).order('name'),
    ]).then(([{ data: c }, { data: p }]) => {
      setClients(c || [])
      setPriceItems(p || [])
    })
  }, [])

  // Pré-remplir adresse depuis client
  useEffect(() => {
    if (!selectedClientId) return
    const client = clients.find(c => c.id === selectedClientId)
    if (client?.site_address && !siteAddress) setSiteAddress(client.site_address)
  }, [selectedClientId, clients, siteAddress])

  const filteredItems = priceItems.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.price_categories as any)?.name?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  function addLine(item?: PriceItem) {
    const newLine: LineItem = {
      tempId: crypto.randomUUID(),
      price_item_id: item?.id,
      category: (item?.price_categories as any)?.name || '',
      designation: item?.name || '',
      description: item?.description || '',
      quantity: 1,
      unit: item?.unit || 'u',
      unit_price_ht: item?.unit_price_ht || 0,
      vat_rate: item?.vat_rate || 10,
      discount_percent: 0,
      total_ht: item?.unit_price_ht || 0,
      sort_order: lines.length,
      needs_verification: false,
    }
    setLines(prev => [...prev, newLine])
    setShowSearch(false)
    setSearchQuery('')
  }

  function updateLine(tempId: string, field: string, value: string | number) {
    setLines(prev => prev.map(l => {
      if (l.tempId !== tempId) return l
      const updated = { ...l, [field]: value }
      updated.total_ht = updated.quantity * updated.unit_price_ht * (1 - updated.discount_percent / 100)
      return updated
    }))
  }

  function removeLine(tempId: string) {
    setLines(prev => prev.filter(l => l.tempId !== tempId))
  }

  const subtotalHT = lines.reduce((s, l) => s + l.total_ht, 0)
  const totalVAT = lines.reduce((s, l) => s + l.total_ht * l.vat_rate / 100, 0)
  const totalTTC = subtotalHT + totalVAT
  const depositAmount = depositPercent ? totalTTC * parseFloat(depositPercent) / 100 : 0

  async function handleSave(status: 'brouillon' | 'pret') {
    if (!selectedClientId) { toast.error('Choisissez un client'); return }
    if (!lines.length) { toast.error('Ajoutez au moins une prestation'); return }

    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Numéro de devis
    const { count } = await supabase.from('quotes').select('*', { count: 'exact', head: true }).eq('user_id', user.id)
    const quoteNumber = `DEV-${new Date().getFullYear()}-${String((count || 0) + 1).padStart(3, '0')}`
    const validUntil = new Date()
    validUntil.setDate(validUntil.getDate() + parseInt(validDays || '30'))

    const { data: quote, error } = await supabase.from('quotes').insert({
      user_id: user.id,
      client_id: selectedClientId,
      quote_number: quoteNumber,
      title,
      description,
      status,
      valid_until: validUntil.toISOString().split('T')[0],
      subtotal_ht: subtotalHT,
      total_vat: totalVAT,
      total_ttc: totalTTC,
      deposit_percent: depositPercent ? parseFloat(depositPercent) : null,
      deposit_amount: depositAmount || null,
      notes,
      internal_notes: '',
      legal_mentions: 'TVA à taux réduit — Article 279-0 bis du CGI (travaux de rénovation)',
    }).select().single()

    if (error || !quote) { toast.error('Erreur création devis'); setSaving(false); return }

    await supabase.from('quote_lines').insert(
      lines.map((l, i) => ({
        quote_id: quote.id,
        price_item_id: l.price_item_id || null,
        category: l.category,
        designation: l.designation,
        description: l.description,
        quantity: l.quantity,
        unit: l.unit,
        unit_price_ht: l.unit_price_ht,
        vat_rate: l.vat_rate,
        discount_percent: l.discount_percent,
        total_ht: l.total_ht,
        sort_order: i,
      }))
    )

    toast.success('Devis créé !')
    router.push(`/devis/${quote.id}`)
  }

  const unitLabels: Record<string, string> = {
    m2: 'm²', ml: 'ml', u: 'unité', forfait: 'forfait', h: 'heure', j: 'jour', piece: 'pièce'
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/devis">
          <Button variant="ghost" size="sm" className="gap-1">
            <ArrowLeft className="w-4 h-4" /> Retour
          </Button>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Nouveau devis</h1>
      </div>

      {/* Client */}
      <Card>
        <CardHeader className="pb-3 pt-4 px-4">
          <CardTitle className="text-base">Client *</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <select
            value={selectedClientId}
            onChange={e => setSelectedClientId(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white"
          >
            <option value="">Sélectionner un client...</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>
                {c.type === 'professionnel'
                  ? c.company_name
                  : `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Sans nom'}
              </option>
            ))}
          </select>
          <Link href="/clients/nouveau" className="text-sm text-blue-600 hover:underline">
            + Créer un nouveau client
          </Link>
        </CardContent>
      </Card>

      {/* Projet */}
      <Card>
        <CardHeader className="pb-3 pt-4 px-4">
          <CardTitle className="text-base">Projet</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <div className="space-y-1">
            <Label>Objet du devis</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Rénovation salle de bain" />
          </div>
          <div className="space-y-1">
            <Label>Adresse du chantier</Label>
            <Textarea value={siteAddress} onChange={e => setSiteAddress(e.target.value)} rows={2} placeholder="Adresse des travaux" />
          </div>
          <div className="space-y-1">
            <Label>Description générale (optionnel)</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Décrivez brièvement les travaux..." />
          </div>
        </CardContent>
      </Card>

      {/* Lignes de devis */}
      <Card>
        <CardHeader className="pb-3 pt-4 px-4 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Prestations</CardTitle>
          <span className="text-sm text-gray-400">{lines.length} ligne{lines.length > 1 ? 's' : ''}</span>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-2">
          {lines.map((line) => (
            <div key={line.tempId} className="border border-gray-200 rounded-lg p-3 space-y-2">
              <div className="flex items-start gap-2">
                <GripVertical className="w-4 h-4 text-gray-300 mt-2 flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <Input
                    value={line.designation}
                    onChange={e => updateLine(line.tempId, 'designation', e.target.value)}
                    placeholder="Désignation"
                    className="font-medium"
                  />
                  <Input
                    value={line.description || ''}
                    onChange={e => updateLine(line.tempId, 'description', e.target.value)}
                    placeholder="Description (optionnel)"
                    className="text-sm text-gray-500"
                  />
                  <div className="grid grid-cols-4 gap-2">
                    <div>
                      <Label className="text-xs text-gray-500">Qté</Label>
                      <Input
                        type="number"
                        value={line.quantity}
                        onChange={e => updateLine(line.tempId, 'quantity', parseFloat(e.target.value) || 0)}
                        className="h-8 text-sm"
                        min="0"
                        step="0.1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">Unité</Label>
                      <select
                        value={line.unit}
                        onChange={e => updateLine(line.tempId, 'unit', e.target.value)}
                        className="w-full h-8 border border-gray-200 rounded-md px-2 text-sm bg-white"
                      >
                        {Object.entries(unitLabels).map(([v, l]) => (
                          <option key={v} value={v}>{l}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">Prix HT</Label>
                      <Input
                        type="number"
                        value={line.unit_price_ht}
                        onChange={e => updateLine(line.tempId, 'unit_price_ht', parseFloat(e.target.value) || 0)}
                        className="h-8 text-sm"
                        min="0"
                        step="0.01"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">TVA %</Label>
                      <select
                        value={line.vat_rate}
                        onChange={e => updateLine(line.tempId, 'vat_rate', parseFloat(e.target.value))}
                        className="w-full h-8 border border-gray-200 rounded-md px-2 text-sm bg-white"
                      >
                        <option value={5.5}>5.5%</option>
                        <option value={10}>10%</option>
                        <option value={20}>20%</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <button onClick={() => removeLine(line.tempId)} className="text-gray-300 hover:text-red-500 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <span className="text-sm font-semibold text-gray-900 mt-1">
                    {formatCurrency(line.total_ht)}
                  </span>
                  <span className="text-xs text-gray-400">HT</span>
                </div>
              </div>
            </div>
          ))}

          {/* Recherche prestations */}
          {showSearch ? (
            <div className="border border-blue-300 rounded-lg p-3 space-y-2">
              <Input
                autoFocus
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Rechercher une prestation..."
                className="h-9"
              />
              <div className="max-h-48 overflow-y-auto space-y-1">
                {filteredItems.slice(0, 20).map(item => (
                  <button
                    key={item.id}
                    onClick={() => addLine(item)}
                    className="w-full flex items-center justify-between px-3 py-2 hover:bg-blue-50 rounded text-left text-sm transition-colors"
                  >
                    <div>
                      <span className="font-medium text-gray-900">{item.name}</span>
                      <span className="text-xs text-gray-400 ml-2">{(item.price_categories as any)?.name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-500">
                      <span className="text-xs">{unitLabels[item.unit] || item.unit}</span>
                      <span className="font-semibold text-gray-900">{formatCurrency(item.unit_price_ht)}</span>
                    </div>
                  </button>
                ))}
                {filteredItems.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-2">Aucun résultat</p>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { setShowSearch(false); setSearchQuery('') }}>
                  Annuler
                </Button>
                <Button variant="outline" size="sm" onClick={() => addLine()}>
                  + Ligne libre
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 gap-2 border-dashed"
                onClick={() => setShowSearch(true)}
              >
                <Search className="w-4 h-4" />
                Ajouter depuis mes prix
              </Button>
              <Button
                variant="outline"
                className="gap-2 border-dashed"
                onClick={() => addLine()}
              >
                <Plus className="w-4 h-4" />
                Ligne libre
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Totaux */}
      {lines.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Total HT</span>
                <span className="font-semibold">{formatCurrency(subtotalHT)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">TVA</span>
                <span>{formatCurrency(totalVAT)}</span>
              </div>
              <div className="flex justify-between text-base font-bold border-t border-gray-200 pt-2 mt-2">
                <span>Total TTC</span>
                <span>{formatCurrency(totalTTC)}</span>
              </div>
              {depositAmount > 0 && (
                <div className="flex justify-between text-blue-600">
                  <span>Acompte ({depositPercent}%)</span>
                  <span className="font-semibold">{formatCurrency(depositAmount)}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Options */}
      <Card>
        <CardHeader
          className="pb-3 pt-4 px-4 cursor-pointer flex flex-row items-center justify-between"
          onClick={() => setShowDepot(!showDepot)}
        >
          <CardTitle className="text-base">Options (acompte, validité, notes)</CardTitle>
          {showDepot ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </CardHeader>
        {showDepot && (
          <CardContent className="px-4 pb-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Acompte (%)</Label>
                <Input
                  type="number"
                  value={depositPercent}
                  onChange={e => setDepositPercent(e.target.value)}
                  placeholder="ex: 30"
                  min="0"
                  max="100"
                />
              </div>
              <div className="space-y-1">
                <Label>Validité (jours)</Label>
                <Input
                  type="number"
                  value={validDays}
                  onChange={e => setValidDays(e.target.value)}
                  min="1"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Notes (visibles sur le devis)</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Conditions particulières, précisions..." />
            </div>
          </CardContent>
        )}
      </Card>

      {/* Actions */}
      <div className="flex gap-3 pb-6">
        <Button
          variant="outline"
          className="flex-1 h-12"
          onClick={() => handleSave('brouillon')}
          disabled={saving}
        >
          Enregistrer brouillon
        </Button>
        <Button
          className="flex-1 h-12 text-base"
          onClick={() => handleSave('pret')}
          disabled={saving}
        >
          {saving ? 'Création...' : 'Créer le devis'}
        </Button>
      </div>
    </div>
  )
}

export default function NouveauDevisPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">Chargement...</div>}>
      <DevisForm />
    </Suspense>
  )
}
