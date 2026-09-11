import type { SupabaseClient } from '@supabase/supabase-js'
import {
  formatSiren, normalizeBic, normalizeIban, normalizeVatNumber, parseAddress, sirenOf,
  type PostalAddress,
} from './identifiers'

// Modèle sémantique EN 16931 d'une facture TonPilote + contrôles de conformité.
// Les montants du XML sont RECALCULÉS depuis les lignes selon les règles EN 16931
// (TVA arrondie par taux) : le PDF affiche ces mêmes montants, les deux restent cohérents.

export type VatCategory = 'S' | 'E' | 'AE'

export interface EParty {
  name: string
  tradingName?: string
  siren?: string            // BT-30 / BT-47 (schéma 0002)
  vatId?: string            // BT-31 / BT-48
  taxRegistrationId?: string // BT-32 (schéma FC) : SIREN si pas de n° de TVA
  address: PostalAddress
  electronicAddress?: string // BT-34 / BT-49 (schéma 0225) : adresse d'acheminement = SIREN
  email?: string
  phone?: string
}

export interface ELine {
  id: string          // BT-126
  name: string        // BT-153
  description?: string // BT-154
  quantity: number    // BT-129
  unitCode: string    // BT-130 (UN/ECE rec. 20)
  grossPrice?: number // BT-148
  discount?: number   // BT-147 (remise unitaire)
  netPrice: number    // BT-146 (jamais négatif)
  netAmount: number   // BT-131
  vatCategory: VatCategory
  vatRate: number
}

export interface EVatGroup {
  category: VatCategory
  rate: number
  base: number
  amount: number
  exemptionReason?: string
  exemptionCode?: string
  /** BT-8 : « 5 » = TVA exigible à la date de facture (option pour les débits) */
  dueDateTypeCode?: string
}

export interface ENote {
  content: string
  /** Mentions légales codées (règles françaises) : pénalités, indemnité 40 €, escompte */
  subject?: 'PMD' | 'PMT' | 'AAB'
}

export interface EInvoice {
  number: string
  typeCode: '380' | '381' | '386'
  issueDate: string
  dueDate?: string
  /** BT-23 « cadre de facturation » : S1 prestation, B1 bien, M1 mixte (4 = après acompte) */
  businessProcess: string
  currency: 'EUR'
  buyerReference?: string
  sellerOrderReference?: string // BT-14 : n° du devis
  notes: ENote[]
  seller: EParty
  buyer: EParty
  delivery?: { name?: string; address: PostalAddress }
  paymentMeans?: { typeCode: '30' | '58'; iban?: string; bic?: string }
  paymentReference?: string
  paymentTerms?: string
  lines: ELine[]
  vat: EVatGroup[]
  totals: { lineTotal: number; taxBasis: number; tax: number; grandTotal: number; prepaid: number; due: number }
  precedingInvoice?: { number: string; date?: string }
}

export interface ComplianceIssue {
  level: 'error' | 'warning'
  message: string
  fix?: { label: string; href: string }
}

// ─── Lignes Supabase (typage lâche : colonnes numériques parfois renvoyées en texte) ───

type Num = number | string | null | undefined

export interface CompanyRow {
  trade_name?: string | null; legal_name?: string | null; siret?: string | null; vat_number?: string | null
  address?: string | null; phone?: string | null; email?: string | null
  iban?: string | null; bic?: string | null; payment_terms?: string | null; legal_mentions?: string | null
  insurance_decennale?: string | null
  vat_regime?: string | null; vat_on_debits?: boolean | null; operation_category?: string | null
}

export interface ClientRow {
  id?: string; type?: string | null; first_name?: string | null; last_name?: string | null
  company_name?: string | null; billing_address?: string | null; site_address?: string | null
  siret?: string | null; vat_number?: string | null
}

export interface InvoiceLineRow {
  designation?: string | null; description?: string | null; quantity?: Num; unit?: string | null
  unit_price_ht?: Num; vat_rate?: Num; discount_percent?: Num; total_ht?: Num; sort_order?: number | null
}

export interface InvoiceRow {
  id: string; invoice_number: string; type?: string | null; status?: string | null
  issue_date?: string | null; due_date?: string | null
  subtotal_ht?: Num; total_vat?: Num; total_ttc?: Num; deposit_already_paid?: Num
  legal_mentions?: string | null; retention_pct?: Num; retention_amount?: Num
  credited_invoice_id?: string | null; project_id?: string | null; quote_id?: string | null
  clients?: ClientRow | null
  invoice_lines?: InvoiceLineRow[] | null
}

