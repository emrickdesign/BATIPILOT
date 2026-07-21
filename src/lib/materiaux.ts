// Besoins matériaux d'un chantier, dérivés des lignes de devis acceptés.
// Un « besoin » = une ligne dont la fourniture est à acheter (supply_included),
// ou une ligne libre dont l'unité dénote une quantité de matière (m2/ml/u/pièce).

export type MatUnit = string

// Unités qui dénotent de la matière (par opposition à la main-d'œuvre : h/j/forfait).
const MATERIAL_UNITS = new Set(['m2', 'ml', 'u', 'piece'])

export function isMaterialUnit(unit?: string | null) {
  return !!unit && MATERIAL_UNITS.has(unit)
}

// Clé de regroupement stable : désignation normalisée (casse/accents/espaces).
export function labelKey(designation: string) {
  return designation
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export interface QuoteLineLite {
  id: string
  quote_id: string
  price_item_id?: string | null
  designation: string
  quantity: number | null
  unit: string | null
  price_item?: { supply_included: boolean; supplier_cost: number | null } | null
}

export interface QuoteLite {
  id: string
  quote_number: string
  status: string
}

// Un besoin agrégé (une matière, quantité cumulée sur les devis acceptés).
export interface MaterialNeed {
  key: string
  label: string
  unit: string | null
  quantity: number
  estCostHt: number // budget matériaux estimé (supplier_cost × qté), 0 si inconnu
  quotes: string[] // numéros de devis source
  uncertain: boolean // ligne libre sans fiche prix → à vérifier
}

// Détermine si une ligne de devis correspond à un besoin matériau.
function lineIsMaterial(l: QuoteLineLite): { keep: boolean; uncertain: boolean } {
  if (l.price_item) {
    // Fiche prix connue : on garde si la fourniture est incluse.
    return { keep: !!l.price_item.supply_included, uncertain: false }
  }
  // Ligne libre : on garde si l'unité dénote de la matière, mais on la marque « à vérifier ».
  if (isMaterialUnit(l.unit)) return { keep: true, uncertain: true }
  return { keep: false, uncertain: false }
}

// Regroupe les lignes de tous les devis acceptés en besoins matériaux.
export function buildNeeds(quotes: QuoteLite[], lines: QuoteLineLite[]): MaterialNeed[] {
  const quoteNum = new Map(quotes.map(q => [q.id, q.quote_number]))
  const byKey = new Map<string, MaterialNeed>()
  for (const l of lines) {
    const { keep, uncertain } = lineIsMaterial(l)
    if (!keep) continue
    const label = l.designation.trim()
    if (!label) continue
    const key = labelKey(label)
    const qty = Number(l.quantity) || 0
    const est = (Number(l.price_item?.supplier_cost) || 0) * qty
    const cur = byKey.get(key)
    const qn = quoteNum.get(l.quote_id)
    if (cur) {
      cur.quantity += qty
      cur.estCostHt += est
      cur.uncertain = cur.uncertain && uncertain
      if (qn && !cur.quotes.includes(qn)) cur.quotes.push(qn)
    } else {
      byKey.set(key, {
        key, label, unit: l.unit, quantity: qty, estCostHt: est,
        quotes: qn ? [qn] : [], uncertain,
      })
    }
  }
  return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label, 'fr'))
}

export const unitShort: Record<string, string> = {
  m2: 'm²', ml: 'ml', u: 'u', piece: 'pce', forfait: 'forf.', h: 'h', j: 'j',
}
export function fmtUnit(u?: string | null) { return u ? (unitShort[u] || u) : '' }
