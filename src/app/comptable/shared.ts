// Types et helpers partagés entre la page (serveur), MonthCard et MonthActions.
// Isolés ici pour éviter une dépendance circulaire entre les deux composants clients.

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
