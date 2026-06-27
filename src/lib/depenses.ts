import type { ExpenseStatus } from '@/types'

export const expenseStatusLabels: Record<ExpenseStatus, string> = {
  a_verifier: 'À vérifier',
  valide: 'Validé',
  envoye_comptable: 'Envoyé comptable',
  archive: 'Archivé',
}

export const expenseStatusColors: Record<ExpenseStatus, string> = {
  a_verifier: 'bg-amber-100 text-amber-700',
  valide: 'bg-green-100 text-green-700',
  envoye_comptable: 'bg-violet-100 text-violet-700',
  archive: 'bg-gray-100 text-gray-500',
}

// Catégories de dépenses (texte libre en base)
export const expenseCategoryOptions: string[] = [
  'Carburant', 'Péage', 'Parking', 'Outillage', 'Matériaux', 'Fournitures chantier',
  'Repas', 'Hôtel', 'Location matériel', 'Entretien véhicule', 'Achat urgent',
  'Administratif', 'Autre',
]

export const paymentMethodOptions: string[] = [
  'Carte bancaire', 'Espèces', 'Virement', 'Chèque', 'Prélèvement', 'Autre',
]

export const expenseSourceLabels: Record<string, string> = {
  ticket: 'Ticket scanné',
  banque: 'Banque',
  manuel: 'Saisie manuelle',
}

type ExportRow = {
  expense_date?: string | null; supplier?: string | null; category?: string | null
  amount_ht?: number | null; vat_amount?: number | null; amount_ttc?: number | null
  vat_rate?: number | null; payment_method?: string | null; ticket_number?: string | null
  projects?: { title?: string } | null; notes?: string | null
}

// Génère un CSV (séparateur ; pour Excel FR, BOM UTF-8) prêt pour la comptable
export function expensesToCsv(rows: ExportRow[]): string {
  const headers = ['Date', 'Fournisseur', 'Catégorie', 'Montant HT', 'TVA', 'Montant TTC', 'Taux TVA', 'Paiement', 'N° ticket', 'Chantier', 'Note']
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = rows.map(r => [
    r.expense_date || '', r.supplier || '', r.category || '',
    r.amount_ht ?? '', r.vat_amount ?? '', r.amount_ttc ?? '', r.vat_rate ?? '',
    r.payment_method || '', r.ticket_number || '', r.projects?.title || '', r.notes || '',
  ].map(esc).join(';'))
  return '﻿' + [headers.join(';'), ...lines].join('\n')
}
