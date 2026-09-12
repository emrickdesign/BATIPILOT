'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import EntrepriseSearch from '@/components/EntrepriseSearch'
import { TRADES } from '@/lib/trades'
import type { CompanyResult } from '@/lib/siret'
import { toast } from 'sonner'
import {
  ArrowLeft, ArrowRight, Check, Loader2, Sparkles, ListChecks, Clock3, Building2,
  Users, Target, ReceiptText, FileText, Landmark, HardHat, Wallet, CalendarClock, BadgeCheck,
} from 'lucide-react'

// ─── Types partagés avec la page (data) ────────────────────────────────────────
export interface OnboardingForm {
  trade_name: string; legal_name: string; siret: string; vat_number: string; legal_status: string
  address: string; phone: string; email: string; website: string
  insurance_decennale: string; insurance_rc: string; iban: string
  payment_terms: string; quote_validity_days: string; default_deposit_percent: string
  default_vat_rate: string; legal_mentions: string
}
export type PriceChoice = 'seed' | 'ia' | 'later'
export interface OnboardingResult {
  form: OnboardingForm
  primaryTrade: string
  secondaryTrades: string[]
  companySize: string
  interests: string[]
  priceChoice: PriceChoice
}
export interface WizardInitial extends Partial<OnboardingForm> {
  trade?: string | null
  secondary_trades?: string[]
  company_size?: string | null
  interests?: string[]
}

export const EMPTY_FORM: OnboardingForm = {
  trade_name: '', legal_name: '', siret: '', vat_number: '', legal_status: '',
  address: '', phone: '', email: '', website: '',
  insurance_decennale: '', insurance_rc: '', iban: '',
  payment_terms: '30 jours à réception de facture',
  quote_validity_days: '30', default_deposit_percent: '30',
  default_vat_rate: '10', legal_mentions: 'TVA à taux réduit — Article 279-0 bis du CGI (travaux de rénovation)',
}

const STEPS = [
  { key: 'entreprise', label: 'Ton entreprise', hint: 'Identité' },
  { key: 'metier', label: 'Métier & équipe', hint: 'Ton activité' },
  { key: 'objectifs', label: 'Tes objectifs', hint: 'Ce qui compte' },
  { key: 'facturation', label: 'Facturation', hint: 'Devis & factures' },
  { key: 'prix', label: 'Base de prix', hint: 'Ton catalogue' },
] as const

const SIZES = [
  { id: 'solo', label: 'Je suis seul·e', icon: '👤' },
  { id: '1_3', label: '1 à 3', icon: '👥' },
  { id: '4_10', label: '4 à 10', icon: '👷' },
  { id: '11_50', label: '11 à 50', icon: '🏗️' },
  { id: '50_plus', label: 'Plus de 50', icon: '🏢' },
]

const GOALS: { id: string; label: string; icon: React.ReactNode }[] = [
  { id: 'devis', label: 'Faire mes devis plus vite', icon: <FileText className="w-5 h-5" /> },
  { id: 'paiement', label: 'Être payé plus vite', icon: <Wallet className="w-5 h-5" /> },
  { id: 'chantiers', label: 'Suivre mes chantiers', icon: <HardHat className="w-5 h-5" /> },
  { id: 'facturation_elec', label: 'Être prêt pour la facture électronique', icon: <BadgeCheck className="w-5 h-5" /> },
  { id: 'ia', label: 'Déléguer à l’agent IA', icon: <Sparkles className="w-5 h-5" /> },
  { id: 'equipe', label: 'Gérer mon équipe & planning', icon: <CalendarClock className="w-5 h-5" /> },
  { id: 'depenses', label: 'Maîtriser mes dépenses', icon: <ReceiptText className="w-5 h-5" /> },
  { id: 'compta', label: 'Simplifier ma compta', icon: <Landmark className="w-5 h-5" /> },
]

