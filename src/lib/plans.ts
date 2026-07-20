// Analyse de plan : types partagés entre l'API, la galerie et la fiche d'analyse.

export const UNIT_LABELS: Record<string, string> = {
  m2: 'm²', ml: 'ml', u: 'u', forfait: 'forfait', h: 'h', j: 'j', piece: 'pièce',
}

export type Ligne = {
  categorie: string
  designation: string
  unite: string
  quantite: number
  prix_unitaire_ht: number
  total_ht: number
  source_prix: 'base' | 'estime'
  /** Coût de revient unitaire : issu de la base de prix si renseigné, sinon estimé par l'IA. */
  cout_unitaire_estime?: number
}

export type Piece = {
  nom: string
  surface_sol_m2: number
  perimetre_ml: number
  surface_murs_m2: number
}

export type Totaux = {
  total_ht: number
  cout_matieres_estime: number
  cout_main_oeuvre_estime: number
  marge_estimee_eur: number
  marge_estimee_pct: number
}

/** Une affectation de main-d'œuvre : un salarié (ou un profil libre) sur n jours. */
export type MoLigne = {
  employee_id: string | null
  nom: string
  jours: number
  heures_par_jour: number
  cout_horaire: number
}

export type MainOeuvre = {
  lignes: MoLigne[]
  /** Marge cible en % appliquée aux lignes chiffrées (0 = pas d'application). */
  marge_cible_pct: number
}

export type Result = {
  comprehension: string
  hypotheses: string[]
  pieces: Piece[]
  lignes: Ligne[]
  totaux: Totaux
  remarques: string[]
  /** Questions posées par l'IA avant chiffrage et réponses de l'artisan (étape 3). */
  questions?: { question: string; reponse: string }[]
  main_oeuvre?: MainOeuvre
}

export const moCost = (l: MoLigne) => (Number(l.jours) || 0) * (Number(l.heures_par_jour) || 0) * (Number(l.cout_horaire) || 0)
export const moTotal = (mo?: MainOeuvre) => (mo?.lignes || []).reduce((t, l) => t + moCost(l), 0)

/**
 * Prix de vente déduit d'un coût et d'une marge cible.
 * On raisonne en marge SUR LE PRIX DE VENTE (marge commerciale), pas en
 * coefficient sur le coût : 30% de marge => coût / 0,70.
 */
export function prixDepuisMarge(cout: number, margePct: number): number {
  const m = Math.min(Math.max(Number(margePct) || 0, 0), 95)
  if (!cout) return 0
  return Math.round((cout / (1 - m / 100)) * 100) / 100
}

/** Ligne de la galerie (jointure plan_analyses + plan_uploads). */
export type AnalyseCard = {
  id: string
  created_at: string
  ai_summary: string | null
  total_ht: number
  marge_eur: number
  marge_pct: number
  nb_lignes: number
  original_filename: string | null
  file_type: string | null
  thumbUrl?: string | null
  client_name?: string | null
  project_title?: string | null
}

const num = (v: unknown) => Number(v) || 0

/** Recalcule les totaux à partir des lignes — utilisé après édition (étape 2). */
export function recomputeTotaux(lignes: Ligne[], coutMainOeuvre = 0): Totaux {
  const total_ht = lignes.reduce((t, l) => t + num(l.total_ht), 0)
  const cout_matieres_estime = lignes.reduce((t, l) => t + num(l.cout_unitaire_estime) * num(l.quantite), 0)
  const marge_estimee_eur = total_ht - cout_matieres_estime - coutMainOeuvre
  return {
    total_ht,
    cout_matieres_estime,
    cout_main_oeuvre_estime: coutMainOeuvre,
    marge_estimee_eur,
    marge_estimee_pct: total_ht > 0 ? Math.round((marge_estimee_eur / total_ht) * 100) : 0,
  }
}

/** Garde-fou : l'IA renvoie du JSON libre, on ne fait jamais confiance à sa forme. */
export function normalizeResult(raw: unknown): Result {
  const r = (raw || {}) as Partial<Result>
  const lignes = Array.isArray(r.lignes) ? r.lignes.map(l => ({
    categorie: String(l?.categorie || ''),
    designation: String(l?.designation || 'Ligne'),
    unite: String(l?.unite || 'u'),
    quantite: num(l?.quantite),
    prix_unitaire_ht: num(l?.prix_unitaire_ht),
    total_ht: num(l?.total_ht) || num(l?.quantite) * num(l?.prix_unitaire_ht),
    source_prix: l?.source_prix === 'base' ? 'base' as const : 'estime' as const,
    cout_unitaire_estime: num(l?.cout_unitaire_estime),
  })) : []

  const t = (r.totaux || {}) as Partial<Totaux>
  const totaux: Totaux = {
    total_ht: num(t.total_ht) || lignes.reduce((s, l) => s + l.total_ht, 0),
    cout_matieres_estime: num(t.cout_matieres_estime),
    cout_main_oeuvre_estime: num(t.cout_main_oeuvre_estime),
    marge_estimee_eur: num(t.marge_estimee_eur),
    marge_estimee_pct: num(t.marge_estimee_pct),
  }

  const mo = r.main_oeuvre
  const main_oeuvre: MainOeuvre = {
    lignes: Array.isArray(mo?.lignes) ? mo.lignes.map(l => ({
      employee_id: l?.employee_id ?? null,
      nom: String(l?.nom || 'Intervenant'),
      jours: num(l?.jours),
      heures_par_jour: num(l?.heures_par_jour) || 7,
      cout_horaire: num(l?.cout_horaire),
    })) : [],
    marge_cible_pct: num(mo?.marge_cible_pct),
  }

  return {
    comprehension: String(r.comprehension || ''),
    hypotheses: Array.isArray(r.hypotheses) ? r.hypotheses.map(String) : [],
    pieces: Array.isArray(r.pieces) ? r.pieces.map(p => ({
      nom: String(p?.nom || 'Pièce'),
      surface_sol_m2: num(p?.surface_sol_m2),
      perimetre_ml: num(p?.perimetre_ml),
      surface_murs_m2: num(p?.surface_murs_m2),
    })) : [],
    lignes,
    totaux,
    remarques: Array.isArray(r.remarques) ? r.remarques.map(String) : [],
    questions: Array.isArray(r.questions) ? r.questions.map(q => ({
      question: String(q?.question || ''), reponse: String(q?.reponse || ''),
    })) : [],
    main_oeuvre,
  }
}
