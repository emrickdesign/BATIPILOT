'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import EntrepriseSearch from '@/components/EntrepriseSearch'
import { TRADES } from '@/lib/trades'
import type { CompanyResult } from '@/lib/siret'
import { toast } from 'sonner'
import { ArrowLeft, ArrowRight, Check, HardHat, Loader2, Sparkles, ListChecks, Clock3 } from 'lucide-react'

type PriceChoice = 'seed' | 'ia' | 'later'

const STEPS = ['Entreprise', 'Métier', 'Facturation', 'Base de prix'] as const

const emptyForm = {
  trade_name: '', legal_name: '', siret: '', vat_number: '', legal_status: '',
  address: '', phone: '', email: '', website: '',
  insurance_decennale: '', insurance_rc: '', iban: '',
  payment_terms: '30 jours à réception de facture',
  quote_validity_days: '30', default_deposit_percent: '30',
  default_vat_rate: '10', legal_mentions: 'TVA à taux réduit — Article 279-0 bis du CGI (travaux de rénovation)',
}

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [primaryTrade, setPrimaryTrade] = useState<string>('')
  const [secondaryTrades, setSecondaryTrades] = useState<string[]>([])
  const [priceChoice, setPriceChoice] = useState<PriceChoice>('seed')

  // Charge l'utilisateur + une éventuelle fiche entreprise déjà commencée.
  // Si l'onboarding est déjà terminé, on renvoie au tableau de bord.
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.replace('/login'); return }
      supabase.from('companies').select('*').eq('user_id', user.id).maybeSingle().then(({ data }) => {
        if (data?.onboarding_completed_at) { router.replace('/dashboard'); return }
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
            email: data.email || user.email || '',
            website: data.website || '',
            insurance_decennale: data.insurance_decennale || '',
            insurance_rc: data.insurance_rc || '',
            iban: data.iban || '',
            payment_terms: data.payment_terms || emptyForm.payment_terms,
            quote_validity_days: String(data.quote_validity_days || 30),
            default_deposit_percent: String(data.default_deposit_percent ?? 30),
            default_vat_rate: String(data.default_vat_rate ?? 10),
            legal_mentions: data.legal_mentions || emptyForm.legal_mentions,
          })
          setPrimaryTrade(data.trade || '')
          setSecondaryTrades(Array.isArray(data.secondary_trades) ? data.secondary_trades : [])
        } else {
          setForm(f => ({ ...f, email: user.email || '' }))
        }
        setReady(true)
      })
    })
  }, [router])

  function set(field: keyof typeof emptyForm, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function applySirene(c: CompanyResult) {
    setForm(prev => ({
      ...prev,
      trade_name: prev.trade_name || c.name,
      legal_name: c.name || prev.legal_name,
      siret: c.siret || prev.siret,
      address: c.address || prev.address,
    }))
    toast.success('Informations importées depuis l’annuaire officiel')
  }

  function toggleSecondary(id: string) {
    setSecondaryTrades(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id])
  }

  const canNext = () => {
    if (step === 0) return form.trade_name.trim().length > 0
    if (step === 1) return primaryTrade.length > 0
    return true
  }

  async function finish() {
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/login'); return }

    // Le métier principal ne doit pas figurer aussi dans les secondaires.
    const secondaries = secondaryTrades.filter(t => t !== primaryTrade)

    const payload = {
      user_id: user.id,
      trade_name: form.trade_name.trim(),
      legal_name: form.legal_name.trim() || null,
      siret: form.siret.trim() || null,
      vat_number: form.vat_number.trim() || null,
      legal_status: form.legal_status || null,
      address: form.address.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      website: form.website.trim() || null,
      insurance_decennale: form.insurance_decennale.trim() || null,
      insurance_rc: form.insurance_rc.trim() || null,
      iban: form.iban.trim() || null,
      payment_terms: form.payment_terms,
      quote_validity_days: parseInt(form.quote_validity_days) || 30,
      default_deposit_percent: parseFloat(form.default_deposit_percent) || 30,
      default_vat_rate: parseFloat(form.default_vat_rate) || 10,
      legal_mentions: form.legal_mentions || null,
      trade: primaryTrade || null,
      secondary_trades: secondaries,
      onboarding_completed_at: new Date().toISOString(),
    }

    const { error } = companyId
      ? await supabase.from('companies').update(payload).eq('id', companyId)
      : await supabase.from('companies').insert(payload)

    if (error) {
      toast.error('Erreur lors de l’enregistrement. Réessayez.')
      setSaving(false)
      return
    }

    // Base de prix : seed filtré par métier (les autres choix se font après).
    if (priceChoice === 'seed') {
      try {
        const res = await fetch('/api/seed-prix', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trades: [primaryTrade, ...secondaries] }),
        })
        if (res.ok) {
          const json = await res.json().catch(() => null)
          toast.success(`Base de prix installée${json?.count ? ` (${json.count} prestations)` : ''}`)
        }
      } catch { /* non bloquant : l'utilisateur pourra seeder depuis /prix */ }
    }

    toast.success('Bienvenue sur TonPilote ! Votre espace est prêt.')
    if (priceChoice === 'ia') router.replace('/prix')
    else router.replace('/dashboard')
  }

  if (!ready) {
    return (
      <div className="min-h-screen grid place-items-center bg-app-bg">
        <Loader2 className="w-6 h-6 animate-spin text-[#D05C43]" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-app-bg flex flex-col">
      {/* En-tête + progression */}
      <header className="border-b border-black/5 bg-white/70 backdrop-blur px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <span className="grid place-items-center w-9 h-9 rounded-xl bg-[#D05C43] text-white shadow">
            <HardHat className="w-5 h-5" />
          </span>
          <div className="flex-1">
            <p className="font-bold text-marine leading-tight">Configurons votre espace</p>
            <p className="text-xs text-slate-500">Étape {step + 1} sur {STEPS.length} — {STEPS[step]}</p>
          </div>
        </div>
        <div className="max-w-2xl mx-auto mt-3 flex gap-1.5">
          {STEPS.map((_, i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= step ? 'bg-[#D05C43]' : 'bg-black/10'}`} />
          ))}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-4">
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <h1 className="text-xl font-bold text-marine">Votre entreprise</h1>
                <p className="text-sm text-slate-500">Cherchez votre entreprise pour tout pré-remplir, ou saisissez à la main.</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
                <Label>Rechercher dans l’annuaire officiel (gratuit)</Label>
                <EntrepriseSearch onSelect={applySirene} />
                <p className="text-xs text-slate-400">Nom, ville ou SIRET — les infos légales seront importées automatiquement.</p>
              </div>
              <div className="grid gap-3">
                <div className="space-y-1">
                  <Label>Nom commercial *</Label>
                  <Input value={form.trade_name} onChange={e => set('trade_name', e.target.value)} placeholder="Mon Entreprise BTP" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>SIRET</Label>
                    <Input value={form.siret} onChange={e => set('siret', e.target.value)} placeholder="123 456 789 00012" />
                  </div>
                  <div className="space-y-1">
                    <Label>Statut juridique</Label>
                    <select value={form.legal_status} onChange={e => set('legal_status', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white">
                      <option value="">Sélectionner…</option>
                      <option value="micro-entreprise">Micro-entreprise</option>
                      <option value="EI">EI (Entreprise individuelle)</option>
                      <option value="EURL">EURL</option>
                      <option value="SARL">SARL</option>
                      <option value="SAS">SAS</option>
                      <option value="SASU">SASU</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Adresse</Label>
                  <Textarea value={form.address} onChange={e => set('address', e.target.value)} rows={2} placeholder="12 rue des Artisans, 75001 Paris" />
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h1 className="text-xl font-bold text-marine">Votre métier</h1>
                <p className="text-sm text-slate-500">Il personnalise votre base de prix, vos catégories et vos suggestions.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Métier principal *</Label>
                <div className="grid grid-cols-2 gap-2">
                  {TRADES.map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => { setPrimaryTrade(t.id); setSecondaryTrades(prev => prev.filter(s => s !== t.id)) }}
                      className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${primaryTrade === t.id ? 'border-[#D05C43] bg-[#D05C43]/8 ring-1 ring-[#D05C43]' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                    >
                      <span className="text-lg">{t.emoji}</span>
                      <span className="font-medium text-marine">{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              {primaryTrade && (
                <div className="space-y-1.5">
                  <Label>Autres métiers que vous exercez <span className="font-normal text-slate-400">(optionnel)</span></Label>
                  <div className="flex flex-wrap gap-2">
                    {TRADES.filter(t => t.id !== primaryTrade && t.id !== 'renovation_generale' && t.id !== 'autre').map(t => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => toggleSecondary(t.id)}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${secondaryTrades.includes(t.id) ? 'border-[#D05C43] bg-[#D05C43]/8 text-marine' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
                      >
                        <span>{t.emoji}</span>{t.label}
                        {secondaryTrades.includes(t.id) && <Check className="w-3.5 h-3.5 text-[#D05C43]" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h1 className="text-xl font-bold text-marine">Facturation & mentions</h1>
                <p className="text-sm text-slate-500">Ces réglages pré-remplissent tous vos devis et factures — modifiables plus tard.</p>
              </div>
              <div className="grid gap-3">
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
                  <Label>IBAN <span className="font-normal text-slate-400">(affiché sur les factures)</span></Label>
                  <Input value={form.iban} onChange={e => set('iban', e.target.value)} placeholder="FR76 1234 5678 9012 3456 7890 123" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Assurance décennale</Label>
                    <Input value={form.insurance_decennale} onChange={e => set('insurance_decennale', e.target.value)} placeholder="AXA — Contrat n°123456" />
                  </div>
                  <div className="space-y-1">
                    <Label>RC Professionnelle</Label>
                    <Input value={form.insurance_rc} onChange={e => set('insurance_rc', e.target.value)} placeholder="Allianz — n°789012" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label>Validité devis (j)</Label>
                    <Input type="number" min="1" value={form.quote_validity_days} onChange={e => set('quote_validity_days', e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Acompte (%)</Label>
                    <Input type="number" min="0" max="100" value={form.default_deposit_percent} onChange={e => set('default_deposit_percent', e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>TVA (%)</Label>
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
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h1 className="text-xl font-bold text-marine">Votre base de prix</h1>
                <p className="text-sm text-slate-500">Le catalogue de vos prestations, pour chiffrer un devis en quelques clics.</p>
              </div>
              <div className="grid gap-2.5">
                <ChoiceCard
                  active={priceChoice === 'seed'}
                  onClick={() => setPriceChoice('seed')}
                  icon={<ListChecks className="w-5 h-5" />}
                  title="Installer une base type adaptée à mon métier"
                  desc="Prestations et prix indicatifs prêts à l’emploi, filtrés selon votre corps d’état. Recommandé."
                />
                <ChoiceCard
                  active={priceChoice === 'ia'}
                  onClick={() => setPriceChoice('ia')}
                  icon={<Sparkles className="w-5 h-5" />}
                  title="Construire ma base avec l’IA"
                  desc="Décrivez votre activité, votre coût horaire et votre marge : l’IA génère une base personnalisée."
                />
                <ChoiceCard
                  active={priceChoice === 'later'}
                  onClick={() => setPriceChoice('later')}
                  icon={<Clock3 className="w-5 h-5" />}
                  title="Plus tard"
                  desc="Vous pourrez créer votre base à tout moment depuis l’onglet Prix."
                />
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Barre d'actions */}
      <footer className="border-t border-black/5 bg-white/80 backdrop-blur px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0 || saving} className="gap-1">
            <ArrowLeft className="w-4 h-4" /> Retour
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep(s => s + 1)} disabled={!canNext()} className="gap-1">
              Continuer <ArrowRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button onClick={finish} disabled={saving} className="gap-1">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Finalisation…</> : <>Terminer <Check className="w-4 h-4" /></>}
            </Button>
          )}
        </div>
      </footer>
    </div>
  )
}

function ChoiceCard({ active, onClick, icon, title, desc }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; title: string; desc: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-colors ${active ? 'border-[#D05C43] bg-[#D05C43]/8 ring-1 ring-[#D05C43]' : 'border-slate-200 bg-white hover:border-slate-300'}`}
    >
      <span className={`grid place-items-center w-10 h-10 rounded-lg flex-shrink-0 ${active ? 'bg-[#D05C43] text-white' : 'bg-slate-100 text-slate-500'}`}>{icon}</span>
      <span>
        <span className="block font-semibold text-marine">{title}</span>
        <span className="block text-sm text-slate-500 mt-0.5">{desc}</span>
      </span>
    </button>
  )
}
