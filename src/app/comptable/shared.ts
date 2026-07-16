// Types et helpers partagés entre la page (serveur), MonthCard, MonthActions et
// la route d'envoi. Isolés ici pour éviter une dépendance circulaire entre les
// composants clients, et pour que serveur et client produisent les MÊMES fichiers.

export type MonthExpense = {
  id: string
  expense_date?: string | null
  supplier?: string | null
  category?: string | null
  amount_ht?: number | null
  vat_amount?: number | null
  amount_ttc?: number | null
  vat_rate?: number | null
  payment_method?: string | null
  ticket_number?: string | null
  notes?: string | null
  status: string
  storage_path?: string | null
  projects?: { title?: string } | null
}

export type MonthInvoice = {
  id: string
  invoice_number: string
  issue_date?: string | null
  subtotal_ht: number
  total_vat: number
  total_ttc: number
  status: string
  client_name: string
}

export type MonthSubInvoice = {
  id: string
  number: string
  issue_date?: string | null
  amount_ht: number | null
  amount_ttc: number | null
  status: string
  storage_path?: string | null
  company_name: string
}

export const num = (v: unknown) => Number(v) || 0
/** Une facture est « transmise » dès qu'elle n'est plus un brouillon. */
export const isSent = (s: string) => s !== 'brouillon'
export const isPaid = (s: string) => s === 'payee' || s === 'paye'
/** TVA d'une facture ST : déduite de TTC − HT (on ne la stocke pas séparément). */
export const subVat = (s: MonthSubInvoice) =>
  s.amount_ttc != null && s.amount_ht != null ? Math.max(0, s.amount_ttc - s.amount_ht) : 0

export const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

export function monthKey(d?: string | null): string | null {
  if (!d) return null
  const date = new Date(d)
  if (isNaN(date.getTime())) return null
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}
export function monthLabel(key: string): string {
  const [y, m] = key.split('-')
  return `${MONTHS[Number(m) - 1]} ${y}`
}

/* ─── Construction des fichiers pour la comptable ─────────────────────────── */

const esc = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v)
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const toCsv = (rows: unknown[][]) => rows.map(r => r.map(esc).join(';')).join('\n')

export const invoiceStatusFr: Record<string, string> = {
  brouillon: 'À préparer', envoyee: 'Envoyée', payee_partiellement: 'Paiement partiel',
  payee: 'Payée', en_retard: 'En retard', annulee: 'Annulée',
}

/** Achats = dépenses + factures de sous-traitance (le comptable veut les deux). */
export function depensesCsv(expenses: MonthExpense[], subInvoices: MonthSubInvoice[]): string {
  const rows: unknown[][] = [['Type', 'Date', 'Fournisseur', 'Catégorie', 'Montant HT', 'TVA', 'Montant TTC', 'Taux TVA', 'Paiement', 'N° pièce', 'Chantier', 'Justificatif', 'Note']]
  for (const e of expenses) {
    rows.push(['Dépense', e.expense_date || '', e.supplier || '', e.category || '',
      e.amount_ht ?? '', e.vat_amount ?? '', e.amount_ttc ?? '', e.vat_rate ?? '',
      e.payment_method || '', e.ticket_number || '', e.projects?.title || '',
      e.storage_path ? 'oui' : 'MANQUANT', e.notes || ''])
  }
  for (const i of subInvoices) {
    rows.push(['Sous-traitance', i.issue_date || '', i.company_name || '', 'Sous-traitance',
      i.amount_ht ?? '', subVat(i) || '', i.amount_ttc ?? '', '',
      '', i.number || '', '', i.storage_path ? 'oui' : 'MANQUANT', ''])
  }
  return toCsv(rows)
}

/** Ventes : avec client, HT et TVA (indispensables à la déclaration de TVA). */
export function facturesCsv(invoices: MonthInvoice[]): string {
  const rows: unknown[][] = [['Numéro', 'Date', 'Client', 'Montant HT', 'TVA', 'Montant TTC', 'Statut']]
  for (const i of invoices) {
    rows.push([i.invoice_number, i.issue_date || '', i.client_name || '',
      i.subtotal_ht, i.total_vat, i.total_ttc, invoiceStatusFr[i.status] || i.status])
  }
  return toCsv(rows)
}

export function tvaTotals(expenses: MonthExpense[], invoices: MonthInvoice[], subInvoices: MonthSubInvoice[]) {
  const collectee = invoices.filter(i => isSent(i.status)).reduce((t, i) => t + num(i.total_vat), 0)
  const deductible = expenses.reduce((t, e) => t + num(e.vat_amount), 0) + subInvoices.reduce((t, i) => t + subVat(i), 0)
  return { collectee, deductible, solde: collectee - deductible }
}

export function tvaCsv(expenses: MonthExpense[], invoices: MonthInvoice[], subInvoices: MonthSubInvoice[]): string {
  const { collectee, deductible, solde } = tvaTotals(expenses, invoices, subInvoices)
  return toCsv([
    ['Libellé', 'Montant'],
    ['TVA collectée (ventes)', collectee.toFixed(2)],
    ['TVA déductible (achats)', deductible.toFixed(2)],
    [solde >= 0 ? 'TVA à payer' : 'Crédit de TVA', Math.abs(solde).toFixed(2)],
  ])
}

export function safeName(s: string) {
  return (s || 'piece').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9.\-_ ]/g, '_').slice(0, 60).trim()
}
export function extOf(path: string) {
  const m = path.match(/\.([a-zA-Z0-9]+)$/)
  return m ? `.${m[1]}` : ''
}

/** Les justificatifs à joindre, avec un nom de fichier parlant pour la comptable. */
export function piecesOf(monthK: string, expenses: MonthExpense[], subInvoices: MonthSubInvoice[]) {
  return [
    ...expenses.filter(e => e.storage_path).map(e => ({
      path: e.storage_path as string,
      name: `${e.expense_date || monthK}-${safeName(e.supplier || 'depense')}-${num(e.amount_ttc).toFixed(2)}${extOf(e.storage_path as string)}`,
    })),
    ...subInvoices.filter(i => i.storage_path).map(i => ({
      path: i.storage_path as string,
      name: `${i.issue_date || monthK}-ST-${safeName(i.company_name || 'sous-traitant')}-${num(i.amount_ttc).toFixed(2)}${extOf(i.storage_path as string)}`,
    })),
  ]
}
