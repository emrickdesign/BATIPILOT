import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, Receipt, Send, Coins, AlertTriangle, Banknote } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { clientDisplayName } from '@/lib/clients'
import StatCard, { type StatTone } from '@/components/charts/StatCard'
import FacturesKanban from './FacturesKanban'
import { factureCol, type FactureCardData } from './kanban-config'

const num = (v: unknown) => Number(v) || 0
const today = new Date().toISOString().split('T')[0]

type Disp = 'brouillon' | 'envoyee' | 'payee_partiellement' | 'payee' | 'en_retard' | 'annulee'

function displayStatus(inv: { status: string; due_date?: string | null }): Disp {
  if ((inv.status === 'envoyee' || inv.status === 'payee_partiellement') && inv.due_date && inv.due_date < today) return 'en_retard'
  return inv.status as Disp
}
function badgeFor(inv: { status: string; due_date?: string | null }): { label: string; cls: string } | null {
  if (displayStatus(inv) === 'en_retard') return { label: 'En retard', cls: 'bg-[#FBE0DA] text-[#C0392B]' }
  return null
}
function ctaFor(inv: { status: string; due_date?: string | null }): string {
  switch (displayStatus(inv)) {
    case 'brouillon': return 'Finaliser et envoyer'
    case 'en_retard': return 'Relancer le client'
    case 'envoyee': return 'Suivre le paiement'
    case 'payee_partiellement': return 'Encaisser le solde'
    default: return ''
  }
}

export default async function FacturesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: invoices } = await supabase
    .from('invoices').select('*, clients(first_name, last_name, company_name, type)')
    .eq('user_id', user.id).order('created_at', { ascending: false })

  const all = invoices || []

  // Cartes (§8.2)
  const notCancelled = all.filter(i => i.status !== 'annulee')
  const factEnvoyees = notCancelled.filter(i => i.status !== 'brouillon').reduce((s, i) => s + num(i.total_ttc), 0)
  const encaisse = notCancelled.reduce((s, i) => s + (num(i.total_ttc) - num(i.amount_due)), 0)
  const open = all.filter(i => ['envoyee', 'payee_partiellement', 'en_retard'].includes(i.status))
  const reste = open.reduce((s, i) => s + (num(i.amount_due) || num(i.total_ttc)), 0)
  const enRetard = all.filter(i => displayStatus(i) === 'en_retard')
  const retardMontant = enRetard.reduce((s, i) => s + (num(i.amount_due) || num(i.total_ttc)), 0)

  // Logique couleur (cf src/lib/statColors.ts) : bleu = information neutre, vert = déjà encaissé,
  // orange = reste à obtenir, rouge = urgent/en retard.
  const cards: { label: string; value: string; icon: typeof Send; tone: StatTone; note?: string }[] = [
    { label: 'Factures envoyées', value: formatCurrency(factEnvoyees), icon: Send, tone: 'coral' },
    { label: 'Encaissé', value: formatCurrency(encaisse), icon: Banknote, tone: 'green' },
    { label: 'Reste à encaisser', value: formatCurrency(reste), icon: Coins, tone: 'amber' },
    { label: 'En retard', value: formatCurrency(retardMontant), icon: AlertTriangle, tone: 'red', note: `${enRetard.length} facture${enRetard.length > 1 ? 's' : ''}` },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Mes factures</h1>
        <Link href="/factures/nouveau">
          <Button className="h-10 gap-2"><Plus className="w-4 h-4" /> Créer une facture</Button>
        </Link>
      </div>

      {/* Cartes (§8.2) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map(c => (
          <StatCard key={c.label} label={c.label} value={c.value} icon={c.icon} tone={c.tone} note={c.note} />
        ))}
      </div>

      {!all.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Receipt className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="font-medium text-gray-700">Aucune facture pour l&apos;instant</p>
            <p className="text-sm text-gray-500 mt-1 mb-4">Transformez un devis accepté en facture, ou créez-en une directement</p>
            <Link href="/factures/nouveau"><Button>Créer une facture</Button></Link>
          </CardContent>
        </Card>
      ) : (
        <FacturesKanban initialItems={all.map((inv): FactureCardData => ({
          id: inv.id,
          col: factureCol(inv.status),
          number: inv.invoice_number,
          clientName: inv.clients ? clientDisplayName(inv.clients) : 'Sans client',
          amountFmt: formatCurrency(inv.total_ttc),
          resteFmt: num(inv.amount_due) > 0 ? `Reste ${formatCurrency(inv.amount_due)}` : 'Soldée',
          outstanding: num(inv.amount_due) > 0,
          dueFmt: inv.due_date ? formatDate(inv.due_date) : null,
          dateFmt: formatDate(inv.issue_date),
          badge: badgeFor(inv),
          cta: ctaFor(inv),
        }))} />
      )}
    </div>
  )
}
