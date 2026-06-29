// Rôles applicatifs et permissions associées (référence du brief BatiPilot).
// Pour l'instant : configuration des accès de l'équipe. Les identifiants individuels
// (login par salarié, pointage mobile dédié) arrivent dans une phase ultérieure.

export type AccessRole =
  | 'admin' | 'secretaire' | 'chef_equipe' | 'salarie' | 'comptable' | 'commercial' | 'lecteur'

export const accessRoleLabels: Record<AccessRole, string> = {
  admin: 'Admin / dirigeant',
  secretaire: 'Secrétaire / administratif',
  chef_equipe: "Chef d'équipe",
  salarie: 'Salarié terrain',
  comptable: 'Comptable externe',
  commercial: 'Commercial',
  lecteur: 'Lecteur simple',
}

export const accessRoleColors: Record<AccessRole, string> = {
  admin: 'bg-orange-100 text-orange-700',
  secretaire: 'bg-blue-100 text-blue-700',
  chef_equipe: 'bg-violet-100 text-violet-700',
  salarie: 'bg-emerald-100 text-emerald-700',
  comptable: 'bg-amber-100 text-amber-700',
  commercial: 'bg-rose-100 text-rose-700',
  lecteur: 'bg-gray-100 text-gray-600',
}

// Résumé des permissions par rôle (issu du document brief)
export const rolePermissions: Record<AccessRole, string[]> = {
  admin: ['Accès total', 'Paramètres & utilisateurs', 'Validation devis & factures', 'Suivi paiements', 'Gestion équipes', 'Reporting complet'],
  secretaire: ['Clients & prospects', 'Devis', 'Documents', 'Tickets & dépenses', 'Relances', 'Exports comptables'],
  chef_equipe: ['Voir son équipe', 'Valider les heures', 'Ajouter notes & photos', 'Signaler un problème'],
  salarie: ['Voir ses chantiers', 'Déclarer ses heures', 'Pointage photo arrivée/départ', 'Scanner un ticket', 'Photos chantier'],
  comptable: ['Justificatifs', 'Exports', 'Factures', 'Paiements', 'Documents comptables'],
  commercial: ['Prospects & clients', 'Devis', 'Relances', 'Reporting commercial'],
  lecteur: ['Consultation seule', 'Aucune modification'],
}

export const accessRoleOrder: AccessRole[] = ['admin', 'secretaire', 'chef_equipe', 'salarie', 'comptable', 'commercial', 'lecteur']

// ─── Pôle d'interface (accent de couleur) par rôle ──────────────────────────
// Pilote l'attribut `data-pole` sur <html> → reteinte toute l'app (cf. globals.css).
export type Pole = 'commercial' | 'terrain' | 'gestion' | 'direction'

export const roleToPole: Record<AccessRole, Pole> = {
  admin: 'direction',
  secretaire: 'gestion',
  chef_equipe: 'terrain',
  salarie: 'terrain',
  comptable: 'gestion',
  commercial: 'commercial',
  lecteur: 'direction',
}

export const poleLabels: Record<Pole, string> = {
  commercial: 'Commercial',
  terrain: 'Terrain & chantier',
  gestion: 'Gestion & administratif',
  direction: 'Direction',
}

export const isPole = (v: unknown): v is Pole =>
  v === 'commercial' || v === 'terrain' || v === 'gestion' || v === 'direction'
