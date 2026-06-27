// Catégories de documents (category est du texte libre en base)
export const documentCategoryOptions: string[] = [
  'Devis', 'Facture', 'Ticket / justificatif', 'Plan', 'Photo chantier',
  'Contrat', 'Bon de commande', 'Bon d\'intervention', 'Attestation',
  'Document comptable', 'Assurance', 'Autre',
]

export const documentCategoryColors: Record<string, string> = {
  'Devis': 'bg-orange-100 text-orange-700',
  'Facture': 'bg-violet-100 text-violet-700',
  'Ticket / justificatif': 'bg-amber-100 text-amber-700',
  'Plan': 'bg-slate-100 text-slate-700',
  'Photo chantier': 'bg-blue-100 text-blue-700',
  'Contrat': 'bg-emerald-100 text-emerald-700',
  'Bon de commande': 'bg-cyan-100 text-cyan-700',
  'Bon d\'intervention': 'bg-teal-100 text-teal-700',
  'Attestation': 'bg-indigo-100 text-indigo-700',
  'Document comptable': 'bg-purple-100 text-purple-700',
  'Assurance': 'bg-rose-100 text-rose-700',
  'Autre': 'bg-gray-100 text-gray-600',
}

export function formatFileSize(bytes?: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}
