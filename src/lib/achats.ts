import type { SupplierDocType } from '@/types'

export const supplierDocTypeLabels: Record<SupplierDocType, string> = {
  devis: 'Devis fournisseur',
  bl: 'Bon de livraison',
  facture: 'Facture fournisseur',
}

export const supplierDocTypeShort: Record<SupplierDocType, string> = {
  devis: 'Devis',
  bl: 'BL',
  facture: 'Facture',
}

export const supplierDocTypeColors: Record<SupplierDocType, string> = {
  devis: 'bg-sky-100 text-sky-700',
  bl: 'bg-amber-100 text-amber-700',
  facture: 'bg-violet-100 text-violet-700',
}

export const isSupplierDocType = (v: unknown): v is SupplierDocType =>
  v === 'devis' || v === 'bl' || v === 'facture'

export type ScannedLine = {
  designation: string
  quantity: number | null
  unit: string | null
  unit_price_ht: number | null
  total_ht: number | null
  quality: string | null
  reference: string | null
}

export type ScannedDoc = {
  supplier: string | null
  doc_number: string | null
  doc_date: string | null
  total_ht: number | null
  total_ttc: number | null
  vat_amount: number | null
  lines: ScannedLine[]
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(String(v).replace(',', '.').replace(/[^\d.\-]/g, ''))
  return Number.isFinite(n) ? n : null
}
const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s ? s : null
}

/** Normalise la sortie brute de Claude en ScannedDoc propre (défensif). */
export function normalizeScanned(raw: Record<string, unknown>): ScannedDoc {
  const rawLines = Array.isArray(raw.lines) ? raw.lines : []
  const lines: ScannedLine[] = rawLines
    .map((l): ScannedLine | null => {
      const o = (l ?? {}) as Record<string, unknown>
      const designation = str(o.designation)
      if (!designation) return null
      return {
        designation,
        quantity: num(o.quantity),
        unit: str(o.unit),
        unit_price_ht: num(o.unit_price_ht),
        total_ht: num(o.total_ht),
        quality: str(o.quality),
        reference: str(o.reference),
      }
    })
    .filter((l): l is ScannedLine => l !== null)
  return {
    supplier: str(raw.supplier),
    doc_number: str(raw.doc_number),
    doc_date: str(raw.doc_date),
    total_ht: num(raw.total_ht),
    total_ttc: num(raw.total_ttc),
    vat_amount: num(raw.vat_amount),
    lines,
  }
}

/** Prompt d'extraction d'un document fournisseur (partagé scan direct + détection email). */
export function buildAchatsExtractionPrompt(docType: SupplierDocType): string {
  const intro = {
    devis: "Tu lis un DEVIS FOURNISSEUR reçu par un artisan du bâtiment (proposition de prix d'un fournisseur de matériaux, ex : Samsé, Point P, Leroy Merlin).",
    bl: "Tu lis un BON DE LIVRAISON d'un fournisseur de matériaux du bâtiment. Il liste ce qui a été RÉELLEMENT livré. Les prix sont souvent absents ou indicatifs — mets null si tu ne les vois pas.",
    facture: "Tu lis une FACTURE FOURNISSEUR reçue par un artisan du bâtiment (facture de matériaux).",
  }[docType]

  return `${intro}

Extrais l'en-tête ET le détail ligne par ligne des matériaux.

RÈGLES :
- Montants en euros, nombres décimaux avec un point (ex : 45.90). Jamais de symbole ni de séparateur de milliers.
- doc_date au format AAAA-MM-JJ.
- doc_number : le numéro du document (n° de devis / n° de BL / n° de facture).
- Pour chaque ligne : designation (libellé du matériau), quantity, unit (u, m2, ml, sac, palette, boîte…), unit_price_ht (prix unitaire HT), total_ht (total HT de la ligne), quality (gamme/qualité/marque si précisée, sinon null), reference (référence article si présente, sinon null).
- Ne mets PAS les lignes de sous-total, remise globale, éco-participation, TVA ou frais de port dans "lines" : seulement les matériaux/produits.
- Si une information est illisible ou absente, mets null. N'invente jamais un prix.

Retourne UNIQUEMENT ce JSON (sans texte autour) :
{
  "supplier": "nom du fournisseur ou null",
  "doc_number": "numéro du document ou null",
  "doc_date": "AAAA-MM-JJ ou null",
  "total_ht": nombre ou null,
  "total_ttc": nombre ou null,
  "vat_amount": nombre ou null,
  "lines": [
    { "designation": "...", "quantity": nombre ou null, "unit": "... ou null", "unit_price_ht": nombre ou null, "total_ht": nombre ou null, "quality": "... ou null", "reference": "... ou null" }
  ]
}`
}

/** Clé de rapprochement d'une désignation : minuscule, sans accents ni ponctuation. */
export function matchKey(label: string): string {
  return label
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}
