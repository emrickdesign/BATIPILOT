// Demande d'avis Google — messages pré-rédigés (l'artisan relit/envoie en 1 clic).

export function reviewSms(companyName: string | null, clientName: string | null, reviewUrl: string) {
  const hello = clientName ? `Bonjour ${clientName},` : 'Bonjour,'
  const sign = companyName ? ` ${companyName}` : ''
  return `${hello} merci de votre confiance ! Si vous êtes satisfait de notre travail, votre avis nous aiderait énormément : ${reviewUrl} — Merci beaucoup !${sign}`
}

export function reviewEmailSubject(companyName: string | null) {
  return companyName ? `Votre avis compte pour ${companyName}` : 'Votre avis nous aiderait beaucoup'
}

export function reviewEmailBody(companyName: string | null, clientName: string | null, reviewUrl: string) {
  const hello = clientName ? `Bonjour ${clientName},` : 'Bonjour,'
  const sign = companyName ? `\n\nEncore merci,\n${companyName}` : '\n\nEncore merci !'
  return `${hello}

Merci de nous avoir fait confiance pour votre chantier.

Si vous êtes satisfait du travail réalisé, laisser un avis Google ne vous prendra qu'une minute et nous aide énormément à faire connaître notre savoir-faire :

${reviewUrl}

Un grand merci pour votre soutien.${sign}`
}

// Liens prêts à ouvrir depuis le mobile.
export function mailtoLink(email: string, subject: string, body: string) {
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

export function smsLink(phone: string, body: string) {
  const clean = phone.replace(/[^\d+]/g, '')
  return `sms:${clean}?&body=${encodeURIComponent(body)}`
}
