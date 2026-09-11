// Cycle de vie d'une facture électronique côté plateforme agréée (libellés officiels
// de la réforme : Déposée, Rejetée, Refusée, Encaissée… sont les statuts obligatoires).
// Partagé serveur / navigateur.

export type EInvoiceStatus =
  | 'en_cours' | 'deposee' | 'emise' | 'prise_en_charge' | 'approuvee' | 'en_litige'
  | 'refusee' | 'rejetee' | 'encaissee_partiellement' | 'encaissee' | 'erreur'

export type StatusTone = 'info' | 'success' | 'warning' | 'danger'

export const EINVOICE_STATUSES: Record<EInvoiceStatus, { label: string; tone: StatusTone; help: string }> = {
  en_cours: { label: 'Envoi en cours', tone: 'info', help: 'La plateforme contrôle la facture avant de la déposer.' },
  deposee: { label: 'Déposée', tone: 'info', help: 'Déposée sur votre plateforme agréée, en route vers la plateforme de votre client.' },
  emise: { label: 'Émise', tone: 'info', help: 'Transmise à la plateforme de votre client.' },
  prise_en_charge: { label: 'Prise en charge', tone: 'info', help: 'Votre client a reçu la facture et la traite.' },
  approuvee: { label: 'Approuvée', tone: 'success', help: 'Votre client a validé la facture.' },
  en_litige: { label: 'En litige', tone: 'warning', help: 'Votre client conteste la facture : prenez contact avec lui.' },
  refusee: { label: 'Refusée', tone: 'danger', help: 'Votre client a refusé la facture : faites un avoir puis une nouvelle facture.' },
  rejetee: { label: 'Rejetée', tone: 'danger', help: 'La plateforme a rejeté la facture (donnée invalide) : corrigez-la puis renvoyez-la.' },
  encaissee_partiellement: { label: 'Partiellement encaissée', tone: 'success', help: 'Un paiement partiel a été déclaré.' },
  encaissee: { label: 'Encaissée', tone: 'success', help: 'Le paiement a été déclaré sur la plateforme.' },
  erreur: { label: 'Échec de l’envoi', tone: 'danger', help: 'L’envoi n’a pas abouti : vérifiez la connexion à votre plateforme puis réessayez.' },
}

export function statusInfo(status?: string | null) {
  return status && status in EINVOICE_STATUSES ? EINVOICE_STATUSES[status as EInvoiceStatus] : null
}

/** Jamais transmise, ou transmission à refaire (rejet technique / échec d'envoi). */
export const canSendAgain = (status?: string | null) => !status || status === 'rejetee' || status === 'erreur'

/** Transmise et prise en compte : la facture ne se modifie plus, on corrige par avoir. */
export const isLocked = (status?: string | null) => !!status && !canSendAgain(status)

/** Statuts qui n'évolueront plus : inutile d'interroger la plateforme. */
export const isSettled = (status?: string | null) =>
  status === 'encaissee' || status === 'refusee' || status === 'rejetee' || status === 'erreur'
