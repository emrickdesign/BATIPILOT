'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, TrendingUp, Scale, FolderCheck, AlertTriangle, Copy, ExternalLink, FileSpreadsheet, Check, Paperclip, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatDate } from '@/lib/utils'
import MonthActions, { type LastSend } from './MonthActions'
import { num, isSent, subVat, ca3, type Ca3, type MonthExpense, type MonthInvoice, type MonthSubInvoice } from './shared'

type Focus = 'ca' | 'achats' | 'a_verifier' | 'justif' | null

export default function MonthCard({
  monthKey, label, expenses, invoices, subInvoices, index, lastSend, accountantEmail,
}: {
  monthKey: string; label: string
  expenses: MonthExpense[]; invoices: MonthInvoice[]; subInvoices: MonthSubInvoice[]
  index: number
  lastSend: LastSend
  accountantEmail: string
}) {
  const router = useRouter()
  const [focus, setFocus] = useState<Focus>(null)
  const [showCa3, setShowCa3] = useState(false)
  const toggle = (f: Focus) => setFocus(c => (c === f ? null : f))
  const declaration = useMemo(() => ca3(expenses, invoices, subInvoices), [expenses, invoices, subInvoices])

  // Actions directes depuis le dossier : valider une dépense, joindre un justificatif.
  const fileRef = useRef<HTMLInputElement>(null)
  const [target, setTarget] = useState<{ kind: 'expense' | 'sub'; id: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  async function validateExpense(id: string) {
    setBusy(id)
    const { error } = await createClient().from('expenses').update({ status: 'valide' }).eq('id', id)
    setBusy(null)
    if (error) { toast.error('Erreur'); return }
    toast.success('Dépense validée')
    router.refresh()
  }

  function askJustificatif(kind: 'expense' | 'sub', id: string) {
    setTarget({ kind, id })
    fileRef.current?.click()
  }

  async function uploadJustificatif(file: File) {
    if (!target) return
    setBusy(target.id)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { toast.error('Non connecté'); return }
      // La policy storage exige l'user_id en 2e segment du chemin.
      const safe = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')
      const prefix = target.kind === 'expense' ? 'tickets' : 'st'
      const path = `${prefix}/${user.id}/${Date.now()}-${safe}`
      const { error: upErr } = await supabase.storage.from('documents').upload(path, file, { contentType: file.type || undefined, upsert: false })
      if (upErr) { toast.error('Erreur envoi du fichier'); return }
      const table = target.kind === 'expense' ? 'expenses' : 'subcontractor_invoices'
      const { error } = await supabase.from(table).update({ storage_path: path }).eq('id', target.id)
      if (error) { toast.error('Erreur enregistrement'); return }
      toast.success('Justificatif ajouté — TVA déductible')
      router.refresh()
    } finally {
      setBusy(null); setTarget(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const s = useMemo(() => {
    const sent = invoices.filter(i => isSent(i.status))
    // On compare des HT entre eux : le TTC et la TVA ne sont pas comparables au CA.
    const caHt = sent.reduce((t, i) => t + num(i.subtotal_ht), 0)
    const achatsHt = expenses.reduce((t, e) => t + num(e.amount_ht), 0) + subInvoices.reduce((t, i) => t + num(i.amount_ht), 0)
    const tvaCollectee = sent.reduce((t, i) => t + num(i.total_vat), 0)
    const tvaDeductible = expenses.reduce((t, e) => t + num(e.vat_amount), 0) + subInvoices.reduce((t, i) => t + subVat(i), 0)
    const marge = caHt - achatsHt
    return {
      caHt, achatsHt, marge,
      margePct: caHt > 0 ? Math.round((marge / caHt) * 100) : 0,
      nbFactures: sent.length,
      nbPieces: expenses.length + subInvoices.length,
      nbSousTraitance: subInvoices.length,
      tvaCollectee, tvaDeductible, soldeTva: tvaCollectee - tvaDeductible,
      aVerifier: expenses.filter(e => e.status === 'a_verifier').length,
      justifManquants: expenses.filter(e => !e.storage_path).length + subInvoices.filter(i => !i.storage_path).length,
      // TVA incluse dans le déductible mais non sécurisée : sans la pièce, elle est perdue.
      tvaSansJustif: expenses.filter(e => !e.storage_path).reduce((t, e) => t + num(e.vat_amount), 0)
        + subInvoices.filter(i => !i.storage_path).reduce((t, i) => t + subVat(i), 0),
    }
  }, [expenses, invoices, subInvoices])

  const detail = useMemo(() => {
    switch (focus) {
      case 'ca': return { kind: 'ventes' as const, inv: invoices.filter(i => isSent(i.status)) }
      case 'achats': return { kind: 'achats' as const, exp: expenses, sub: subInvoices }
      case 'a_verifier': return { kind: 'achats' as const, exp: expenses.filter(e => e.status === 'a_verifier'), sub: [] }
      case 'justif': return { kind: 'achats' as const, exp: expenses.filter(e => !e.storage_path), sub: subInvoices.filter(i => !i.storage_path) }
      default: return null
    }
  }, [focus, expenses, invoices, subInvoices])

  const pret = s.aVerifier === 0 && s.justifManquants === 0

  return (
    <Card className="border border-gray-200/80 bg-white animate-fade-up" style={{ animationDelay: `${index * 50}ms` }}>
      <CardContent className="p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-lg font-heading font-bold text-marine capitalize">{label}</h2>
            {lastSend && (
              <Badge className="bg-[#E9F2DB] text-[#3F7A2E] border-0 gap-1 text-xs" title={`Envoyé à ${lastSend.to_email}`}>
                <CheckCircle2 className="w-3 h-3" /> envoyé le {formatDate(lastSend.sent_at)}
              </Badge>
            )}
          </div>
          <MonthActions monthKey={monthKey} label={label} expenses={expenses} invoices={invoices}
            subInvoices={subInvoices} lastSend={lastSend} accountantEmail={accountantEmail} />
        </div>

        {/* 1 — Comment s'est passé mon mois ? */}
        <section>
          <SectionTitle icon={<TrendingUp className="w-3.5 h-3.5" />} title="Mon mois" note="hors taxes" />
          {/* CA − Achats = Marge : les opérateurs rendent le calcul évident */}
          <div className="flex items-center gap-2 text-center">
            <div className="flex-1 min-w-0">
              <Figure label="Chiffre d'affaires" value={formatCurrency(s.caHt)} hint={`${s.nbFactures} facture${s.nbFactures > 1 ? 's' : ''}`}
                onClick={() => toggle('ca')} active={focus === 'ca'} />
            </div>
            <Op>−</Op>
            <div className="flex-1 min-w-0">
              <Figure label="Achats" value={formatCurrency(s.achatsHt)}
                hint={`${s.nbPieces} pièce${s.nbPieces > 1 ? 's' : ''}${s.nbSousTraitance > 0 ? ` · dont ${s.nbSousTraitance} ST` : ''}`}
                onClick={() => toggle('achats')} active={focus === 'achats'} />
            </div>
            <Op>=</Op>
            <div className="flex-1 min-w-0">
              <Figure label="Marge" value={formatCurrency(s.marge)} hint={s.caHt > 0 ? `${s.margePct} %` : '—'}
                tone={s.marge >= 0 ? 'text-[#3F7A2E]' : 'text-[#C14E33]'} />
            </div>
          </div>
        </section>

        {/* 2 — Qu'est-ce que je dois à l'État ? */}
        <section>
          <SectionTitle icon={<Scale className="w-3.5 h-3.5" />} title="Ma TVA" note="l'argent de l'État, pas le tien" />
          <div className="flex items-center gap-2 text-center rounded-xl bg-gray-50 py-2.5 px-2">
            <div className="flex-1 min-w-0"><Figure label="Collectée" value={formatCurrency(s.tvaCollectee)} hint="sur tes ventes" small /></div>
            <Op>−</Op>
            <div className="flex-1 min-w-0">
              <Figure label="Déductible" value={formatCurrency(s.tvaDeductible)} small
                hint={s.tvaSansJustif > 0 ? `dont ${formatCurrency(s.tvaSansJustif)} sans justificatif` : 'sur tes achats'}
                hintTone={s.tvaSansJustif > 0 ? 'text-amber-600 font-medium' : undefined} />
            </div>
            <Op>=</Op>
            <div className="flex-1 min-w-0">
              <Figure label={s.soldeTva >= 0 ? 'À payer' : 'Crédit de TVA'} value={formatCurrency(Math.abs(s.soldeTva))}
                hint={s.soldeTva >= 0 ? 'à reverser' : "l'État te doit"} small tone={s.soldeTva >= 0 ? 'text-[#C14E33]' : 'text-[#3F7A2E]'} />
            </div>
          </div>
          <button onClick={() => setShowCa3(v => !v)}
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
            <FileSpreadsheet className="w-3.5 h-3.5" />
            {showCa3 ? 'Masquer ma déclaration (CA3)' : 'Déclarer ma TVA — voir les cases de la CA3'}
          </button>
          {showCa3 && <Ca3Block c={declaration} justifManquants={s.justifManquants} tvaSansJustif={s.tvaSansJustif} />}
        </section>

        {/* 3 — Mon dossier est-il prêt à partir ? */}
        <section>
          <SectionTitle icon={<FolderCheck className="w-3.5 h-3.5" />} title="Mon dossier" />
          <div className="flex items-center gap-2 flex-wrap mb-3">
            {pret ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#3F7A2E]">
                <CheckCircle2 className="w-3.5 h-3.5" /> Prêt à envoyer — {s.nbPieces} pièce(s), {s.nbFactures} facture(s)
              </span>
            ) : (
              <>
                <span className="text-xs text-gray-500">{s.nbPieces} pièce(s), {s.nbFactures} facture(s) —</span>
                {s.aVerifier > 0 && (
                  <button onClick={() => toggle('a_verifier')}>
                    <Badge className="bg-amber-100 text-amber-700 border-0 gap-1 text-xs hover:bg-amber-200 transition-colors">
                      <AlertTriangle className="w-3 h-3" /> {s.aVerifier} à vérifier
                    </Badge>
                  </button>
                )}
                {s.justifManquants > 0 && (
                  <button onClick={() => toggle('justif')}>
                    <Badge className="bg-amber-100 text-amber-700 border-0 gap-1 text-xs hover:bg-amber-200 transition-colors">
                      <AlertTriangle className="w-3 h-3" /> {s.justifManquants} justificatif(s) manquant(s) — TVA non déductible
                    </Badge>
                  </button>
                )}
              </>
            )}
          </div>
        </section>

        {/* Détail déplié — avec les actions pour débloquer le dossier sur place */}
        {detail && (
          <div className="border-t border-gray-100 pt-3 space-y-1.5">
            <input ref={fileRef} type="file" accept="image/*,.pdf,.png,.jpg,.jpeg,.webp" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadJustificatif(f) }} />

            {detail.kind === 'achats' && detail.exp.length === 0 && detail.sub.length === 0 && (
              <p className="text-sm text-gray-400 py-2 text-center">Rien à afficher ici.</p>
            )}
            {detail.kind === 'achats' && detail.exp.map(e => (
              <Row key={e.id}
                title={e.supplier || 'Dépense'}
                sub={[e.expense_date ? formatDate(e.expense_date) : null, e.category, e.projects?.title].filter(Boolean).join(' · ')}
                amount={formatCurrency(num(e.amount_ht))}
                busy={busy === e.id}
                onValidate={e.status === 'a_verifier' ? () => validateExpense(e.id) : undefined}
                onAttach={!e.storage_path ? () => askJustificatif('expense', e.id) : undefined} />
            ))}
            {detail.kind === 'achats' && detail.sub.map(i => (
              <Row key={i.id}
                title={i.company_name || 'Sous-traitant'}
                sub={[i.issue_date ? formatDate(i.issue_date) : null, i.number ? `N° ${i.number}` : null, 'sous-traitance'].filter(Boolean).join(' · ')}
                amount={formatCurrency(num(i.amount_ht))}
                busy={busy === i.id}
                onAttach={!i.storage_path ? () => askJustificatif('sub', i.id) : undefined} />
            ))}
            {detail.kind === 'ventes' && (detail.inv.length === 0
              ? <p className="text-sm text-gray-400 py-2 text-center">Aucune facture ici.</p>
              : detail.inv.map(i => (
                <Row key={i.id} href={`/factures/${i.id}`}
                  title={`${i.invoice_number}${i.client_name ? ` — ${i.client_name}` : ''}`}
                  sub={[i.issue_date ? formatDate(i.issue_date) : null, `TVA ${formatCurrency(i.total_vat)}`].filter(Boolean).join(' · ')}
                  amount={formatCurrency(i.subtotal_ht)} />
              )))}
            <p className="text-[11px] text-gray-400 text-center pt-1">Montants affichés hors taxes.</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/** Les cases de la CA3, prêtes à recopier sur impots.gouv (le portail ne peut pas
 *  être pré-rempli : c'est un espace authentifié sans paramètres d'URL). */
function Ca3Block({ c, justifManquants, tvaSansJustif }: { c: Ca3; justifManquants: number; tvaSansJustif: number }) {
  const rows: { code: string; label: string; base?: number; tva?: number; strong?: boolean }[] = []
  rows.push({ code: '01', label: 'Montant des opérations réalisées (HT)', base: c.baseTotal })
  if (c.t20.base > 0) rows.push({ code: '08', label: 'Taux normal 20 %', base: c.t20.base, tva: c.t20.tva })
  if (c.t10.base > 0) rows.push({ code: '9B', label: 'Taux réduit 10 % (rénovation)', base: c.t10.base, tva: c.t10.tva })
  if (c.t55.base > 0) rows.push({ code: '09', label: 'Taux réduit 5,5 % (rénovation énergétique)', base: c.t55.base, tva: c.t55.tva })
  rows.push({ code: '16', label: 'Total TVA brute due', tva: c.tvaBrute, strong: true })
  rows.push({ code: '20', label: 'TVA déductible — autres biens et services', tva: c.deductible })
  rows.push({ code: '23', label: 'Total TVA déductible', tva: c.deductible, strong: true })
  rows.push({
    code: c.net >= 0 ? '28' : '25',
    label: c.net >= 0 ? 'TVA nette due (à payer)' : 'Crédit de TVA',
    tva: Math.abs(c.net), strong: true,
  })

  return (
    <div className="mt-2 rounded-xl border border-gray-200/80 p-3 max-w-2xl">
      <p className="text-[11px] text-gray-500 mb-2">
        Formulaire <strong>CA3 n°3310</strong> — clique un montant pour le copier, puis colle-le dans la case correspondante.
        Montants arrondis à l&apos;euro, comme l&apos;attend l&apos;administration.
      </p>
      <div className="hidden sm:flex items-center gap-3 text-[10px] text-gray-400 pb-1 border-b border-gray-100">
        <span className="w-9">Case</span><span className="flex-1">Libellé</span>
        <span className="w-24 text-right">Base HT</span><span className="w-24 text-right">TVA</span>
      </div>
      {rows.map(r => (
        <div key={r.code + r.label} className="flex items-center gap-3 py-1.5 border-b border-gray-100 last:border-0">
          <span className="w-9 font-mono text-xs font-bold text-primary flex-shrink-0">{r.code}</span>
          <span className={`flex-1 min-w-0 text-xs truncate ${r.strong ? 'font-semibold text-gray-700' : 'text-gray-500'}`}>{r.label}</span>
          <span className="w-24 text-right">{r.base !== undefined ? <CopyAmount value={r.base} /> : <span className="text-gray-300">—</span>}</span>
          <span className="w-24 text-right">{r.tva !== undefined ? <CopyAmount value={r.tva} strong={r.strong} /> : <span className="text-gray-300">—</span>}</span>
        </div>
      ))}

      {c.autresTaux.length > 0 && (
        <p className="text-[11px] text-amber-700 mt-2">
          ⚠︎ Tu as aussi des ventes à {c.autresTaux.map(t => `${t.taux} %`).join(', ')} : elles ont leur propre case sur la CA3, demande à ta comptable.
        </p>
      )}
      {c.nonVentile.nb > 0 && (
        <p className="text-[11px] text-red-600 mt-2">
          ⚠︎ {c.nonVentile.nb} facture(s) au taux indéterminé ({formatCurrency(c.nonVentile.base)} HT) : leur TVA ne correspond à aucun taux légal et elles n&apos;ont pas de lignes détaillées. Elles sont comptées dans les totaux (16/23/28) mais <strong>pas ventilées</strong> dans les cases par taux — corrige-les avant de déclarer.
        </p>
      )}
      <p className="text-[11px] text-gray-400 mt-2">
        Tout le déductible est porté en case 20. Si tu as acheté du matériel durable (véhicule, outillage lourd), une part va en <strong>case 19 (immobilisations)</strong> — ta comptable saura trancher.
      </p>
      {justifManquants > 0 && (
        <p className="text-[11px] text-amber-700 mt-1">
          ⚠︎ {justifManquants} justificatif(s) manquant(s), soit <strong>{formatCurrency(tvaSansJustif)}</strong> de TVA inclus dans la case 20 mais <strong>non déductibles</strong> en l&apos;état. Ajoute les pièces avant de déclarer, sinon retire ce montant.
        </p>
      )}
      <a href="https://www.impots.gouv.fr/professionnel" target="_blank" rel="noopener noreferrer" className="inline-block mt-3">
        <Button size="sm" variant="outline" className="gap-1.5">
          <ExternalLink className="w-3.5 h-3.5" /> Ouvrir impots.gouv.fr
        </Button>
      </a>
    </div>
  )
}

function CopyAmount({ value, strong }: { value: number; strong?: boolean }) {
  const rounded = Math.round(value)
  return (
    <button type="button" title="Copier ce montant"
      onClick={() => {
        navigator.clipboard.writeText(String(rounded))
        toast.success(`${rounded.toLocaleString('fr-FR')} € copié`)
      }}
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs tabular-nums transition-colors hover:bg-accent/60 ${strong ? 'font-bold text-marine' : 'font-medium text-gray-700'}`}>
      {rounded.toLocaleString('fr-FR')}
      <Copy className="w-3 h-3 text-gray-400" />
    </button>
  )
}

function SectionTitle({ icon, title, note }: { icon: React.ReactNode; title: string; note?: string }) {
  return (
    <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-gray-500">
      {icon} {title}
      {note && <span className="font-normal text-gray-400">({note})</span>}
    </div>
  )
}

function Figure({ label, value, hint, onClick, active, tone, small, hintTone }: {
  label: string; value: string; hint?: string; onClick?: () => void; active?: boolean; tone?: string; small?: boolean; hintTone?: string
}) {
  // Le libellé porte l'accent (+ filet orange) : on doit comprendre CE QUE C'EST
  // avant de lire le chiffre.
  const content = (
    <>
      <p className={`font-semibold text-gray-700 leading-tight ${small ? 'text-xs' : 'text-[13px]'}`}>{label}</p>
      <span className="mx-auto mt-1 block h-0.5 w-6 rounded-full bg-primary/70" />
      <p className={`font-semibold tabular-nums mt-1 ${small ? 'text-sm' : 'text-base'} ${tone || 'text-marine'}`}>{value}</p>
      {hint && <p className={`text-[10px] mt-0.5 ${hintTone || 'text-gray-400'}`}>{hint}</p>}
    </>
  )
  if (!onClick) return <div className="py-1 w-full">{content}</div>
  return (
    <button type="button" onClick={onClick}
      className={`w-full rounded-lg py-1 transition-colors ${active ? 'bg-accent/60 ring-1 ring-primary/30' : 'hover:bg-gray-50'}`}>
      {content}
    </button>
  )
}

/** Opérateur (− / =) intercalé entre deux chiffres pour rendre le calcul lisible. */
function Op({ children }: { children: React.ReactNode }) {
  return <span className="px-1 text-2xl font-medium text-gray-400 select-none flex-shrink-0 leading-none">{children}</span>
}

/** Ligne de détail : les actions sont ici, pour débloquer le dossier sans naviguer. */
function Row({ href, title, sub, amount, busy, onValidate, onAttach }: {
  href?: string; title: string; sub?: string; amount: string
  busy?: boolean; onValidate?: () => void; onAttach?: () => void
}) {
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-800 truncate">{title}</p>
        {sub && <p className="text-[11px] text-gray-400 truncate">{sub}</p>}
      </div>
      <span className="text-sm font-semibold text-gray-900 tabular-nums flex-shrink-0">{amount}</span>
    </>
  )
  return (
    <div className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-gray-50 transition-colors">
      {href ? <a href={href} className="flex items-center gap-3 flex-1 min-w-0">{body}</a> : body}
      {onValidate && (
        <Button size="sm" variant="success" className="gap-1 flex-shrink-0" onClick={onValidate} disabled={busy}>
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Valider
        </Button>
      )}
      {onAttach && (
        <Button size="sm" variant="outline" className="gap-1 flex-shrink-0 border-amber-300 text-amber-700 hover:bg-amber-50" onClick={onAttach} disabled={busy}>
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />} Ajouter le justificatif
        </Button>
      )}
    </div>
  )
}
