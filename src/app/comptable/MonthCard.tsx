'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ReceiptText, FileWarning, Send, CheckCircle2, Wallet, FileText, Handshake, ChevronRight, Scale } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import MonthActions, { type LastSend } from './MonthActions'
import { num, isSent, isPaid, subVat, type MonthExpense, type MonthInvoice, type MonthSubInvoice } from './shared'

type Focus = 'achats' | 'a_verifier' | 'justif' | 'envoye' | 'factures' | 'paiements' | 'soustraitance' | null

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
    const totalDepenses = expenses.reduce((t, e) => t + num(e.amount_ttc), 0)
    const totalSousTraitance = subInvoices.reduce((t, i) => t + num(i.amount_ttc), 0)
    const tvaCollectee = invoices.filter(i => isSent(i.status)).reduce((t, i) => t + num(i.total_vat), 0)
    const tvaDeductible = expenses.reduce((t, e) => t + num(e.vat_amount), 0) + subInvoices.reduce((t, i) => t + subVat(i), 0)
    return {
      nbPieces: expenses.length + subInvoices.length,
      totalAchats: totalDepenses + totalSousTraitance,
      totalSousTraitance,
      aVerifier: expenses.filter(e => e.status === 'a_verifier').length,
      justifManquants: expenses.filter(e => !e.storage_path).length + subInvoices.filter(i => !i.storage_path).length,
      envoyeCompta: expenses.filter(e => e.status === 'envoye_comptable').length,
      facturesTransmises: invoices.filter(i => isSent(i.status)).length,
      paiementsDetectes: invoices.filter(i => isPaid(i.status)).length,
      tvaCollectee, tvaDeductible, soldeTva: tvaCollectee - tvaDeductible,
    }
  }, [expenses, invoices, subInvoices])

  // Lignes affichées selon le chiffre cliqué
  const detail = useMemo(() => {
    switch (focus) {
      case 'achats': return { kind: 'achats' as const, exp: expenses, sub: subInvoices }
      case 'a_verifier': return { kind: 'achats' as const, exp: expenses.filter(e => e.status === 'a_verifier'), sub: [] }
      case 'justif': return { kind: 'achats' as const, exp: expenses.filter(e => !e.storage_path), sub: subInvoices.filter(i => !i.storage_path) }
      case 'envoye': return { kind: 'achats' as const, exp: expenses.filter(e => e.status === 'envoye_comptable'), sub: [] }
      case 'soustraitance': return { kind: 'achats' as const, exp: [], sub: subInvoices }
      case 'factures': return { kind: 'ventes' as const, inv: invoices.filter(i => isSent(i.status)) }
      case 'paiements': return { kind: 'ventes' as const, inv: invoices.filter(i => isPaid(i.status)) }
      default: return null
    }
  }, [focus, expenses, invoices, subInvoices])

  return (
    <Card className="border border-gray-200/80 bg-white animate-fade-up" style={{ animationDelay: `${index * 50}ms` }}>
      <CardContent className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-lg font-heading font-bold text-marine capitalize">{label}</h2>
            {s.justifManquants > 0 && (
              <button onClick={() => toggle('justif')}>
                <Badge className="bg-amber-100 text-amber-700 border-0 gap-1 text-xs hover:bg-amber-200 transition-colors">
                  <FileWarning className="w-3 h-3" /> {s.justifManquants} justificatif{s.justifManquants > 1 ? 's' : ''} manquant{s.justifManquants > 1 ? 's' : ''}
                </Badge>
              </button>
            )}
            {lastSend && (
              <Badge className="bg-[#E9F2DB] text-[#3F7A2E] border-0 gap-1 text-xs" title={`Envoyé à ${lastSend.to_email}`}>
                <CheckCircle2 className="w-3 h-3" /> envoyé à la compta
              </Badge>
            )}
          </div>
          <MonthActions monthKey={monthKey} label={label} expenses={expenses} invoices={invoices}
            subInvoices={subInvoices} lastSend={lastSend} accountantEmail={accountantEmail} />
        </div>

        {/* Chiffres cliquables */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Stat icon={ReceiptText} value={String(s.nbPieces)} label="pièces d'achat" tone="bg-[#FCE7DE] text-[#C14E33]" active={focus === 'achats'} onClick={() => toggle('achats')} />
          <Stat icon={Wallet} value={formatCurrency(s.totalAchats)} label="total achats TTC" tone="bg-accent text-primary" active={focus === 'achats'} onClick={() => toggle('achats')} />
          <Stat icon={FileWarning} value={String(s.aVerifier)} label="à vérifier" tone="bg-amber-100 text-amber-600" active={focus === 'a_verifier'} onClick={() => toggle('a_verifier')} />
          <Stat icon={Send} value={String(s.envoyeCompta)} label="envoyés compta" tone="bg-[#F3E5D6] text-[#8A4B24]" active={focus === 'envoye'} onClick={() => toggle('envoye')} />
          <Stat icon={FileText} value={String(s.facturesTransmises)} label="factures transmises" tone="bg-[#EFE7DA] text-[#8A5A2A]" active={focus === 'factures'} onClick={() => toggle('factures')} />
          <Stat icon={CheckCircle2} value={String(s.paiementsDetectes)} label="paiements détectés" tone="bg-[#E9F2DB] text-[#3F7A2E]" active={focus === 'paiements'} onClick={() => toggle('paiements')} />
        </div>

        {subInvoices.length > 0 && (
          <div className="mt-3">
            <Stat icon={Handshake} value={formatCurrency(s.totalSousTraitance)} label={`sous-traitance (${subInvoices.length})`} tone="bg-[#E7EEF6] text-[#2F5C8A]" active={focus === 'soustraitance'} onClick={() => toggle('soustraitance')} />
          </div>
        )}

        {/* Récap TVA du mois */}
        <div className="mt-4 rounded-xl bg-gray-50 p-3">
          <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-gray-500">
            <Scale className="w-3.5 h-3.5" /> TVA du mois
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-[10px] text-gray-400">Collectée (ventes)</p>
              <p className="text-sm font-semibold text-gray-800 tabular-nums">{formatCurrency(s.tvaCollectee)}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400">Déductible (achats)</p>
              <p className="text-sm font-semibold text-gray-800 tabular-nums">{formatCurrency(s.tvaDeductible)}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400">{s.soldeTva >= 0 ? 'À payer' : 'Crédit de TVA'}</p>
              <p className={`text-sm font-bold tabular-nums ${s.soldeTva >= 0 ? 'text-[#C14E33]' : 'text-[#3F7A2E]'}`}>{formatCurrency(Math.abs(s.soldeTva))}</p>
            </div>
          </div>
          {s.justifManquants > 0 && (
            <p className="text-[11px] text-amber-700 mt-2">⚠︎ {s.justifManquants} pièce(s) sans justificatif : cette TVA n&apos;est pas déductible tant que le justificatif manque.</p>
          )}
        </div>

        {/* Détail déplié */}
        {detail && (
          <div className="mt-4 border-t border-gray-100 pt-3 space-y-1.5">
            {detail.kind === 'achats' && detail.exp.length === 0 && detail.sub.length === 0 && (
              <p className="text-sm text-gray-400 py-2 text-center">Rien à afficher ici.</p>
            )}
            {detail.kind === 'achats' && detail.exp.map(e => (
              <Row key={e.id} href="/depenses"
                title={e.supplier || 'Dépense'}
                sub={[e.expense_date ? formatDate(e.expense_date) : null, e.category, e.projects?.title].filter(Boolean).join(' · ')}
                amount={formatCurrency(num(e.amount_ttc))}
                warn={!e.storage_path ? 'sans justificatif' : e.status === 'a_verifier' ? 'à vérifier' : undefined} />
            ))}
            {detail.kind === 'achats' && detail.sub.map(i => (
              <Row key={i.id} href="/sous-traitants"
                title={i.company_name || 'Sous-traitant'}
                sub={[i.issue_date ? formatDate(i.issue_date) : null, i.number ? `N° ${i.number}` : null, 'sous-traitance'].filter(Boolean).join(' · ')}
                amount={formatCurrency(num(i.amount_ttc))}
                warn={!i.storage_path ? 'sans justificatif' : undefined} />
            ))}
            {detail.kind === 'ventes' && (detail.inv.length === 0
              ? <p className="text-sm text-gray-400 py-2 text-center">Aucune facture ici.</p>
              : detail.inv.map(i => (
                <Row key={i.id} href={`/factures/${i.id}`}
                  title={`${i.invoice_number}${i.client_name ? ` — ${i.client_name}` : ''}`}
                  sub={[i.issue_date ? formatDate(i.issue_date) : null, `HT ${formatCurrency(i.subtotal_ht)}`, `TVA ${formatCurrency(i.total_vat)}`].filter(Boolean).join(' · ')}
                  amount={formatCurrency(i.total_ttc)} />
              )))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Stat({ icon: Icon, value, label, tone, active, onClick }: {
  icon: typeof Wallet; value: string; label: string; tone: string; active?: boolean; onClick?: () => void
}) {
  return (
    <button type="button" onClick={onClick}
      className={`flex items-center gap-2.5 rounded-lg p-1.5 -m-1.5 text-left transition-colors ${active ? 'bg-accent/60 ring-1 ring-primary/30' : 'hover:bg-gray-50'}`}>
      <span className={`grid place-items-center w-9 h-9 rounded-lg flex-shrink-0 ${tone}`}><Icon className="w-4 h-4" /></span>
      <div className="min-w-0">
        <div className="text-base font-bold text-marine leading-none">{value}</div>
        <div className="text-[11px] text-gray-500 leading-tight mt-0.5">{label}</div>
      </div>
    </button>
  )
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
