'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, ChevronRight, TrendingUp, Scale, FolderCheck, AlertTriangle } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import MonthActions, { type LastSend } from './MonthActions'
import { num, isSent, subVat, type MonthExpense, type MonthInvoice, type MonthSubInvoice } from './shared'

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
  const [focus, setFocus] = useState<Focus>(null)
  const toggle = (f: Focus) => setFocus(c => (c === f ? null : f))

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
          {/* CA − Achats = Marge : les opérateurs rendent le calcul évident.
              Largeur bornée pour que l'équation se lise d'un bloc sur grand écran. */}
          <div className="flex items-center gap-1 text-center max-w-2xl">
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
          <div className="flex items-center gap-1 text-center rounded-xl bg-gray-50 py-2.5 max-w-2xl">
            <div className="flex-1 min-w-0"><Figure label="Collectée" value={formatCurrency(s.tvaCollectee)} hint="sur tes ventes" small /></div>
            <Op>−</Op>
            <div className="flex-1 min-w-0"><Figure label="Déductible" value={formatCurrency(s.tvaDeductible)} hint="sur tes achats" small /></div>
            <Op>=</Op>
            <div className="flex-1 min-w-0">
              <Figure label={s.soldeTva >= 0 ? 'À payer' : 'Crédit de TVA'} value={formatCurrency(Math.abs(s.soldeTva))}
                hint={s.soldeTva >= 0 ? 'à reverser' : "l'État te doit"} small tone={s.soldeTva >= 0 ? 'text-[#C14E33]' : 'text-[#3F7A2E]'} />
            </div>
          </div>
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

        {/* Détail déplié */}
        {detail && (
          <div className="border-t border-gray-100 pt-3 space-y-1.5">
            {detail.kind === 'achats' && detail.exp.length === 0 && detail.sub.length === 0 && (
              <p className="text-sm text-gray-400 py-2 text-center">Rien à afficher ici.</p>
            )}
            {detail.kind === 'achats' && detail.exp.map(e => (
              <Row key={e.id} href="/depenses"
                title={e.supplier || 'Dépense'}
                sub={[e.expense_date ? formatDate(e.expense_date) : null, e.category, e.projects?.title].filter(Boolean).join(' · ')}
                amount={formatCurrency(num(e.amount_ht))}
                warn={!e.storage_path ? 'sans justificatif' : e.status === 'a_verifier' ? 'à vérifier' : undefined} />
            ))}
            {detail.kind === 'achats' && detail.sub.map(i => (
              <Row key={i.id} href="/sous-traitants"
                title={i.company_name || 'Sous-traitant'}
                sub={[i.issue_date ? formatDate(i.issue_date) : null, i.number ? `N° ${i.number}` : null, 'sous-traitance'].filter(Boolean).join(' · ')}
                amount={formatCurrency(num(i.amount_ht))}
                warn={!i.storage_path ? 'sans justificatif' : undefined} />
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

function SectionTitle({ icon, title, note }: { icon: React.ReactNode; title: string; note?: string }) {
  return (
    <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-gray-500">
      {icon} {title}
      {note && <span className="font-normal text-gray-400">({note})</span>}
    </div>
  )
}

function Figure({ label, value, hint, onClick, active, tone, small }: {
  label: string; value: string; hint?: string; onClick?: () => void; active?: boolean; tone?: string; small?: boolean
}) {
  const content = (
    <>
      <p className="text-[10px] text-gray-400">{label}</p>
      <p className={`font-bold tabular-nums ${small ? 'text-sm' : 'text-base'} ${tone || 'text-marine'}`}>{value}</p>
      {hint && <p className="text-[10px] text-gray-400">{hint}</p>}
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

function Row({ href, title, sub, amount, warn }: { href: string; title: string; sub?: string; amount: string; warn?: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-gray-50 transition-colors">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-800 truncate">{title}</p>
        {sub && <p className="text-[11px] text-gray-400 truncate">{sub}</p>}
      </div>
      {warn && <Badge className="bg-amber-50 text-amber-700 border-0 text-[10px] flex-shrink-0">{warn}</Badge>}
      <span className="text-sm font-semibold text-gray-900 tabular-nums flex-shrink-0">{amount}</span>
      <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
    </Link>
  )
}