export interface FacturXContext {
  credited?: { invoice_number: string; issue_date?: string | null } | null
  /** Adresse du chantier (lieu d'exécution des travaux) */
  siteAddress?: string | null
  quoteNumber?: string | null
}

export interface BuiltEInvoice {
  model: EInvoice
  issues: ComplianceIssue[]
  /** Client particulier : hors facturation électronique B2B (pas d'envoi par la plateforme) */
  b2c: boolean
  /** -1 pour un avoir : TonPilote stocke les avoirs en négatif, le XML les exprime en positif */
  sign: 1 | -1
  retention: number
  operationLabel: string
  /** Mentions à imprimer sur le PDF (mêmes textes que les notes du XML) */
  mentions: string[]
}

// ─── Constantes ───

export const OPERATIONS = {
  services: { letter: 'S', label: 'Prestation de services' },
  goods: { letter: 'B', label: 'Livraison de biens' },
  mixed: { letter: 'M', label: 'Mixte (biens et services)' },
} as const
export type OperationCategory = keyof typeof OPERATIONS

export const FRANCHISE_MENTION = 'TVA non applicable, art. 293 B du CGI'
export const DEBITS_MENTION = 'Option pour le paiement de la taxe d’après les débits'
export const REVERSE_CHARGE_MENTION = 'Autoliquidation : TVA due par le preneur (art. 283-2 nonies du CGI)'
const PMD_TEXT = 'Pénalités de retard : trois fois le taux d’intérêt légal, exigibles dès le lendemain de l’échéance.'
const PMT_TEXT = 'Indemnité forfaitaire pour frais de recouvrement en cas de retard de paiement : 40 €.'
const AAB_TEXT = 'Pas d’escompte pour paiement anticipé.'

// Unités TonPilote → codes UN/ECE (recommandation 20)
const UNIT_CODES: Record<string, string> = {
  u: 'C62', piece: 'H87', forfait: 'LS', h: 'HUR', j: 'DAY',
  m2: 'MTK', ml: 'MTR', m: 'MTR', m3: 'MTQ', kg: 'KGM', t: 'TNE', l: 'LTR',
}

const FIX_COMPANY = { label: 'Compléter Mon entreprise', href: '/parametres/entreprise' }
const FIX_TAX = { label: 'Régler la TVA', href: '/parametres/facturation-electronique' }

// ─── Outils ───

const num = (v: Num) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
/** Arrondi commercial au centime (demi-centime loin de zéro). */
export const round2 = (n: number) => Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-7) / 100
const round6 = (n: number) => Math.sign(n) * Math.round(Math.abs(n) * 1e6 + 1e-4) / 1e6
const clean = (s?: string | null) => (s || '').replace(/\s+/g, ' ').trim()
const fmtEur = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)
const fmtNum = (n: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(n)
const fmtDateFr = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('fr-FR') : '')

const STANDARD_RATES = [20, 10, 8.5, 5.5, 2.1, 0]
function snapRate(rate: number): number {
  const near = STANDARD_RATES.find(r => Math.abs(r - rate) < 0.3)
  return near ?? Math.round(rate * 10) / 10
}

// ─── Construction ───

