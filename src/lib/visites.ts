// Visite de repérage : normalisation du résultat d'analyse IA (photos + notes).

export interface VisitLine {
  categorie: string
  designation: string
  unite: string
  quantite: number
  prix_unitaire_ht: number
  source_prix: 'base' | 'estime'
}

export interface VisitResult {
  resume: string
  observations: { element: string; detail: string }[]
  travaux_suggeres: VisitLine[]
  points_attention: string[]
  questions_client: string[]
  total_ht: number
}

const s = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v))
const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0 }
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

export function normalizeVisitResult(raw: unknown): VisitResult {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const lignes: VisitLine[] = arr(o.travaux_suggeres).map((l): VisitLine => {
    const x = (l && typeof l === 'object' ? l : {}) as Record<string, unknown>
    return {
      categorie: s(x.categorie) || 'Divers',
      designation: s(x.designation),
      unite: s(x.unite) || 'u',
      quantite: n(x.quantite),
      prix_unitaire_ht: n(x.prix_unitaire_ht),
      source_prix: x.source_prix === 'base' ? 'base' : 'estime',
    }
  }).filter(l => l.designation)
  const total = n(o.total_ht) || lignes.reduce((t, l) => t + l.quantite * l.prix_unitaire_ht, 0)
  return {
    resume: s(o.resume),
    observations: arr(o.observations).map(ob => {
      const x = (ob && typeof ob === 'object' ? ob : {}) as Record<string, unknown>
      return { element: s(x.element), detail: s(x.detail) }
    }).filter(ob => ob.element || ob.detail),
    travaux_suggeres: lignes,
    points_attention: arr(o.points_attention).map(s).filter(Boolean),
    questions_client: arr(o.questions_client).map(s).filter(Boolean),
    total_ht: total,
  }
}

export const visitStatusLabels: Record<string, string> = {
  brouillon: 'En cours',
  analyse: 'Analysée',
}
