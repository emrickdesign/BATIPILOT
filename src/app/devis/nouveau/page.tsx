'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { FormSection, FormPageTitle } from '@/components/ui/form-section'
import { entityColors } from '@/lib/entityColors'
import { toast } from 'sonner'
import { ArrowLeft, Plus, Trash2, Search, ChevronDown, ChevronUp, User, HardHat, Receipt, ListChecks, Settings2, Sparkles, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { formatCurrency } from '@/lib/utils'
import DictationButton from '@/components/DictationButton'
import ClientCombobox from '@/components/ClientCombobox'
import { isProspect, clientDisplayName } from '@/lib/clients'
import { getTemplateConfig } from '@/lib/pdf-templates'
import type { Client, PriceItem, QuoteLine } from '@/types'

type LineItem = Omit<QuoteLine, 'id' | 'quote_id' | 'created_at'> & { tempId: string }

// Cellule éditable « dans le document » (sans bordure, surlignée au focus).
const DOC_CELL = 'w-full bg-transparent outline-none rounded px-1 py-1 focus:bg-[#FDF3EF] focus:ring-1 focus:ring-[#E0674C]/40'

function DevisForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const preselectedClient = searchParams.get('client')
  const preselectedProject = searchParams.get('project')
  const editId = searchParams.get('edit')
  const [projectInfo, setProjectInfo] = useState<{ title: string; address: string | null } | null>(null)

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [clients, setClients] = useState<Client[]>([])
  const [priceItems, setPriceItems] = useState<PriceItem[]>([])
  const [projects, setProjects] = useState<{ id: string; title: string; client_id: string | null }[]>([])
  const [selectedClientId, setSelectedClientId] = useState(preselectedClient || '')
  const [selectedProjectId, setSelectedProjectId] = useState(preselectedProject || '')
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
  // Générateur IA de lignes depuis une description libre (texte ou vocal).
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [showAi, setShowAi] = useState(false)
  // Réglages entreprise réinjectés dans le devis (TVA, validité, acompte, mentions).
  const [companyDefaults, setCompanyDefaults] = useState<{
    default_vat_rate: number; legal_mentions: string | null
  }>({ default_vat_rate: 10, legal_mentions: null })
  // En-tête + design du modèle choisi (pour le rendu « document » du devis).
  const [company, setCompany] = useState<Record<string, any> | null>(null)
  // Édition d'un devis existant (?edit=<id>) : date d'ancrage = date de création,
  // pour que la validité ne « glisse » pas à chaque enregistrement.
  const [editAnchor, setEditAnchor] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    Promise.all([
      supabase.from('clients').select('*').order('created_at', { ascending: false }),
      supabase.from('price_items').select('*, price_categories(name)').eq('is_active', true).order('name'),
      supabase.from('projects').select('id, title, client_id, status').neq('status', 'archive').order('created_at', { ascending: false }),
      supabase.from('companies').select('trade_name, address, phone, siret, quote_validity_days, default_deposit_percent, default_vat_rate, legal_mentions, template_style').maybeSingle(),
    ]).then(([{ data: c }, { data: p }, { data: pr }, { data: co }]) => {
      setClients(c || [])
      setPriceItems(p || [])
      setProjects(pr || [])
      setCompany(co || null)
      if (co) {
        setCompanyDefaults({
          default_vat_rate: Number(co.default_vat_rate) || 10,
          legal_mentions: co.legal_mentions ?? null,
        })
        // En édition, on garde les valeurs du devis existant (chargées plus bas), pas les défauts.
        if (!editId && co.quote_validity_days) setValidDays(String(co.quote_validity_days))
        if (!editId && co.default_deposit_percent != null) setDepositPercent(String(co.default_deposit_percent))
      }
    })
  }, [])

  // Édition : charge le devis existant et pré-remplit tout le formulaire.
  useEffect(() => {
    if (!editId) return
    const supabase = createClient()
    Promise.all([
      supabase.from('quotes').select('*').eq('id', editId).single(),
      supabase.from('quote_lines').select('*').eq('quote_id', editId).order('sort_order'),
    ]).then(([{ data: q }, { data: ql }]) => {
      if (!q) { toast.error('Devis introuvable'); return }
      setSelectedClientId(q.client_id || '')
      setSelectedProjectId(q.project_id || '')
      setTitle(q.title || '')
      setDescription(q.description || '')
      setDepositPercent(q.deposit_percent != null ? String(q.deposit_percent) : '')
      setNotes(q.notes || '')
      // Ancre la validité sur la date de création : durée = valid_until − created_at.
      const created = (q.created_at || '').split('T')[0] || null
      setEditAnchor(created)
      if (q.valid_until && created) {
        const days = Math.round((new Date(q.valid_until).getTime() - new Date(created).getTime()) / 86400000)
        if (days > 0) setValidDays(String(days))
      }
      if (Array.isArray(ql)) {
        setLines(ql.map((l, i) => ({
          tempId: `edit-${i}`,
          price_item_id: l.price_item_id,
          category: l.category,
          designation: l.designation,
          description: l.description,
          quantity: l.quantity,
          unit: l.unit,
          unit_price_ht: l.unit_price_ht,
          vat_rate: l.vat_rate,
          discount_percent: l.discount_percent,
          total_ht: l.total_ht,
          sort_order: l.sort_order,
          is_option: l.is_option,
        }) as LineItem))
      }
    })
  }, [editId])

  // Pré-remplir adresse depuis client
  useEffect(() => {
    if (!selectedClientId) return
    const client = clients.find(c => c.id === selectedClientId)
    if (client?.site_address && !siteAddress) setSiteAddress(client.site_address)
  }, [selectedClientId, clients, siteAddress])

  // Pré-remplir depuis le chantier rattaché
  useEffect(() => {
    if (!preselectedProject) return
    const supabase = createClient()
    supabase.from('projects').select('title, address').eq('id', preselectedProject).single()
      .then(({ data }) => {
        if (!data) return
        setProjectInfo({ title: data.title, address: data.address })
        setTitle(prev => prev || data.title || '')
        if (data.address) setSiteAddress(prev => prev || data.address)
      })
  }, [preselectedProject])

  // Pré-remplir depuis l'analyse de plan (sessionStorage)
  useEffect(() => {
    if (searchParams.get('from') !== 'plan') return
    try {
      const raw = sessionStorage.getItem('devis_prefill')
      if (!raw) return
      const data = JSON.parse(raw)
      if (data.title) setTitle(data.title)
      if (Array.isArray(data.lines)) {
        setLines(data.lines.map((l: any, i: number) => {
          const qty = Number(l.quantity) || 1
          const pu = Number(l.unit_price_ht) || 0
          const discount = 0
          return {
            tempId: crypto.randomUUID(),
            price_item_id: undefined,
            category: l.category || '',
            designation: l.designation || '',
            description: l.description || '',
            quantity: qty,
            unit: l.unit || 'u',
            unit_price_ht: pu,
            vat_rate: l.vat_rate || 10,
            discount_percent: discount,
            total_ht: qty * pu,
            sort_order: i,
            needs_verification: false,
          }
        }))
      }
      sessionStorage.removeItem('devis_prefill')
      toast.success('Lignes importées depuis l\'analyse de plan')
    } catch { /* ignore */ }
  }, [searchParams])

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
      vat_rate: item?.vat_rate ?? companyDefaults.default_vat_rate,
      discount_percent: 0,
      total_ht: item?.unit_price_ht || 0,
      sort_order: lines.length,
      needs_verification: false,
      is_option: false,
    }
    setLines(prev => [...prev, newLine])
    setShowSearch(false)
    setSearchQuery('')
  }

  function updateLine(tempId: string, field: string, value: string | number | boolean) {
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

  async function generateLines() {
    const description = aiPrompt.trim()
    if (description.length < 8) { toast.error('Décrivez les travaux en quelques mots'); return }
    setAiLoading(true)
    try {
      const res = await fetch('/api/devis/generer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, vat_default: companyDefaults.default_vat_rate }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json?.error || 'Génération impossible'); return }
      const generated: LineItem[] = (json.lignes || []).map((l: {
        category?: string; designation?: string; description?: string
        quantity?: number; unit?: string; unit_price_ht?: number; vat_rate?: number
      }, i: number) => {
        const qty = Number(l.quantity) || 1
        const pu = Number(l.unit_price_ht) || 0
        return {
          tempId: crypto.randomUUID(),
          price_item_id: undefined,
          category: l.category || '',
          designation: l.designation || '',
          description: l.description || '',
          quantity: qty,
          unit: (l.unit as LineItem['unit']) || 'u',
          unit_price_ht: pu,
          vat_rate: l.vat_rate || companyDefaults.default_vat_rate,
          discount_percent: 0,
          total_ht: qty * pu,
          sort_order: lines.length + i,
          needs_verification: true,   // issu de l'IA : à vérifier par l'artisan
          is_option: false,
        }
      })
      if (!generated.length) { toast.error('Aucune prestation générée — précisez la demande'); return }
      setLines(prev => [...prev, ...generated])
      if (!title && json.title) setTitle(json.title)
      setAiPrompt('')
      setShowAi(false)
      toast.success(`${generated.length} ligne${generated.length > 1 ? 's' : ''} générée${generated.length > 1 ? 's' : ''} — à vérifier`)
    } catch {
      toast.error('Erreur réseau — réessayez')
    } finally {
      setAiLoading(false)
    }
  }

  // Les lignes « option » sont proposées mais exclues du total du devis.
  const baseLines = lines.filter(l => !l.is_option)
  const optionLines = lines.filter(l => l.is_option)
  const subtotalHT = baseLines.reduce((s, l) => s + l.total_ht, 0)
  const totalVAT = baseLines.reduce((s, l) => s + l.total_ht * l.vat_rate / 100, 0)
  const totalTTC = subtotalHT + totalVAT
  const optionsHT = optionLines.reduce((s, l) => s + l.total_ht, 0)
  const depositAmount = depositPercent ? totalTTC * parseFloat(depositPercent) / 100 : 0

  // Rendu « document » : design du modèle + en-tête entreprise/client/dates.
  const tpl = getTemplateConfig(company || {})
  const serif = tpl.fontFamily === 'serif'
  const selectedClient = clients.find(c => c.id === selectedClientId) || null
  const docToday = new Date()
  const docValidUntil = new Date(); docValidUntil.setDate(docValidUntil.getDate() + (parseInt(validDays) || 30))
  const dFr = (d: Date) => d.toLocaleDateString('fr-FR')

  async function handleSave(status: 'brouillon' | 'pret') {
    if (!selectedClientId) { toast.error('Choisissez un client'); return }
    if (!lines.length) { toast.error('Ajoutez au moins une prestation'); return }

    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Date de validité : en édition, ancrée sur la date de création ; sinon à partir d'aujourd'hui.
    const vdNum = parseInt(validDays || '30') || 30
    const validUntil = new Date(editId && editAnchor ? editAnchor : Date.now())
    validUntil.setDate(validUntil.getDate() + vdNum)

    const linePayload = (quoteId: string) => lines.map((l, i) => ({
      quote_id: quoteId,
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
      is_option: l.is_option || false,
    }))

    const quoteFields = {
      client_id: selectedClientId,
      project_id: selectedProjectId || null,
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
    }

    // La durée saisie devient le défaut de l'utilisateur (pré-rempli sur les prochains devis).
    await supabase.from('companies').update({ quote_validity_days: vdNum }).eq('user_id', user.id)

    if (editId) {
      // --- Mode édition : met à jour le devis + remplace ses lignes ---
      const { error } = await supabase.from('quotes').update(quoteFields).eq('id', editId)
      if (error) { toast.error('Erreur modification devis'); setSaving(false); return }
      await supabase.from('quote_lines').delete().eq('quote_id', editId)
      await supabase.from('quote_lines').insert(linePayload(editId))
      toast.success('Devis modifié !')
      router.push(`/devis/${editId}`)
      return
    }

    // --- Mode création ---
    const { count } = await supabase.from('quotes').select('*', { count: 'exact', head: true }).eq('user_id', user.id)
    const quoteNumber = `DEV-${new Date().getFullYear()}-${String((count || 0) + 1).padStart(3, '0')}`

    const { data: quote, error } = await supabase.from('quotes').insert({
      user_id: user.id,
      quote_number: quoteNumber,
      ...quoteFields,
      internal_notes: '',
      legal_mentions: companyDefaults.legal_mentions || 'TVA à taux réduit — Article 279-0 bis du CGI (travaux de rénovation)',
    }).select().single()

    if (error || !quote) { toast.error('Erreur création devis'); setSaving(false); return }

    await supabase.from('quote_lines').insert(linePayload(quote.id))

    // Fait avancer le prospect dans le pipeline : nouveau/infos → « Devis à faire »
    await supabase.from('clients').update({ status: 'devis_a_faire' })
      .eq('id', selectedClientId).in('status', ['nouveau', 'infos_a_recuperer'])

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
      </div>
      <FormPageTitle icon={Receipt} color={entityColors.devis} title={editId ? 'Modifier le devis' : 'Nouveau devis'} />

      {/* Client ou prospect */}
      <FormSection icon={User} color={entityColors.devis} title="Client ou prospect *">
        <div className="space-y-3">
          <ClientCombobox
            options={clients
              .map(c => ({
                id: c.id,
                label: (c.type === 'professionnel' ? c.company_name : `${c.first_name || ''} ${c.last_name || ''}`.trim()) || 'Sans nom',
                group: isProspect(c.status) ? 'Prospect' : 'Client',
              }))
              .sort((a, b) => (a.group === b.group ? a.label.localeCompare(b.label) : a.group === 'Prospect' ? -1 : 1))}
            value={selectedClientId}
            onChange={setSelectedClientId}
            placeholder="Rechercher un client ou prospect…"
            allowNone={false}
          />
          <Link href="/clients/nouveau" className="text-sm text-blue-600 hover:underline">
            + Créer un nouveau client / prospect
          </Link>
        </div>
      </FormSection>

      {/* Projet */}
      <FormSection icon={HardHat} color={entityColors.devis} title="Projet">
        <div className="space-y-3">
          {projectInfo ? (
            <div className="flex items-center gap-2 rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 text-sm text-blue-700">
              <HardHat className="w-4 h-4 flex-shrink-0" />
              <span>Devis rattaché au chantier <strong>{projectInfo.title}</strong></span>
            </div>
          ) : (
            <div className="space-y-1">
              <Label>Chantier</Label>
              <select
                value={selectedProjectId}
                onChange={e => setSelectedProjectId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white"
              >
                <option value="">— Nouveau chantier —</option>
                {projects
                  .filter(p => !selectedClientId || p.client_id === selectedClientId)
                  .map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
              <p className="text-[11px] text-gray-400">Rattachez un chantier existant, ou laissez « Nouveau chantier » (créé à l&apos;acceptation). Repère interne, non affiché sur le devis.</p>
            </div>
          )}
          <div className="space-y-1">
            <Label>Objet du devis</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Rénovation salle de bain" />
            <p className="text-[11px] text-gray-400">Affiché sur le devis, en tête.</p>
          </div>
          <div className="space-y-1">
            <Label>Durée de validité du devis</Label>
            <div className="flex items-center gap-2 flex-wrap">
              <Input type="number" value={validDays} onChange={e => setValidDays(e.target.value)} min="1" className="w-24" />
              <span className="text-sm text-gray-500">jours — valable jusqu&apos;au <strong className="text-gray-700">{new Date((editId && editAnchor ? new Date(editAnchor).getTime() : Date.now()) + (parseInt(validDays || '30') || 30) * 86400000).toLocaleDateString('fr-FR')}</strong></span>
            </div>
            <p className="text-[11px] text-gray-400">Modifiable ici. Mémorisée comme votre défaut pour les prochains devis.</p>
          </div>
          <div className="space-y-1">
            <Label>Adresse du chantier</Label>
            <Textarea value={siteAddress} onChange={e => setSiteAddress(e.target.value)} rows={2} placeholder="Adresse des travaux" />
          </div>
          <div className="space-y-1">
            <Label>Description générale (optionnel)</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Décrivez brièvement les travaux..." />
          </div>
        </div>
      </FormSection>

      {/* Lignes de devis */}
      <FormSection
        icon={ListChecks}
        color={entityColors.devis}
        title="Prestations"
        description={`${lines.length} ligne${lines.length > 1 ? 's' : ''}`}
      >
        <div className="space-y-2" style={{ fontFamily: serif ? 'Georgia, "Times New Roman", serif' : undefined }}>
          {/* En-tête « document » : rendu réel au design du modèle choisi */}
          <div className="rounded-lg border border-gray-100 bg-white p-3 sm:p-4 mb-1">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 text-[13px] leading-tight">
                <p className="font-heading text-base font-extrabold text-marine">{company?.trade_name || 'Votre entreprise'}</p>
                {company?.address && <p className="text-gray-500">{company.address}</p>}
                {company?.phone && <p className="text-gray-500">{company.phone}</p>}
                {company?.siret && <p className="text-[11px] text-gray-400">SIRET : {company.siret}</p>}
              </div>
              <p className="flex-none font-heading text-xl font-extrabold tracking-tight" style={{ color: tpl.primaryColor }}>DEVIS</p>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-4 border-t border-gray-100 pt-3 text-[13px]">
              <div>
                <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Adressé à</p>
                {selectedClient ? (
                  <>
                    <p className="font-semibold text-marine truncate">{clientDisplayName(selectedClient)}</p>
                    {selectedClient.billing_address && <p className="text-gray-500 truncate">{selectedClient.billing_address}</p>}
                    {selectedClient.email && <p className="text-gray-500 truncate">{selectedClient.email}</p>}
                  </>
                ) : <p className="italic text-gray-300">Choisis un client ci-dessus</p>}
              </div>
              <div className="text-right text-gray-600">
                <p>Date : <span className="font-medium text-marine">{dFr(docToday)}</span></p>
                <p>Valable jusqu’au : <span className="font-medium text-marine">{dFr(docValidUntil)}</span></p>
              </div>
            </div>
            {title && <p className="mt-2 border-t border-gray-100 pt-2 text-[13px]"><span className="text-gray-400">Objet : </span><span className="font-medium text-marine">{title}</span></p>}
          </div>

          {/* Générateur IA : décris le chantier → lignes chiffrées sur ta base de prix */}
          {showAi ? (
            <div className="border border-[#D05C43]/40 bg-[#D05C43]/5 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-marine">
                <Sparkles className="w-4 h-4 text-[#D05C43]" />
                Décrivez le chantier — l’IA chiffre sur votre base de prix
              </div>
              <Textarea
                value={aiPrompt}
                onChange={e => setAiPrompt(e.target.value)}
                rows={3}
                placeholder="Ex : rénovation d'une salle de bain de 6 m², dépose de l'ancien carrelage, faïence murale toute hauteur, pose d'un receveur et d'un meuble vasque, peinture du plafond."
                disabled={aiLoading}
              />
              <div className="flex items-center gap-2">
                <Button onClick={generateLines} disabled={aiLoading} className="gap-1.5">
                  {aiLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Génération…</> : <><Sparkles className="w-4 h-4" /> Générer les lignes</>}
                </Button>
                <DictationButton value={aiPrompt} onChange={setAiPrompt} size="sm" title="Dicter la demande" />
                <Button variant="ghost" size="sm" onClick={() => { setShowAi(false); setAiPrompt('') }} disabled={aiLoading}>
                  Annuler
                </Button>
              </div>
              <p className="text-xs text-slate-500">Les lignes générées sont marquées « à vérifier » : contrôlez quantités et prix avant d’envoyer.</p>
            </div>
          ) : (
            <Button
              variant="outline"
              className="w-full gap-2 border-dashed border-[#D05C43]/50 text-[#D05C43] hover:bg-[#D05C43]/5"
              onClick={() => setShowAi(true)}
            >
              <Sparkles className="w-4 h-4" />
              Générer le devis avec l’IA (texte ou vocal)
            </Button>
          )}

          {/* Table du document — éditable en place, au design du modèle choisi */}
          {lines.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-[13px]">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide" style={{ backgroundColor: tpl.tableHeaderBg, color: tpl.tableHeaderTextColor }}>
                    <th className="py-1.5 pl-2 pr-2 text-left font-semibold">Désignation</th>
                    <th className="w-14 px-1 py-1.5 text-right font-semibold">Qté</th>
                    <th className="w-16 px-1 py-1.5 text-center font-semibold">Unité</th>
                    <th className="w-24 px-1 py-1.5 text-right font-semibold">P.U. HT</th>
                    <th className="w-14 px-1 py-1.5 text-center font-semibold">TVA</th>
                    <th className="w-24 px-1 py-1.5 text-right font-semibold">Total HT</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, i) => (
                    <tr key={line.tempId}
                      className={`group border-b border-gray-100 align-top ${line.is_option ? 'bg-amber-50/50' : ''}`}
                      style={!line.is_option && tpl.stripeRows && i % 2 === 1 ? { backgroundColor: tpl.secondaryBg } : undefined}>
                      <td className="py-1.5 pr-2">
                        <input value={line.designation} onChange={e => updateLine(line.tempId, 'designation', e.target.value)}
                          placeholder="Prestation…" className={`${DOC_CELL} font-medium text-marine`} />
                        <input value={line.description || ''} onChange={e => updateLine(line.tempId, 'description', e.target.value)}
                          placeholder="détail (optionnel)" className={`${DOC_CELL} text-[11px] text-gray-400`} />
                        {line.is_option && <span className="ml-1 text-[10px] font-medium text-amber-600">Option — hors total</span>}
                      </td>
                      <td className="px-0.5 py-1.5"><input type="number" min={0} step={0.1} value={line.quantity}
                        onChange={e => updateLine(line.tempId, 'quantity', parseFloat(e.target.value) || 0)} className={`${DOC_CELL} text-right tabular-nums`} /></td>
                      <td className="px-0.5 py-1.5"><select value={line.unit} onChange={e => updateLine(line.tempId, 'unit', e.target.value)} className={`${DOC_CELL} cursor-pointer text-center`}>
                        {Object.entries(unitLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select></td>
                      <td className="px-0.5 py-1.5"><input type="number" min={0} step={0.01} value={line.unit_price_ht}
                        onChange={e => updateLine(line.tempId, 'unit_price_ht', parseFloat(e.target.value) || 0)} className={`${DOC_CELL} text-right tabular-nums`} /></td>
                      <td className="px-0.5 py-1.5"><select value={line.vat_rate} onChange={e => updateLine(line.tempId, 'vat_rate', parseFloat(e.target.value))} className={`${DOC_CELL} cursor-pointer text-center`}>
                        <option value={5.5}>5,5%</option><option value={10}>10%</option><option value={20}>20%</option>
                      </select></td>
                      <td className="px-1 py-2 text-right font-semibold tabular-nums text-marine">{formatCurrency(line.total_ht)}</td>
                      <td className="py-2">
                        <div className="flex flex-col items-end gap-1">
                          <button onClick={() => removeLine(line.tempId)} title="Supprimer la ligne"
                            className="grid h-5 w-5 place-items-center rounded text-gray-300 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>
                          <button onClick={() => updateLine(line.tempId, 'is_option', !line.is_option)} title="Option : proposée au client, hors du total"
                            className={`text-[10px] px-1 rounded border ${line.is_option ? 'border-amber-400 bg-amber-100 text-amber-700' : 'border-gray-200 text-gray-400 opacity-0 group-hover:opacity-100'}`}>Opt</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

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
                <Button variant="destructive-outline" size="sm" onClick={() => { setShowSearch(false); setSearchQuery('') }}>
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
        </div>
      </FormSection>

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
              <div className="flex justify-between text-base font-bold text-white rounded px-3 py-1.5 mt-2" style={{ backgroundColor: tpl.primaryColor }}>
                <span>Total TTC</span>
                <span className="tabular-nums">{formatCurrency(totalTTC)}</span>
              </div>
              {depositAmount > 0 && (
                <div className="flex justify-between text-blue-600">
                  <span>Acompte ({depositPercent}%)</span>
                  <span className="font-semibold">{formatCurrency(depositAmount)}</span>
                </div>
              )}
              {optionsHT > 0 && (
                <div className="flex justify-between text-amber-600 border-t border-dashed border-amber-200 pt-2 mt-2">
                  <span>Options proposées (hors total) — {optionLines.length} ligne{optionLines.length > 1 ? 's' : ''}</span>
                  <span className="font-semibold">+ {formatCurrency(optionsHT)} HT</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Options */}
      <FormSection icon={Settings2} color={entityColors.devis} title="Options (acompte, validité, notes)">
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setShowDepot(!showDepot)}
            className="flex items-center justify-between w-full text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <span>{showDepot ? 'Masquer les options' : 'Afficher les options'}</span>
            {showDepot ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showDepot && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Acompte (%)</Label>
                <Input
                  type="number"
                  value={depositPercent}
                  onChange={e => setDepositPercent(e.target.value)}
                  placeholder="ex: 30"
                  min="0"
                  max="100"
                  className="w-32"
                />
              </div>
              <div className="space-y-1">
                <Label>Modalités de paiement <span className="text-gray-400 font-normal">(visible sur le devis)</span></Label>
                <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Ex: 30% d'acompte à la commande, solde à réception des travaux" />
              </div>
            </div>
          )}
        </div>
      </FormSection>

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
          {saving ? 'Enregistrement...' : editId ? 'Enregistrer les modifications' : 'Créer le devis'}
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