export default function OnboardingWizard({
  userEmail, initial, onFinish, finishing, initialStep = 0,
}: {
  userEmail: string
  initial: WizardInitial
  onFinish: (r: OnboardingResult) => void | Promise<void>
  finishing: boolean
  /** Aperçu / tests uniquement : démarre à une étape donnée. */
  initialStep?: number
}) {
  const [step, setStep] = useState(initialStep)
  const [form, setForm] = useState<OnboardingForm>({
    ...EMPTY_FORM,
    ...Object.fromEntries(Object.entries(initial).filter(([k]) => k in EMPTY_FORM)) as Partial<OnboardingForm>,
    email: initial.email || userEmail || '',
    quote_validity_days: String(initial.quote_validity_days ?? EMPTY_FORM.quote_validity_days),
    default_deposit_percent: String(initial.default_deposit_percent ?? EMPTY_FORM.default_deposit_percent),
    default_vat_rate: String(initial.default_vat_rate ?? EMPTY_FORM.default_vat_rate),
    payment_terms: initial.payment_terms || EMPTY_FORM.payment_terms,
    legal_mentions: initial.legal_mentions || EMPTY_FORM.legal_mentions,
  })
  const [primaryTrade, setPrimaryTrade] = useState(initial.trade || '')
  const [secondaryTrades, setSecondaryTrades] = useState<string[]>(Array.isArray(initial.secondary_trades) ? initial.secondary_trades : [])
  const [companySize, setCompanySize] = useState(initial.company_size || '')
  const [interests, setInterests] = useState<string[]>(Array.isArray(initial.interests) ? initial.interests : [])
  const [priceChoice, setPriceChoice] = useState<PriceChoice>('seed')

  const set = (field: keyof OnboardingForm, value: string) => setForm(p => ({ ...p, [field]: value }))
  const toggle = (arr: string[], v: string) => arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]

  function applySirene(c: CompanyResult) {
    setForm(p => ({ ...p, trade_name: p.trade_name || c.name, legal_name: c.name || p.legal_name, siret: c.siret || p.siret, address: c.address || p.address }))
    toast.success('Informations importées depuis l’annuaire officiel')
  }

  const canNext = () => {
    if (step === 0) return form.trade_name.trim().length > 0
    if (step === 1) return primaryTrade.length > 0 && companySize.length > 0
    return true
  }

  function next() { if (step < STEPS.length - 1) setStep(s => s + 1); else onFinish({ form, primaryTrade, secondaryTrades: secondaryTrades.filter(t => t !== primaryTrade), companySize, interests, priceChoice }) }

  return (
    <div className="min-h-screen flex bg-[#FBF9F5]">
      {/* ─── Panneau marque (gauche) ─── */}
      <aside className="hidden lg:flex flex-col w-[40%] max-w-[520px] relative overflow-hidden text-white p-10"
        style={{ background: 'linear-gradient(160deg,#E5735A 0%,#D05C43 42%,#221D14 140%)' }}>
        <div className="absolute -top-24 -right-16 w-96 h-96 rounded-full opacity-40" style={{ background: 'radial-gradient(circle,#F4A088,transparent 65%)' }} />
        <div className="relative z-10 flex flex-col h-full">
          <div className="font-heading font-extrabold text-2xl tracking-tight">Ton<span className="opacity-80">Pilote</span></div>

          <div className="mt-14">
            <h2 className="font-heading font-extrabold text-[2rem] leading-[1.1] tracking-tight">Ton espace<br />se prépare.</h2>
            <p className="mt-3 text-white/80 text-[15px] max-w-xs">Quelques questions pour adapter TonPilote à ton entreprise. Trois minutes, pas plus.</p>
          </div>

          {/* Stepper vertical */}
          <ol className="mt-10 space-y-1.5">
            {STEPS.map((s, i) => {
              const done = i < step, current = i === step
              return (
                <li key={s.key} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${current ? 'bg-white/15' : ''}`}>
                  <span className={`grid place-items-center w-7 h-7 rounded-full text-[13px] font-bold flex-none ${done ? 'bg-white text-[#C14E33]' : current ? 'bg-white text-[#C14E33]' : 'bg-white/15 text-white/70'}`}>
                    {done ? <Check className="w-4 h-4" /> : i + 1}
                  </span>
                  <span>
                    <span className={`block font-heading font-semibold text-[15px] leading-tight ${current || done ? 'text-white' : 'text-white/65'}`}>{s.label}</span>
                    <span className="block text-[12px] text-white/55">{s.hint}</span>
                  </span>
                </li>
              )
            })}
          </ol>

          <div className="mt-auto">
            <div className="rounded-2xl bg-white/12 border border-white/15 backdrop-blur px-4 py-3.5">
              <p className="text-[14px] leading-snug">« Tout mon administratif au même endroit, et l’IA qui bosse pendant que je suis sur le chantier. »</p>
              <p className="mt-2 text-[12px] text-white/70">Un artisan du bâtiment</p>
            </div>
            <p className="mt-4 text-[12px] text-white/70 flex items-center gap-2">
              <BadgeCheck className="w-4 h-4" /> 1er mois offert · sans carte · sans engagement
            </p>
          </div>
        </div>
      </aside>

      {/* ─── Panneau formulaire (droite) ─── */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* progression (mobile) */}
        <div className="lg:hidden px-5 pt-5">
          <div className="flex items-center justify-between">
            <div className="font-heading font-extrabold text-lg text-marine">Ton<span className="text-primary">Pilote</span></div>
            <span className="text-xs text-slate-500">Étape {step + 1}/{STEPS.length}</span>
          </div>
          <div className="mt-3 flex gap-1.5">
            {STEPS.map((_, i) => <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-primary' : 'bg-black/10'}`} />)}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-xl mx-auto w-full px-5 md:px-10 py-8 md:py-12">
            {step === 0 && <StepEntreprise form={form} set={set} applySirene={applySirene} />}
            {step === 1 && <StepMetier {...{ primaryTrade, setPrimaryTrade, secondaryTrades, setSecondaryTrades, companySize, setCompanySize, toggle }} />}
            {step === 2 && <StepObjectifs {...{ interests, setInterests, toggle }} />}
            {step === 3 && <StepFacturation form={form} set={set} />}
            {step === 4 && <StepPrix priceChoice={priceChoice} setPriceChoice={setPriceChoice} />}
          </div>
        </div>

        {/* actions */}
        <footer className="border-t border-black/5 bg-white/70 backdrop-blur px-5 md:px-10 py-4">
          <div className="max-w-xl mx-auto w-full flex items-center justify-between gap-3">
            <Button variant="ghost" onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0 || finishing} className="gap-1.5">
              <ArrowLeft className="w-4 h-4" /> Retour
            </Button>
            <div className="flex items-center gap-3">
              {(step === 2 || step === 3) && (
                <button type="button" onClick={next} disabled={finishing} className="text-sm text-slate-400 hover:text-slate-600">Passer</button>
              )}
              <Button onClick={next} disabled={!canNext() || finishing} size="lg" className="gap-1.5">
                {finishing ? <><Loader2 className="w-4 h-4 animate-spin" /> Finalisation…</>
                  : step < STEPS.length - 1 ? <>Continuer <ArrowRight className="w-4 h-4" /></>
                  : <>Terminer <Check className="w-4 h-4" /></>}
              </Button>
            </div>
          </div>
        </footer>
      </main>

      {finishing && <SuccessOverlay />}
    </div>
  )
}

