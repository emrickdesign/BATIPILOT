import type {
  SubcontractorStatus, SubDocType, SubContractStatus, SubInvoiceStatus,
  SubcontractorDocument, SubcontractorInvoice, SubcontractorContract,
} from '@/types'

const numv = (v: unknown) => Number(v) || 0

/** Montant HT d'une facture ST (fallback : TTC / 1,2 si le HT n'est pas saisi). */
export function invoiceHt(i: { amount_ht?: number | null; amount_ttc?: number | null }): number {
  if (i.amount_ht != null) return numv(i.amount_ht)
  if (i.amount_ttc != null) return numv(i.amount_ttc) / 1.2
  return 0
}

/** Retenue de garantie d'un contrat (montant) + date de libération (fin + 1 an). */
export function retention(c: { amount_ht?: number | null; retention_pct?: number | null; end_date?: string | null }) {
  const amount = numv(c.amount_ht) * numv(c.retention_pct) / 100
  let releaseDate: string | null = null
  if (c.end_date && amount > 0) {
    const d = new Date(c.end_date + 'T00:00:00'); d.setFullYear(d.getFullYear() + 1)
    releaseDate = d.toISOString().slice(0, 10)
  }
  return { amount, releaseDate }
}

/** Rentabilité agrégée d'un sous-traitant : CA généré, coûts, marge, alertes. */
export function profitability(contracts: SubcontractorContract[], invoices: Pick<SubcontractorInvoice, 'amount_ht' | 'amount_ttc' | 'status' | 'due_date'>[]) {
  const ca = contracts.reduce((t, c) => t + numv(c.sale_price_ht), 0)
  const engage = contracts.reduce((t, c) => t + numv(c.amount_ht), 0)
  const facture = invoices.reduce((t, i) => t + invoiceHt(i), 0)
  const paye = invoices.filter(i => i.status === 'payee').reduce((t, i) => t + invoiceHt(i), 0)
  const unpaid = invoices.filter(i => i.status !== 'payee').reduce((t, i) => t + numv(i.amount_ttc), 0)
  const cout = facture > 0 ? facture : engage // coût réel si facturé, sinon l'engagé
  const marge = ca - cout
  const margePct = ca > 0 ? Math.round((marge / ca) * 100) : null
  const retenue = contracts.reduce((t, c) => t + retention(c).amount, 0)
  const litiges = invoices.filter(i => i.status === 'litige').length
  const retards = invoices.filter(i => i.status !== 'payee' && i.due_date && (daysUntil(i.due_date) ?? 0) < 0).length
  return { ca, engage, facture, paye, unpaid, cout, marge, margePct, retenue, litiges, retards }
}

// Spécialités les plus courantes dans le bâtiment (liste indicative, champ libre autorisé)
export const tradeOptions: string[] = [
  'Maçonnerie', 'Plomberie', 'Électricité', 'Chauffage / Climatisation',
  'Peinture', 'Plâtrerie / Placo', 'Carrelage', 'Menuiserie', 'Charpente',
  'Couverture', 'Étanchéité', 'Isolation', 'Serrurerie / Métallerie',
  'Terrassement', 'VRD', 'Façade / Ravalement', 'Nettoyage', 'Autre',
]

export const subStatusLabels: Record<SubcontractorStatus, string> = {
  actif: 'Actif',
  inactif: 'Inactif',
  liste_noire: 'Liste noire',
}

// Documents de conformité — les incontournables (art. L.8222 : obligation de vigilance)
export const subDocTypeLabels: Record<SubDocType, string> = {
  attestation_vigilance: 'Attestation de vigilance (URSSAF)',
  urssaf: 'Attestation URSSAF',
  kbis: 'Extrait Kbis',
  assurance_decennale: 'Assurance décennale',
  rc_pro: 'Responsabilité civile pro',
  liste_salaries: 'Liste des salariés étrangers',
  rib: 'RIB',
  contrat: 'Contrat de sous-traitance',
  devis: 'Devis',
  autre: 'Autre document',
}

// Pièces obligatoires attendues pour être « à jour » vis-à-vis de l'obligation de vigilance
export const requiredDocTypes: SubDocType[] = [
  'attestation_vigilance', 'kbis', 'assurance_decennale', 'rc_pro',
]

export const subContractStatusLabels: Record<SubContractStatus, string> = {
  en_preparation: 'En préparation',
  signe: 'Signé',
  en_cours: 'En cours',
  termine: 'Terminé',
  annule: 'Annulé',
}

export const subInvoiceStatusLabels: Record<SubInvoiceStatus, string> = {
  a_valider: 'À valider',
  validee: 'Validée',
  payee: 'Payée',
  litige: 'Litige',
}

export function subInitials(name: string): string {
  return name.split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?'
}

/** Nb de jours avant expiration (négatif = déjà expiré), null si pas de date. */
export function daysUntil(date?: string | null): number | null {
  if (!date) return null
  const d = new Date(date); d.setHours(0, 0, 0, 0)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - today.getTime()) / 86400000)
}

export type DocState = 'ok' | 'bientot' | 'expire'
/** État d'une échéance : expiré, bientôt (<30 j) ou ok. */
export function expiryState(date?: string | null): DocState | null {
  const j = daysUntil(date)
  if (j === null) return null
  if (j < 0) return 'expire'
  if (j <= 30) return 'bientot'
  return 'ok'
}

/**
 * Conformité d'un sous-traitant : présence des pièces obligatoires + validité.
 * Renvoie le nb de pièces manquantes et le nb de pièces expirées.
 */
export function complianceCheck(docs: SubcontractorDocument[], insuranceExpiry?: string | null) {
  const present = new Set(docs.map(d => d.type))
  const missing = requiredDocTypes.filter(t => !present.has(t))
  let expired = 0
  for (const d of docs) if (expiryState(d.expiry_date) === 'expire') expired++
  if (expiryState(insuranceExpiry) === 'expire') expired++
  const ok = missing.length === 0 && expired === 0
  return { ok, missing, expired }
}
