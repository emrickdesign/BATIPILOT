'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  AlertTriangle, BadgeCheck, CalendarClock, CheckCircle2, CircleAlert, ExternalLink, Inbox,
  KeyRound, Loader2, Plug, ShieldCheck, Unplug,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { PLATFORMS, type Platform } from '@/lib/einvoicing/providers'
import { formatSiren, frenchVatNumber, normalizeIban, normalizeVatNumber, parseAddress, sirenOf } from '@/lib/facturx/identifiers'
import type { ConnectionInfo } from '@/lib/einvoicing/service'

export interface CompanyTaxInfo {
  id: string
  siret: string | null
  vat_number: string | null
  address: string | null
  iban: string | null
  vat_regime: 'normal' | 'franchise' | null
  vat_on_debits: boolean | null
  operation_category: 'services' | 'goods' | 'mixed' | null
}

type Props = {
  company: CompanyTaxInfo | null
  connection: ConnectionInfo | null
  oauthReady: boolean
  transmittedCount: number
  flash: { connected: string | null; error: string | null }
}

export default function EInvoicingSettings({ company, connection, oauthReady, transmittedCount, flash }: Props) {
  const [dialog, setDialog] = useState<Platform | null>(null)

  return (
    <div className="space-y-5 animate-fade-up">
      {flash.connected && <Banner tone="success">Plateforme connectée : vos factures électroniques peuvent partir.</Banner>}
      {flash.error && <Banner tone="error">{flash.error}</Banner>}

      <FormatCard />
      <ComplianceCard company={company} />
      {connection
        ? <ConnectedCard connection={connection} transmittedCount={transmittedCount} />
        : <PlatformPicker onPick={setDialog} />}
      <ReceptionCard />

      <Dialog open={!!dialog} onOpenChange={open => { if (!open) setDialog(null) }}>
        <DialogContent className="sm:max-w-lg">
          {dialog?.connector === 'pennylane' && <PennylaneConnect oauthReady={oauthReady} onDone={() => setDialog(null)} />}
          {dialog?.connector === 'afnor' && <AfnorConnect onDone={() => setDialog(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Format + calendrier ───────────────────────────────────────────────────────

function FormatCard() {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <span className="grid place-items-center w-11 h-11 rounded-xl bg-emerald-100 text-emerald-600 shrink-0">
            <BadgeCheck className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-marine">Vos factures sont au format Factur-X</p>
            <p className="text-sm text-gray-500 mt-0.5">
              Chaque facture est un PDF lisible qui contient ses données structurées (profil EN 16931) :
              le format de la réforme, accepté par toutes les plateformes agréées.
            </p>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-2 mt-4">
          <Milestone date="1er sept. 2026" title="Réception obligatoire" desc="Toutes les entreprises doivent pouvoir recevoir des factures électroniques." current />
          <Milestone date="1er sept. 2027" title="Émission obligatoire" desc="Les TPE et PME émettent leurs factures via une plateforme agréée." />
        </div>
      </CardContent>
    </Card>
  )
}

function Milestone({ date, title, desc, current }: { date: string; title: string; desc: string; current?: boolean }) {
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${current ? 'border-emerald-200 bg-emerald-50/60' : 'border-gray-200 bg-gray-50/60'}`}>
      <div className="flex items-center gap-2 text-xs font-semibold text-gray-600">
        <CalendarClock className="w-3.5 h-3.5" /> {date}
        {current && <Badge variant="success">En vigueur</Badge>}
      </div>
      <p className="text-sm font-semibold text-marine mt-1">{title}</p>
      <p className="text-xs text-gray-500">{desc}</p>
    </div>
  )
}

// ─── Étape 1 : informations de facturation ─────────────────────────────────────

function ComplianceCard({ company }: { company: CompanyTaxInfo | null }) {
  const router = useRouter()
  const [regime, setRegime] = useState<'normal' | 'franchise'>(company?.vat_regime || 'normal')
  const [operation, setOperation] = useState<'services' | 'goods' | 'mixed'>(company?.operation_category || 'services')
  const [debits, setDebits] = useState(!!company?.vat_on_debits)
  const [saving, setSaving] = useState(false)

  if (!company) {
    return (
      <Card><CardContent className="p-5 text-sm text-gray-600">
        Commencez par renseigner <Link href="/parametres/entreprise" className="text-primary font-medium hover:underline">votre entreprise</Link> (SIRET, adresse, TVA).
      </CardContent></Card>
    )
  }

  const siren = sirenOf(company.siret)
  const address = parseAddress(company.address)
  const vat = normalizeVatNumber(company.vat_number)
  const iban = normalizeIban(company.iban)
  const suggestedVat = siren && !vat ? frenchVatNumber(siren) : null
  const dirty = regime !== (company.vat_regime || 'normal')
    || operation !== (company.operation_category || 'services')
    || (regime === 'normal' && debits) !== !!company.vat_on_debits

  const checks: { state: 'ok' | 'ko' | 'warn'; label: string; value: string }[] = [
    { state: siren ? 'ok' : 'ko', label: 'SIREN', value: siren ? formatSiren(siren) : 'SIRET manquant ou invalide' },
    { state: address.postcode && address.city ? 'ok' : 'ko', label: 'Adresse', value: address.postcode && address.city ? `${address.postcode} ${address.city}` : 'Code postal et ville introuvables' },
    regime === 'franchise'
      ? { state: 'ok', label: 'TVA', value: 'Franchise en base (art. 293 B du CGI)' }
      : { state: vat ? 'ok' : 'ko', label: 'N° de TVA', value: vat || 'Manquant' },
    { state: iban ? 'ok' : 'warn', label: 'IBAN', value: iban ? `${iban.slice(0, 4)} •••• ${iban.slice(-4)}` : 'Manquant (paiement par virement)' },
  ]
  const missing = checks.some(c => c.state === 'ko')

  async function save(patch: Record<string, unknown>, success: string) {
    setSaving(true)
    const { error } = await createClient().from('companies').update(patch).eq('id', company!.id)
    setSaving(false)
    if (error) { toast.error('Enregistrement impossible'); return }
    toast.success(success)
    router.refresh()
  }

  return (
    <Card>
      <CardContent className="p-5 space-y-5">
        <SectionTitle n={1} title="Vos informations de facturation" desc="Elles figurent dans chaque facture électronique : sans elles, la plateforme la rejette." />

        <div className="grid sm:grid-cols-2 gap-2">
          {checks.map(c => (
            <div key={c.label} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50/60 px-3 py-2.5">
              {c.state === 'ok'
                ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                : c.state === 'warn'
                  ? <CircleAlert className="w-4 h-4 text-amber-500 shrink-0" />
                  : <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />}
              <div className="min-w-0">
                <p className="text-xs text-gray-500">{c.label}</p>
                <p className={`text-sm font-medium truncate ${c.state === 'ko' ? 'text-red-600' : 'text-marine'}`}>{c.value}</p>
              </div>
            </div>
          ))}
        </div>

        {(missing || suggestedVat) && (
          <div className="flex flex-wrap items-center gap-2">
            {suggestedVat && regime === 'normal' && (
              <Button variant="outline" size="sm" disabled={saving} onClick={() => save({ vat_number: suggestedVat }, 'N° de TVA enregistré')}>
                Utiliser le n° de TVA {suggestedVat}
              </Button>
            )}
            {missing && (
              <Link href="/parametres/entreprise" className={buttonVariants({ variant: 'outline', size: 'sm' })}>Compléter Mon entreprise</Link>
            )}
          </div>
        )}

        <div className="space-y-2">
          <Label>Régime de TVA</Label>
          <Choice
            value={regime}
            onChange={setRegime}
            options={[
              { value: 'normal', label: 'Assujetti à la TVA', hint: 'Vous facturez la TVA à vos clients' },
              { value: 'franchise', label: 'Franchise en base', hint: 'Micro-entreprise : TVA non applicable (art. 293 B)' },
            ]}
          />
        </div>

        <div className="space-y-2">
          <Label>Nature de vos opérations</Label>
          <Choice
            value={operation}
            onChange={setOperation}
            options={[
              { value: 'services', label: 'Prestations de services', hint: 'Travaux, pose, dépannage' },
              { value: 'goods', label: 'Ventes de biens', hint: 'Fournitures seules' },
              { value: 'mixed', label: 'Mixte', hint: 'Biens et services' },
            ]}
          />
        </div>

        {regime === 'normal' && (
          <button
            type="button"
            onClick={() => setDebits(d => !d)}
            className="w-full flex items-center justify-between gap-4 rounded-xl border border-gray-200 px-4 py-3 text-left transition-colors hover:bg-gray-50"
          >
            <span>
              <span className="block text-sm font-semibold text-marine">Option pour le paiement de la TVA d’après les débits</span>
              <span className="block text-xs text-gray-500">Seulement si vous l’avez choisie auprès des impôts : la mention est alors ajoutée à vos factures.</span>
            </span>
            <SwitchVisual checked={debits} />
          </button>
        )}

        <div className="flex justify-end">
          <Button
            disabled={!dirty || saving}
            onClick={() => save({ vat_regime: regime, operation_category: operation, vat_on_debits: regime === 'normal' && debits }, 'Paramètres de facturation enregistrés')}
            className="gap-2"
          >
            {saving && <Loader2 className="animate-spin" />} Enregistrer
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Étape 2 : plateforme agréée ───────────────────────────────────────────────

function PlatformPicker({ onPick }: { onPick: (p: Platform) => void }) {
  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <SectionTitle
          n={2}
          title="Votre plateforme agréée"
          desc="Elle dépose vos factures chez vos clients professionnels et reçoit celles de vos fournisseurs. TonPilote prépare vos factures et les lui transmet."
        />
        <div className="grid sm:grid-cols-2 gap-3">
          {PLATFORMS.map(p => <PlatformCard key={p.id} platform={p} onPick={() => onPick(p)} />)}
        </div>
        <p className="text-xs text-gray-500">
          Plateforme absente de la liste ? Téléchargez vos factures Factur-X depuis chaque facture et déposez-les sur votre plateforme.
          Liste officielle :{' '}
          <a href="https://www.impots.gouv.fr/je-consulte-la-liste-des-plateformes-agreees" target="_blank" rel="noreferrer" className="text-primary hover:underline">impots.gouv.fr</a>
        </p>
      </CardContent>
    </Card>
  )
}

function PlatformCard({ platform: p, onPick }: { platform: Platform; onPick: () => void }) {
  const available = !!p.connector
  const content = (
    <div className="flex items-start gap-3">
      <Monogram platform={p} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-marine">{p.name}</span>
          {p.badge && <Badge variant="soft">{p.badge}</Badge>}
          {!available && <Badge variant="secondary">Bientôt</Badge>}
        </div>
        <p className="text-xs text-gray-500 mt-1 leading-relaxed">{p.description}</p>
        {available && (
          <span className="inline-flex items-center gap-1 text-sm font-medium text-primary mt-2">
            <Plug className="w-3.5 h-3.5" /> Connecter
          </span>
        )}
      </div>
    </div>
  )
  return available
    ? <button type="button" onClick={onPick} className="text-left rounded-2xl border border-gray-200 bg-white p-4 card-interactive hover:border-primary/40">{content}</button>
    : <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/60 p-4 opacity-70">{content}</div>
}

function ConnectedCard({ connection, transmittedCount }: { connection: ConnectionInfo; transmittedCount: number }) {
  const router = useRouter()
  const [autoSend, setAutoSend] = useState(connection.autoSend)
  const [busy, setBusy] = useState<'auto' | 'disconnect' | null>(null)
  const platform = PLATFORMS.find(p => p.connector === connection.provider) || PLATFORMS[0]
  const name = connection.provider === 'pennylane' ? 'Pennylane' : connection.accountLabel || 'Plateforme agréée'
  const detail = connection.provider === 'pennylane' ? connection.accountLabel : connection.flowUrl
  const method = connection.authType === 'oauth' ? 'connexion Pennylane' : connection.authType === 'api_token' ? 'token API' : 'API AFNOR'

  async function toggleAuto() {
    const next = !autoSend
    setAutoSend(next)
    setBusy('auto')
    const res = await fetch('/api/einvoicing/connection', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ autoSend: next }),
    })
    setBusy(null)
    if (!res.ok) { setAutoSend(!next); toast.error('Réglage non enregistré') }
  }

  async function disconnect() {
    if (!confirm(`Déconnecter ${name} ? Vos factures ne lui seront plus transmises.`)) return
    setBusy('disconnect')
    const res = await fetch('/api/einvoicing/connection', { method: 'DELETE' })
    setBusy(null)
    if (!res.ok) { toast.error('Déconnexion impossible'); return }
    toast.success('Plateforme déconnectée')
    router.refresh()
  }

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <SectionTitle n={2} title="Votre plateforme agréée" />
        <div className="flex items-start gap-3">
          <Monogram platform={platform} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-marine flex items-center gap-2 flex-wrap">
              {name} <Badge variant="success"><CheckCircle2 /> Connectée</Badge>
            </p>
            <p className="text-sm text-gray-500 truncate">
              {detail ? `${detail} · ` : ''}depuis le {formatDate(connection.connectedAt)} · {method}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {transmittedCount} facture{transmittedCount > 1 ? 's' : ''} transmise{transmittedCount > 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {connection.lastError && <Banner tone="error">Dernier envoi en échec : {connection.lastError}</Banner>}

        <button
          type="button"
          onClick={toggleAuto}
          disabled={busy === 'auto'}
          className="w-full flex items-center justify-between gap-4 rounded-xl border border-gray-200 px-4 py-3 text-left transition-colors hover:bg-gray-50"
        >
          <span>
            <span className="block text-sm font-semibold text-marine">Envoi automatique</span>
            <span className="block text-xs text-gray-500">Chaque facture à un client professionnel part vers {name} dès que vous l’envoyez.</span>
          </span>
          <SwitchVisual checked={autoSend} />
        </button>

        <div className="flex flex-wrap gap-2">
          <Button variant="destructive-outline" onClick={disconnect} disabled={!!busy} className="gap-2">
            {busy === 'disconnect' ? <Loader2 className="animate-spin" /> : <Unplug />} Déconnecter
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Étape 3 : réception ───────────────────────────────────────────────────────

function ReceptionCard() {
  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <SectionTitle n={3} title="Réception de vos factures fournisseurs" />
        <div className="flex items-start gap-3">
          <span className="grid place-items-center w-10 h-10 rounded-xl bg-blue-50 text-blue-600 shrink-0"><Inbox className="w-5 h-5" /></span>
          <p className="text-sm text-gray-600">
            Depuis le 1er septembre 2026, vos fournisseurs vous envoient leurs factures via leur plateforme agréée :
            elles arrivent dans la vôtre. Déclarez-la aussi comme plateforme de <b>réception</b> : c’est elle qui
            vous inscrit dans l’annuaire officiel.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Fenêtres de connexion ─────────────────────────────────────────────────────

function PennylaneConnect({ oauthReady, onDone }: { oauthReady: boolean; onDone: () => void }) {
  const router = useRouter()
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const res = await fetch('/api/einvoicing/connection', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'pennylane', token: token.trim() }),
    })
    const json = await res.json().catch(() => ({}))
    setLoading(false)
    if (!res.ok) { setError(json.error || 'Connexion impossible'); return }
    toast.success(`Pennylane connecté : ${json.accountLabel}`)
    onDone()
    router.refresh()
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-lg">Connecter Pennylane</DialogTitle>
        <DialogDescription>
          Deux étapes, environ 5 minutes. Pennylane déposera vos factures chez vos clients et recevra celles de vos fournisseurs.
        </DialogDescription>
      </DialogHeader>
      <ol className="space-y-5">
        <Step n={1} title="Faites de Pennylane votre plateforme agréée">
          <p>
            Dans Pennylane : menu <b>Facturation électronique</b> › <b>Enregistrer Pennylane comme PA</b>.
            Il faut être le représentant légal, avec la double authentification activée et une pièce d’identité.
            Gratuit si vous utilisez Pennylane uniquement comme plateforme, actif sous 3 jours.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <a href="https://app.pennylane.com" target="_blank" rel="noreferrer" className={buttonVariants({ variant: 'outline', size: 'sm', className: 'gap-1.5' })}>
              <ExternalLink /> Ouvrir Pennylane
            </a>
            <a href="https://www.pennylane.com/fr/logiciel-facturation-electronique" target="_blank" rel="noreferrer" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
              Pas encore de compte ?
            </a>
          </div>
        </Step>
        <Step n={2} title="Autorisez TonPilote">
          {oauthReady ? (
            <a href="/api/einvoicing/pennylane/authorize" className={buttonVariants({ className: 'w-full h-10 gap-2 mt-1' })}>
              <ShieldCheck /> Se connecter avec Pennylane
            </a>
          ) : (
            <form onSubmit={submit} className="space-y-2">
              <p>
                Dans Pennylane : <b>Paramètres</b> › <b>Connectivité</b> › <b>Développeurs</b> › <b>Générer un token API</b>.
                Donnez l’accès <b>lecture et écriture</b> aux factures clients et aux clients, durée <b>illimitée</b>, puis collez le token ici.
              </p>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  value={token}
                  onChange={e => setToken(e.target.value)}
                  placeholder="Collez votre token API Pennylane"
                  className="pl-9 font-mono text-xs"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button type="submit" className="w-full h-10 gap-2" disabled={loading || token.trim().length < 20}>
                {loading ? <Loader2 className="animate-spin" /> : <Plug />} Vérifier et connecter
              </Button>
            </form>
          )}
        </Step>
      </ol>
      <p className="text-xs text-gray-400 flex items-center gap-1.5">
        <ShieldCheck className="w-3.5 h-3.5" /> Votre accès est chiffré et ne sert qu’à déposer vos factures.
      </p>
    </>
  )
}

function AfnorConnect({ onDone }: { onDone: () => void }) {
  const router = useRouter()
  const [form, setForm] = useState({ name: '', flowUrl: '', tokenUrl: '', clientId: '', clientSecret: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (key: keyof typeof form, value: string) => setForm(f => ({ ...f, [key]: value }))
  const complete = Object.values(form).every(v => v.trim())

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const res = await fetch('/api/einvoicing/connection', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'afnor', ...form }),
    })
    const json = await res.json().catch(() => ({}))
    setLoading(false)
    if (!res.ok) { setError(json.error || 'Connexion impossible'); return }
    toast.success(`${json.accountLabel} connectée`)
    onDone()
    router.refresh()
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-lg">Autre plateforme agréée</DialogTitle>
        <DialogDescription>
          Pour toute plateforme qui fournit l’API standard AFNOR (norme XP Z12-013). Ces accès se trouvent dans
          l’espace développeur (API) de votre plateforme.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Nom de la plateforme" value={form.name} onChange={v => set('name', v)} placeholder="Ma plateforme agréée" />
        <Field label="URL du service Flux" value={form.flowUrl} onChange={v => set('flowUrl', v)} placeholder="https://api.plateforme.fr/flow-service" />
        <Field label="URL du jeton OAuth" value={form.tokenUrl} onChange={v => set('tokenUrl', v)} placeholder="https://auth.plateforme.fr/oauth/token" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Client ID" value={form.clientId} onChange={v => set('clientId', v)} />
          <Field label="Client secret" type="password" value={form.clientSecret} onChange={v => set('clientSecret', v)} />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" className="w-full h-10 gap-2" disabled={!complete || loading}>
          {loading ? <Loader2 className="animate-spin" /> : <Plug />} Tester et connecter
        </Button>
      </form>
    </>
  )
}

// ─── Petits composants ─────────────────────────────────────────────────────────

function SectionTitle({ n, title, desc }: { n: number; title: string; desc?: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid place-items-center w-7 h-7 rounded-full bg-marine text-white text-xs font-bold shrink-0">{n}</span>
      <div>
        <h2 className="font-heading font-semibold text-marine leading-7">{title}</h2>
        {desc && <p className="text-sm text-gray-500">{desc}</p>}
      </div>
    </div>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid place-items-center w-6 h-6 rounded-full bg-accent text-primary text-xs font-bold shrink-0 mt-0.5">{n}</span>
      <div className="min-w-0 flex-1 text-sm text-gray-600 space-y-1.5">
        <p className="font-semibold text-marine">{title}</p>
        {children}
      </div>
    </li>
  )
}

function Monogram({ platform: p }: { platform: Platform }) {
  return (
    <span
      className={`grid place-items-center w-10 h-10 rounded-xl text-white font-bold shrink-0 ${p.monogram.length > 1 ? 'text-[11px] tracking-wide' : 'text-base'}`}
      style={{ background: p.tint }}
    >
      {p.monogram}
    </span>
  )
}

function Choice<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string; hint?: string }[]
}) {
  return (
    <div className={`grid gap-2 ${options.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
      {options.map(o => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`rounded-xl border-2 px-3 py-2.5 text-left transition-colors ${active ? 'border-primary bg-accent' : 'border-gray-200 hover:border-gray-300'}`}
          >
            <span className={`block text-sm font-semibold ${active ? 'text-primary' : 'text-gray-800'}`}>{o.label}</span>
            {o.hint && <span className="block text-xs text-gray-500 mt-0.5">{o.hint}</span>}
          </button>
        )
      })}
    </div>
  )
}

function SwitchVisual({ checked }: { checked: boolean }) {
  return (
    <span role="switch" aria-checked={checked} className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-gray-300'}`}>
      <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
    </span>
  )
}

function Field({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} autoComplete="off" spellCheck={false} />
    </div>
  )
}

function Banner({ tone, children }: { tone: 'success' | 'error'; children: React.ReactNode }) {
  const cls = tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm flex items-start gap-2 ${cls}`}>
      {tone === 'success' ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
      <span>{children}</span>
    </div>
  )
}