// ─── En-tête d'étape ────────────────────────────────────────────────────────────
function Head({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div className="mb-6 animate-fade-up">
      <span className="grid place-items-center w-11 h-11 rounded-xl bg-accent text-primary mb-4">{icon}</span>
      <h1 className="font-heading font-extrabold text-2xl text-marine tracking-tight">{title}</h1>
      <p className="text-slate-500 mt-1.5">{sub}</p>
    </div>
  )
}

// ─── Étape 1 : entreprise ────────────────────────────────────────────────────────
function StepEntreprise({ form, set, applySirene }: { form: OnboardingForm; set: (f: keyof OnboardingForm, v: string) => void; applySirene: (c: CompanyResult) => void }) {
  return (
    <div>
      <Head icon={<Building2 className="w-6 h-6" />} title="Ton entreprise" sub="Cherche-la pour tout pré-remplir, ou saisis à la main." />
      <div className="rounded-2xl border border-primary/20 bg-accent/40 p-4 mb-4">
        <Label className="text-primary">Rechercher dans l’annuaire officiel <span className="font-normal opacity-70">— gratuit</span></Label>
        <div className="mt-2"><EntrepriseSearch onSelect={applySirene} /></div>
        <p className="text-xs text-slate-500 mt-2">Nom, ville ou SIRET — SIRET, adresse et raison sociale importés d’un clic.</p>
      </div>
      <div className="space-y-3">
        <Field label="Nom commercial *"><Input value={form.trade_name} onChange={e => set('trade_name', e.target.value)} placeholder="Mon Entreprise BTP" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="SIRET"><Input value={form.siret} onChange={e => set('siret', e.target.value)} placeholder="123 456 789 00012" /></Field>
          <Field label="Statut juridique">
            <select value={form.legal_status} onChange={e => set('legal_status', e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white">
              <option value="">Sélectionner…</option>
              <option value="micro-entreprise">Micro-entreprise</option>
              <option value="EI">EI (Entreprise individuelle)</option>
              <option value="EURL">EURL</option><option value="SARL">SARL</option>
              <option value="SAS">SAS</option><option value="SASU">SASU</option>
            </select>
          </Field>
        </div>
        <Field label="Adresse"><Textarea value={form.address} onChange={e => set('address', e.target.value)} rows={2} placeholder="12 rue des Artisans, 75001 Paris" /></Field>
      </div>
    </div>
  )
}

// ─── Étape 2 : métier & équipe ───────────────────────────────────────────────────
function StepMetier({ primaryTrade, setPrimaryTrade, secondaryTrades, setSecondaryTrades, companySize, setCompanySize, toggle }: {
  primaryTrade: string; setPrimaryTrade: (v: string) => void
  secondaryTrades: string[]; setSecondaryTrades: (v: string[]) => void
  companySize: string; setCompanySize: (v: string) => void
  toggle: (arr: string[], v: string) => string[]
}) {
  return (
    <div>
      <Head icon={<HardHat className="w-6 h-6" />} title="Ton métier & ton équipe" sub="On personnalise ta base de prix, tes catégories et l’app selon ton corps d’état." />
      <Label>Métier principal *</Label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2 mb-5">
        {TRADES.map(t => {
          const active = primaryTrade === t.id
          return (
            <button key={t.id} type="button"
              onClick={() => { setPrimaryTrade(t.id); setSecondaryTrades(secondaryTrades.filter(s => s !== t.id)) }}
              className={`flex items-center gap-2.5 rounded-xl border px-3 py-3 text-left text-sm transition-all ${active ? 'border-primary bg-accent ring-1 ring-primary shadow-[var(--shadow-sm)]' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
              <span className="text-lg leading-none">{t.emoji}</span>
              <span className="font-medium text-marine leading-tight">{t.label}</span>
              {active && <Check className="w-4 h-4 text-primary ml-auto flex-none" />}
            </button>
          )
        })}
      </div>

      {primaryTrade && (
        <div className="mb-6 animate-fade-up">
          <Label>Autres métiers exercés <span className="font-normal text-slate-400">(optionnel)</span></Label>
          <div className="flex flex-wrap gap-2 mt-2">
            {TRADES.filter(t => t.id !== primaryTrade && t.id !== 'renovation_generale' && t.id !== 'autre').map(t => {
              const on = secondaryTrades.includes(t.id)
              return (
                <button key={t.id} type="button" onClick={() => setSecondaryTrades(toggle(secondaryTrades, t.id))}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${on ? 'border-primary bg-accent text-marine' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                  <span>{t.emoji}</span>{t.label}{on && <Check className="w-3.5 h-3.5 text-primary" />}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <Label className="flex items-center gap-1.5"><Users className="w-4 h-4 text-slate-400" /> Ton effectif *</Label>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
        {SIZES.map(s => {
          const active = companySize === s.id
          return (
            <button key={s.id} type="button" onClick={() => setCompanySize(s.id)}
              className={`flex items-center gap-2 rounded-xl border px-3 py-3 text-sm transition-all ${active ? 'border-primary bg-accent ring-1 ring-primary' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
              <span className="text-base">{s.icon}</span><span className="font-medium text-marine">{s.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Étape 3 : objectifs ─────────────────────────────────────────────────────────
function StepObjectifs({ interests, setInterests, toggle }: { interests: string[]; setInterests: (v: string[]) => void; toggle: (arr: string[], v: string) => string[] }) {
  return (
    <div>
      <Head icon={<Target className="w-6 h-6" />} title="Qu’est-ce qui te ferait gagner le plus ?" sub="Choisis ce qui compte pour toi — on met tes priorités en avant. Facultatif." />
      <div className="grid sm:grid-cols-2 gap-2.5">
        {GOALS.map(g => {
          const on = interests.includes(g.id)
          return (
            <button key={g.id} type="button" onClick={() => setInterests(toggle(interests, g.id))}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition-all ${on ? 'border-primary bg-accent ring-1 ring-primary' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
              <span className={`grid place-items-center w-9 h-9 rounded-lg flex-none ${on ? 'bg-primary text-white' : 'bg-slate-100 text-slate-500'}`}>{g.icon}</span>
              <span className="font-medium text-marine text-sm leading-tight">{g.label}</span>
              {on && <Check className="w-4 h-4 text-primary ml-auto flex-none" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Étape 4 : facturation ───────────────────────────────────────────────────────
function StepFacturation({ form, set }: { form: OnboardingForm; set: (f: keyof OnboardingForm, v: string) => void }) {
  return (
    <div>
      <Head icon={<ReceiptText className="w-6 h-6" />} title="Facturation & mentions" sub="Ces réglages pré-remplissent tous tes devis et factures. Tout est modifiable plus tard." />
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Téléphone"><Input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="06 12 34 56 78" /></Field>
          <Field label="Email pro"><Input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="contact@entreprise.fr" /></Field>
        </div>
        <Field label="IBAN" hint="(affiché sur les factures)"><Input value={form.iban} onChange={e => set('iban', e.target.value)} placeholder="FR76 1234 5678 9012 3456 7890 123" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Assurance décennale"><Input value={form.insurance_decennale} onChange={e => set('insurance_decennale', e.target.value)} placeholder="AXA — n°123456" /></Field>
          <Field label="RC Professionnelle"><Input value={form.insurance_rc} onChange={e => set('insurance_rc', e.target.value)} placeholder="Allianz — n°789012" /></Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Validité devis (j)"><Input type="number" min="1" value={form.quote_validity_days} onChange={e => set('quote_validity_days', e.target.value)} /></Field>
          <Field label="Acompte (%)"><Input type="number" min="0" max="100" value={form.default_deposit_percent} onChange={e => set('default_deposit_percent', e.target.value)} /></Field>
          <Field label="TVA (%)">
            <select value={form.default_vat_rate} onChange={e => set('default_vat_rate', e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white">
              <option value="5.5">5,5%</option><option value="10">10%</option><option value="20">20%</option>
            </select>
          </Field>
        </div>
        <Field label="Conditions de paiement"><Input value={form.payment_terms} onChange={e => set('payment_terms', e.target.value)} /></Field>
      </div>
    </div>
  )
}

// ─── Étape 5 : base de prix ──────────────────────────────────────────────────────
function StepPrix({ priceChoice, setPriceChoice }: { priceChoice: PriceChoice; setPriceChoice: (v: PriceChoice) => void }) {
  return (
    <div>
      <Head icon={<ListChecks className="w-6 h-6" />} title="Ta base de prix" sub="Le catalogue de tes prestations, pour chiffrer un devis en quelques clics." />
      <div className="space-y-2.5">
        <ChoiceCard active={priceChoice === 'seed'} onClick={() => setPriceChoice('seed')} icon={<ListChecks className="w-5 h-5" />}
          title="Installer une base type adaptée à mon métier" badge="Recommandé"
          desc="Prestations et prix indicatifs prêts à l’emploi, filtrés selon ton corps d’état." />
        <ChoiceCard active={priceChoice === 'ia'} onClick={() => setPriceChoice('ia')} icon={<Sparkles className="w-5 h-5" />}
          title="Construire ma base avec l’IA"
          desc="Décris ton activité, ton coût horaire et ta marge : l’IA génère une base personnalisée." />
        <ChoiceCard active={priceChoice === 'later'} onClick={() => setPriceChoice('later')} icon={<Clock3 className="w-5 h-5" />}
          title="Plus tard"
          desc="Tu pourras créer ta base à tout moment depuis l’onglet Prix." />
      </div>
      <div className="rounded-xl border border-primary/20 bg-accent/40 p-3.5 mt-4 text-sm text-marine">
        <b className="text-primary">Astuce</b> — après l’installation, connecte ta banque dans Réglages : les virements reçus se rapprochent tout seuls de tes factures.
      </div>
    </div>
  )
}

// ─── Petits composants ──────────────────────────────────────────────────────────
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}{hint && <span className="font-normal text-slate-400"> {hint}</span>}</Label>
      {children}
    </div>
  )
}

function ChoiceCard({ active, onClick, icon, title, desc, badge }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; title: string; desc: string; badge?: string
}) {
  return (
    <button type="button" onClick={onClick}
      className={`w-full flex items-start gap-3.5 rounded-2xl border p-4 text-left transition-all ${active ? 'border-primary bg-accent ring-1 ring-primary shadow-[var(--shadow-sm)]' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
      <span className={`grid place-items-center w-11 h-11 rounded-xl flex-none ${active ? 'bg-primary text-white' : 'bg-slate-100 text-slate-500'}`}>{icon}</span>
      <span className="min-w-0">
        <span className="flex items-center gap-2 font-semibold text-marine">{title}
          {badge && <span className="text-[11px] font-bold text-primary bg-accent rounded-full px-2 py-0.5">{badge}</span>}
        </span>
        <span className="block text-sm text-slate-500 mt-0.5">{desc}</span>
      </span>
      <span className={`grid place-items-center w-5 h-5 rounded-full border flex-none mt-0.5 ${active ? 'border-primary bg-primary text-white' : 'border-slate-300'}`}>
        {active && <Check className="w-3.5 h-3.5" />}
      </span>
    </button>
  )
}

function SuccessOverlay() {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#FBF9F5]/95 backdrop-blur-sm">
      <div className="text-center animate-fade-up">
        <span className="grid place-items-center w-16 h-16 rounded-2xl bg-primary text-white mx-auto shadow-[var(--shadow-brand)]">
          <Check className="w-8 h-8" />
        </span>
        <h2 className="font-heading font-extrabold text-2xl text-marine mt-5">Bienvenue sur TonPilote&nbsp;!</h2>
        <p className="text-slate-500 mt-1.5 flex items-center gap-2 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> On prépare ton espace…</p>
      </div>
    </div>
  )
}
