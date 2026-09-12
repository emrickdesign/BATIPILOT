// Partie ISOMORPHE du devis/facture assistant (types + calculs purs).
// Sans dépendance serveur → importable côté client (DevisComposer) ET serveur.

export type DraftKind = 'devis' | 'facture'
export const UNITS = ['m2', 'ml', 'u', 'forfait', 'h', 'j', 'piece'] as const
export type Unit = typeof UNITS[number]

export interface DraftLine {
  designation: string
  description?: string
  category?: string
  quantity: number
  unit: Unit
  unit_price_ht: number
  vat_rate: number
  discount_percent?: number
  is_option?: boolean
}

export interface DevisDraft {
  kind: DraftKind
  clientId: string
  clientName: string
  title: string
  lines: DraftLine[]
}

// Total HT d'une ligne (remise incluse).
export function lineTotalHT(l: DraftLine): number {
  return (Number(l.quantity) || 0) * (Number(l.unit_price_ht) || 0) * (1 - (Number(l.discount_percent) || 0) / 100)
}

// Totaux du document (les lignes « option » sont exclues du total).
export function draftTotals(lines: DraftLine[]) {
  const base = lines.filter(l => !l.is_option)
  const subtotalHT = base.reduce((s, l) => s + lineTotalHT(l), 0)
  const totalVAT = base.reduce((s, l) => s + lineTotalHT(l) * (Number(l.vat_rate) || 0) / 100, 0)
  return { subtotalHT, totalVAT, totalTTC: subtotalHT + totalVAT }
}

function clampNum(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

// Sanitize une liste de lignes (sortie IA ou payload client) → lignes valides bornées.
export function normalizeLines(input: unknown, vat: number): DraftLine[] {
  if (!Array.isArray(input)) return []
  const out: DraftLine[] = []
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue
    const l = raw as Record<string, unknown>
    const designation = String(l.designation || '').trim().slice(0, 200)
    if (!designation) continue
    const unitRaw = String(l.unit || l.unite || 'u')
    const unit = (UNITS as readonly string[]).includes(unitRaw) ? unitRaw as Unit : 'u'
    const vatRaw = clampNum(l.vat_rate ?? l.tva, 0, 20, vat)
    out.push({
      category: String(l.category || l.categorie || '').trim().slice(0, 100),
      designation,
      description: String(l.description || '').trim().slice(0, 300),
      quantity: clampNum(l.quantity ?? l.quantite, 0, 100000, 1),
      unit,
      unit_price_ht: clampNum(l.unit_price_ht ?? l.prix_unitaire_ht, 0, 1000000, 0),
      vat_rate: [5.5, 10, 20].includes(vatRaw) ? vatRaw : vat,
      discount_percent: clampNum(l.discount_percent, 0, 100, 0),
      is_option: Boolean(l.is_option),
    })
    if (out.length >= 60) break
  }
  return out
}
