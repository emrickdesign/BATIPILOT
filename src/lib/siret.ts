// Recherche entreprise via l'API publique gratuite de l'État
// (recherche-entreprises.api.gouv.fr) — pas de clé, pas de coût.
// Sert à pré-remplir une fiche client pro / un devis sans ressaisie.

export interface CompanyResult {
  siren: string
  siret: string // SIRET du siège (14 chiffres)
  name: string // raison sociale / nom complet
  address: string // adresse du siège (rue + CP + ville)
  postalCode: string
  city: string
  director: string // dirigeant principal si disponible
  activity: string // libellé d'activité si disponible
  active: boolean // établissement administrativement actif
}

// Formate un SIRET « 12345678900012 » → « 123 456 789 00012 »
export function formatSiret(siret?: string | null): string {
  if (!siret) return ''
  const d = siret.replace(/\D/g, '')
  if (d.length !== 14) return siret
  return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 9)} ${d.slice(9)}`
}

// Mappe la réponse brute de l'API gouv vers notre type simplifié.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapCompanyResult(r: any): CompanyResult {
  const siege = r?.siege ?? {}
  const dir = Array.isArray(r?.dirigeants) ? r.dirigeants[0] : null
  const director = dir
    ? [dir.prenoms, dir.nom].filter(Boolean).join(' ').trim() ||
      (dir.denomination as string) ||
      ''
    : ''
  return {
    siren: r?.siren ?? '',
    siret: siege?.siret ?? '',
    name: r?.nom_complet || r?.nom_raison_sociale || '',
    address: siege?.adresse || '',
    postalCode: siege?.code_postal || '',
    city: siege?.libelle_commune || '',
    director,
    activity: r?.libelle_activite_principale || siege?.libelle_activite_principale || '',
    active: (r?.etat_administratif ?? siege?.etat_administratif) === 'A',
  }
}
