// Catégorisation automatique des dépenses bancaires (débits) par mots-clés du libellé.
// Heuristique volontairement simple : elle s'affine avec les vrais libellés en production.
// L'ordre compte (les règles les plus spécifiques d'abord, ex. TOTALENERGIES avant TOTAL).

export type ExpenseCategory =
  | 'salaires' | 'cotisations' | 'impots' | 'fournisseurs' | 'carburant'
  | 'assurance' | 'energie_telecom' | 'loyer' | 'vehicule' | 'frais_bancaires' | 'autre'

export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  salaires: 'Salaires',
  cotisations: 'Cotisations sociales',
  impots: 'Impôts & taxes',
  fournisseurs: 'Fournisseurs & matériaux',
  carburant: 'Carburant',
  assurance: 'Assurances',
  energie_telecom: 'Énergie & télécom',
  loyer: 'Loyer',
  vehicule: 'Véhicule & péages',
  frais_bancaires: 'Frais bancaires',
  autre: 'Autre',
}

// Règles : première catégorie dont un mot-clé apparaît dans le libellé (en MAJUSCULES).
const RULES: { cat: ExpenseCategory; keywords: string[] }[] = [
  { cat: 'salaires', keywords: ['SALAIRE', 'VIR SALAIRE', 'PAIE', 'REMUNERATION', 'ACOMPTE SALAIRE'] },
  { cat: 'cotisations', keywords: ['URSSAF', 'RSI', 'SSI', 'COTISATION', 'MSA', 'CIPAV', 'RETRAITE', 'PROBTP', 'PRO BTP', 'CONGES INTEMPERIES', 'CIBTP'] },
  { cat: 'impots', keywords: ['DGFIP', 'IMPOT', 'TVA', 'TRESOR PUBLIC', 'FINANCES PUBLIQUES', 'TAXE', 'CFE', 'CVAE'] },
  { cat: 'energie_telecom', keywords: ['TOTALENERGIES', 'EDF', 'ENGIE', 'ORANGE', 'SFR', 'BOUYGUES', 'FREE', 'SOSH', 'TELECOM', 'ELECTRICITE', 'GAZ'] },
  { cat: 'carburant', keywords: ['CARBURANT', 'STATION', 'ESSO', 'SHELL', 'AVIA', 'ARAL', 'BP ', 'TOTAL', 'ENERGIE ROUTE'] },
  { cat: 'fournisseurs', keywords: ['POINT P', 'POINTP', 'LEROY MERLIN', 'BRICO', 'CEDEO', 'REXEL', 'PLATEFORME DU BATIMENT', 'GEDIMAT', 'BIG MAT', 'BIGMAT', 'CASTORAMA', 'WELDOM', 'TOUT FAIRE', 'SAMSE', 'FRANS BONHOMME', 'PROLIANS', 'DESCOURS', 'TERREAL', 'SONEPAR', 'MATERIAUX'] },
  { cat: 'assurance', keywords: ['ASSURANCE', 'MAAF', 'AXA', 'ALLIANZ', 'GROUPAMA', 'MMA', 'GENERALI', 'SWISSLIFE', 'MUTUELLE', 'DECENNALE'] },
  { cat: 'vehicule', keywords: ['PEAGE', 'VINCI AUTOROUTE', 'APRR', 'SANEF', 'NORAUTO', 'FEU VERT', 'GARAGE', 'CONTROLE TECHNIQUE', 'LEASING', 'LOA '] },
  { cat: 'loyer', keywords: ['LOYER', 'SCI ', 'BAIL', 'LOCATION LOCAL'] },
  { cat: 'frais_bancaires', keywords: ['FRAIS', 'COMMISSION', 'COTISATION CARTE', 'AGIOS', 'INTERETS', 'QONTO', 'SHINE', 'ABONNEMENT'] },
]

export function categorizeExpense(label: string | null | undefined): ExpenseCategory {
  const s = (label || '').toUpperCase()
  for (const r of RULES) {
    if (r.keywords.some(k => s.includes(k))) return r.cat
  }
  return 'autre'
}
