// Parseur déterministe de tableaux de prix (Excel/CSV bien colonnés).
// Évite de passer par l'IA quand le document a déjà une structure claire,
// ce qui est plus rapide, gratuit et fiable même pour des centaines de lignes.

export type ParsedItem = { name: string; unit: string; price: number; description?: string }
export type ParsedCategory = { name: string; items: ParsedItem[] }

const ALLOWED_UNITS = ['m2', 'ml', 'u', 'forfait', 'h', 'j', 'piece']

function norm(s: any): string {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

export function normalizeUnit(raw: any): string {
  const u = norm(raw)
  if (!u) return 'u'
  if (u.includes('m2') || u.includes('m²') || u.includes('metre carre')) return 'm2'
  if (u === 'ml' || u.includes('metre lineaire') || u.includes('lineaire')) return 'ml'
  if (u.startsWith('forfait') || u === 'ft' || u === 'fft') return 'forfait'
  if (u === 'h' || u.includes('heure') || u === 'hr') return 'h'
  if (u === 'j' || u.includes('jour') || u === 'jr') return 'j'
  if (u.includes('piece') || u === 'pce' || u === 'pc') return 'piece'
  if (u === 'u' || u === 'u.' || u.includes('unite') || u.includes('unité')) return 'u'
  // km, m³, %, ens, etc. → unité générique (modifiable ensuite dans l'app)
  return 'u'
}

export function parsePrice(raw: any): number {
  if (raw == null) return 0
  let s = String(raw).toLowerCase()
  if (s.includes('devis') || s.includes('mesure') || s.includes('variable')) return 0
  s = s.replace(/[^0-9.,-]/g, '')
  if (!s) return 0
  const hasComma = s.includes(','), hasDot = s.includes('.')
  if (hasComma && hasDot) {
    s = s.replace(/,/g, '') // virgule = séparateur de milliers
  } else if (hasComma) {
    s = s.replace(/,/g, '.') // virgule = décimale
  }
  const parts = s.split('.')
  if (parts.length > 2) {
    const dec = parts.pop()
    s = parts.join('') + '.' + dec
  }
  const n = parseFloat(s)
  return isNaN(n) || n < 0 ? 0 : n
}

interface ColMap { name: number; price: number; category: number; unit: number; desc: number }

function detectHeader(rows: any[][]): { idx: number; cols: ColMap } | null {
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const h = (rows[i] || []).map(norm)
    // Un vrai en-tête de colonne est un libellé court (< 35 car.), pas une phrase.
    const isLabel = (c: string) => c.length > 0 && c.length < 35
    const name = h.findIndex(c => isLabel(c) && (c.includes('designation') || c.includes('prestation') || c.includes('libelle') || c.includes('intitule') || c === 'nom'))
    const price = h.findIndex(c => isLabel(c) && c.includes('prix') && !c.includes('texte') && !c.includes('fourchette') && !c.includes('fournisseur') && !c.includes('cout') && !c.includes('achat'))
    // Les deux colonnes doivent être distinctes (sinon c'est une phrase qui contient les deux mots).
    if (name >= 0 && price >= 0 && name !== price) {
      const category = h.findIndex(c => c.includes('categorie') && !c.includes('sous'))
      const unit = h.findIndex(c => c === 'unite' || c.includes('unite') || c === 'u' || c === 'un')
      const desc = h.findIndex(c => c.includes('description') || c.includes('detail'))
      return { idx: i, cols: { name, price, category, unit, desc } }
    }
  }
  return null
}

// Parse une feuille (tableau 2D). Retourne null si aucune structure reconnue.
export function parseSheetRows(rows: any[][]): ParsedCategory[] | null {
  const det = detectHeader(rows)
  if (!det) return null
  const { idx, cols } = det
  const cats = new Map<string, ParsedItem[]>()
  for (let i = idx + 1; i < rows.length; i++) {
    const r = rows[i] || []
    const name = String(r[cols.name] ?? '').trim()
    if (!name || norm(name).includes('designation')) continue
    const catName = cols.category >= 0 ? (String(r[cols.category] ?? '').trim() || 'Autres prestations') : 'Autres prestations'
    const item: ParsedItem = {
      name,
      unit: cols.unit >= 0 ? normalizeUnit(r[cols.unit]) : 'u',
      price: cols.price >= 0 ? parsePrice(r[cols.price]) : 0,
    }
    const desc = cols.desc >= 0 ? String(r[cols.desc] ?? '').trim() : ''
    if (desc) item.description = desc.slice(0, 200)
    if (!cats.has(catName)) cats.set(catName, [])
    cats.get(catName)!.push(item)
  }
  const result = [...cats.entries()].map(([name, items]) => ({ name, items })).filter(c => c.items.length)
  return result.length ? result : null
}

// Fusionne des catégories de même nom (insensible à la casse).
export function mergeCategories(cats: ParsedCategory[]): ParsedCategory[] {
  const map = new Map<string, ParsedCategory>()
  for (const c of cats) {
    const key = norm(c.name)
    if (map.has(key)) map.get(key)!.items.push(...c.items)
    else map.set(key, { name: c.name, items: [...c.items] })
  }
  return [...map.values()]
}