export function buildEInvoice(invoice: InvoiceRow, company: CompanyRow | null, ctx: FacturXContext = {}): BuiltEInvoice {
  const co: CompanyRow = company || {}
  const cl: ClientRow = invoice.clients || {}
  const issues: ComplianceIssue[] = []

  const typeCode: EInvoice['typeCode'] = invoice.type === 'avoir' ? '381' : invoice.type === 'acompte' ? '386' : '380'
  const sign: 1 | -1 = typeCode === '381' ? -1 : 1
  const franchise = co.vat_regime === 'franchise'
  const op = OPERATIONS[(co.operation_category as OperationCategory) || 'services'] || OPERATIONS.services
  const legal = clean(invoice.legal_mentions)
  const reverseCharge = /autoliquidation|283[\s-]*2/i.test(`${legal} ${co.legal_mentions || ''}`)
  // Facture émise sans TVA (total TVA nul) : on respecte ce qui a été facturé.
  const invoiceVatFree = Math.abs(num(invoice.total_vat)) < 0.005 && Math.abs(num(invoice.subtotal_ht)) >= 0.005
  const b2c = cl.type !== 'professionnel'

  // Vendeur
  const sellerSiren = sirenOf(co.siret)
  const sellerVat = normalizeVatNumber(co.vat_number)
  const sellerAddress = parseAddress(co.address)
  const legalName = clean(co.legal_name)
  const tradeName = clean(co.trade_name)
  const seller: EParty = {
    name: legalName || tradeName || 'Entreprise',
    tradingName: legalName && tradeName && legalName !== tradeName ? tradeName : undefined,
    siren: sellerSiren || undefined,
    vatId: sellerVat || undefined,
    taxRegistrationId: !sellerVat && sellerSiren ? sellerSiren : undefined,
    address: sellerAddress,
    electronicAddress: sellerSiren || undefined,
    email: clean(co.email) || undefined,
    phone: clean(co.phone) || undefined,
  }
  if (!sellerSiren) issues.push({ level: 'error', message: 'SIRET de votre entreprise manquant ou invalide.', fix: FIX_COMPANY })
  if (!sellerAddress.postcode || !sellerAddress.city) issues.push({ level: 'error', message: 'Adresse de votre entreprise incomplète : le code postal et la ville sont obligatoires.', fix: FIX_COMPANY })
  if (co.vat_number && !sellerVat) issues.push({ level: 'error', message: 'Numéro de TVA intracommunautaire de votre entreprise invalide.', fix: FIX_COMPANY })
  else if (!franchise && !sellerVat) issues.push({ level: 'error', message: 'Numéro de TVA intracommunautaire de votre entreprise manquant (ou passez en franchise de TVA si c’est votre cas).', fix: FIX_TAX })

  // Acheteur
  const buyerSiren = b2c ? null : sirenOf(cl.siret)
  const buyerAddress = parseAddress(cl.billing_address)
  const buyerName = b2c ? clean(`${cl.first_name || ''} ${cl.last_name || ''}`) : clean(cl.company_name)
  const buyer: EParty = {
    name: buyerName || 'Client',
    siren: buyerSiren || undefined,
    vatId: b2c ? undefined : normalizeVatNumber(cl.vat_number) || undefined,
    address: buyerAddress,
    electronicAddress: buyerSiren || undefined,
  }
  const fixClient = cl.id ? { label: 'Compléter la fiche client', href: `/clients/${cl.id}/modifier` } : undefined
  if (!buyerName) issues.push({ level: 'error', message: 'Nom du client manquant.', fix: fixClient })
  if (!b2c && !buyerSiren) issues.push({ level: 'error', message: 'SIRET du client manquant ou invalide : il sert à acheminer la facture vers la plateforme de votre client.', fix: fixClient })
  if (!buyerAddress.postcode || !buyerAddress.city) issues.push({ level: b2c ? 'warning' : 'error', message: 'Adresse de facturation du client incomplète : le code postal et la ville sont obligatoires.', fix: fixClient })
  if (!b2c && cl.vat_number && !normalizeVatNumber(cl.vat_number)) issues.push({ level: 'warning', message: 'Numéro de TVA du client invalide : il ne sera pas repris.', fix: fixClient })

  // TVA d'une ligne
  const vatFor = (rate: number): { category: VatCategory; rate: number } =>
    rate > 0 && !invoiceVatFree ? { category: 'S', rate } : reverseCharge ? { category: 'AE', rate: 0 } : { category: 'E', rate: 0 }

  // Lignes
  const rows = [...(invoice.invoice_lines || [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  const lines: ELine[] = []
  let zeroWithoutReason = false
  rows.forEach((l, i) => {
    const rate = num(l.vat_rate)
    const vat = vatFor(rate)
    if (vat.category === 'E' && !franchise) zeroWithoutReason = true
    const q0 = num(l.quantity)
    const p0 = num(l.unit_price_ht) * sign
    const d = Math.min(100, Math.max(0, num(l.discount_percent)))
    let amount = round2(q0 * p0 * (1 - d / 100))
    let overridden = false
    // La ligne imprimée fait foi si son total diffère de qté × prix (saisie manuelle).
    if (l.total_ht != null && l.total_ht !== '') {
      const stored = round2(num(l.total_ht) * sign)
      if (Math.abs(stored - amount) >= 0.01) { amount = stored; overridden = true }
    }
    // EN 16931 : le prix net ne peut pas être négatif → le signe passe sur la quantité.
    let qty = p0 < 0 ? -q0 : q0
    let gross = Math.abs(p0)
    if (qty === 0 && amount !== 0) { qty = 1; gross = Math.abs(amount); overridden = true }
    if (amount !== 0 && Math.sign(amount) !== Math.sign(qty)) qty = -qty
    let netPrice = round6(gross * (1 - d / 100))
    if (overridden || Math.abs(round2(qty * netPrice) - amount) >= 0.01) {
      netPrice = qty ? round6(Math.abs(amount / qty)) : 0
      overridden = true
    }
    lines.push({
      id: String(i + 1),
      name: clean(l.designation) || `Ligne ${i + 1}`,
      description: clean(l.description) || undefined,
      quantity: qty,
      unitCode: UNIT_CODES[(l.unit || '').toLowerCase()] || 'C62',
      grossPrice: !overridden && d > 0 ? round6(gross) : undefined,
      discount: !overridden && d > 0 ? round6(gross - netPrice) : undefined,
      netPrice,
      netAmount: amount,
      vatCategory: vat.category,
      vatRate: vat.rate,
    })
  })
  if (!lines.length) {
    const base = round2(num(invoice.subtotal_ht) * sign)
    const vat = vatFor(invoiceVatFree || !base ? 0 : snapRate((num(invoice.total_vat) * sign / base) * 100))
    lines.push({
      id: '1', name: `Prestation — facture ${invoice.invoice_number}`, quantity: base < 0 ? -1 : 1, unitCode: 'C62',
      netPrice: Math.abs(base), netAmount: base, vatCategory: vat.category, vatRate: vat.rate,
    })
    issues.push({ level: 'warning', message: 'Facture sans lignes détaillées : une ligne unique est générée à partir du total.' })
  }

  // Ventilation de la TVA (arrondie par taux, règle EN 16931)
  const groups = new Map<string, EVatGroup>()
  for (const l of lines) {
    const key = `${l.vatCategory}:${l.vatRate}`
    const g = groups.get(key) ?? { category: l.vatCategory, rate: l.vatRate, base: 0, amount: 0 }
    g.base = round2(g.base + l.netAmount)
    groups.set(key, g)
  }
  const vat: EVatGroup[] = [...groups.values()].sort((a, b) => b.rate - a.rate).map(g => {
    if (g.category === 'S') return { ...g, amount: round2(g.base * g.rate / 100), dueDateTypeCode: co.vat_on_debits ? '5' : undefined }
    if (g.category === 'AE') return { ...g, amount: 0, exemptionReason: 'Autoliquidation', exemptionCode: 'VATEX-EU-AE' }
    return franchise
      ? { ...g, amount: 0, exemptionReason: FRANCHISE_MENTION, exemptionCode: 'VATEX-FR-FRANCHISE' }
      : { ...g, amount: 0, exemptionReason: 'Exonération de TVA' }
  })
  if (franchise && vat.some(g => g.category === 'S')) {
    issues.push({ level: 'warning', message: 'Votre entreprise est en franchise de TVA mais cette facture applique de la TVA.', fix: FIX_TAX })
  }
  if (zeroWithoutReason) {
    issues.push({ level: 'warning', message: 'Ligne sans TVA sans motif : indiquez « Autoliquidation » ou le motif d’exonération dans les mentions de la facture.' })
  }

  // Totaux
  const lineTotal = round2(lines.reduce((s, l) => s + l.netAmount, 0))
  const tax = round2(vat.reduce((s, g) => s + g.amount, 0))
  const grandTotal = round2(lineTotal + tax)
  const prepaid = round2(Math.max(0, num(invoice.deposit_already_paid) * sign))
  const due = round2(grandTotal - prepaid)
  const retention = round2(Math.max(0, num(invoice.retention_amount)))
  const storedTtc = round2(num(invoice.total_ttc) * sign)
  if (Math.abs(storedTtc - grandTotal) >= 0.01) {
    issues.push({ level: 'warning', message: `Total recalculé ligne par ligne : ${fmtEur(grandTotal)} (écart de ${fmtEur(round2(grandTotal - storedTtc))} avec le total enregistré, dû aux arrondis de TVA).` })
  }

  // Notes et mentions légales
  const notes: ENote[] = []
  if (legal) notes.push({ content: legal })
  if (franchise && vat.some(g => g.category === 'E') && !/293\s*B/i.test(legal)) notes.push({ content: `${FRANCHISE_MENTION}.` })
  if (vat.some(g => g.category === 'AE') && !/autoliquidation/i.test(legal)) notes.push({ content: `${REVERSE_CHARGE_MENTION}.` })
  if (co.vat_on_debits && vat.some(g => g.category === 'S')) notes.push({ content: `${DEBITS_MENTION}.` })
  if (retention > 0 && !/retenue de garantie/i.test(legal)) {
    notes.push({ content: `Retenue de garantie de ${fmtNum(num(invoice.retention_pct))} % (${fmtEur(retention)}), libérable à la levée des réserves ou un an après la réception des travaux.` })
  }
  if (ctx.credited && !legal.includes(ctx.credited.invoice_number)) {
    notes.push({ content: `Avoir sur la facture ${ctx.credited.invoice_number}${ctx.credited.issue_date ? ` du ${fmtDateFr(ctx.credited.issue_date)}` : ''}.` })
  }
  if (clean(co.insurance_decennale)) notes.push({ content: `Assurance décennale : ${clean(co.insurance_decennale)}.` })
  notes.push({ subject: 'PMD', content: PMD_TEXT }, { subject: 'PMT', content: PMT_TEXT }, { subject: 'AAB', content: AAB_TEXT })

  // Paiement
  const iban = normalizeIban(co.iban)
  const bic = normalizeBic(co.bic)
  if (!iban) issues.push({ level: 'warning', message: co.iban ? 'IBAN invalide : il ne figurera pas dans la facture électronique.' : 'IBAN non renseigné : ajoutez-le pour être payé par virement.', fix: FIX_COMPANY })
  const terms = clean(co.payment_terms)

  // Lieu d'exécution (adresse de livraison) si différent de l'adresse de facturation
  const siteText = clean(ctx.siteAddress) || clean(cl.site_address)
  const site = siteText ? parseAddress(siteText) : null
  const sameAsBilling = siteText.toLowerCase() === clean(cl.billing_address).toLowerCase()
  const delivery = site && !sameAsBilling && (site.line1 || site.postcode) ? { address: site } : undefined

  const model: EInvoice = {
    number: invoice.invoice_number,
    typeCode,
    issueDate: (invoice.issue_date || new Date().toISOString()).slice(0, 10),
    dueDate: invoice.due_date || undefined,
    businessProcess: `${op.letter}${prepaid > 0 ? 4 : 1}`,
    currency: 'EUR',
    sellerOrderReference: ctx.quoteNumber || undefined,
    notes,
    seller,
    buyer,
    delivery,
    paymentMeans: iban ? { typeCode: '58', iban, bic: bic || undefined } : undefined,
    paymentReference: invoice.invoice_number,
    paymentTerms: terms || (invoice.due_date ? undefined : 'Paiement à réception de la facture.'),
    lines,
    vat,
    totals: { lineTotal, taxBasis: lineTotal, tax, grandTotal, prepaid, due },
    precedingInvoice: ctx.credited ? { number: ctx.credited.invoice_number, date: ctx.credited.issue_date || undefined } : undefined,
  }

  const mentions = [
    `Catégorie de l’opération : ${op.label}`,
    ...notes.filter(n => !n.subject).map(n => n.content),
    `${PMD_TEXT} ${PMT_TEXT} ${AAB_TEXT}`,
  ]

  return { model, issues, b2c, sign, retention, operationLabel: op.label, mentions }
}

/** Lignes d'identification à imprimer sous le vendeur / le client (SIREN, TVA). */
export function partyIdLines(p: EParty, opts: { showSiren: boolean }): string[] {
  const out: string[] = []
  if (opts.showSiren && p.siren) out.push(`SIREN : ${formatSiren(p.siren)}`)
  if (p.vatId) out.push(`N° TVA : ${p.vatId}`)
  return out
}

/** Données annexes nécessaires au XML : facture créditée (avoir), adresse du chantier, n° de devis. */
export async function loadFacturXContext(
  supabase: SupabaseClient,
  invoice: { credited_invoice_id?: string | null; project_id?: string | null; quote_id?: string | null },
): Promise<FacturXContext> {
  const [credited, project, quote] = await Promise.all([
    invoice.credited_invoice_id
      ? supabase.from('invoices').select('invoice_number, issue_date').eq('id', invoice.credited_invoice_id).maybeSingle()
      : null,
    invoice.project_id ? supabase.from('projects').select('address').eq('id', invoice.project_id).maybeSingle() : null,
    invoice.quote_id ? supabase.from('quotes').select('quote_number').eq('id', invoice.quote_id).maybeSingle() : null,
  ])
  return {
    credited: (credited?.data as FacturXContext['credited']) ?? null,
    siteAddress: (project?.data as { address?: string | null } | null)?.address ?? null,
    quoteNumber: (quote?.data as { quote_number?: string | null } | null)?.quote_number ?? null,
  }
}
