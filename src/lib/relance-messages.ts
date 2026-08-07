// Messages de relance pré-rédigés et personnalisés (nom client, référence, montant,
// signature entreprise). L'artisan relit puis envoie en 1 clic (email / WhatsApp / SMS).

const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('fr-FR') : '')
const fmtEuro = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)

export type RelanceMsg = { subject: string; body: string; sms: string }

/** Lien WhatsApp pré-rempli (numéro FR normalisé). */
export function waLink(phone: string | null | undefined, body: string): string | null {
  if (!phone) return null
  let p = phone.replace(/\D/g, '')
  if (p.startsWith('0')) p = '33' + p.slice(1)
  return p.length >= 8 ? `https://wa.me/${p}?text=${encodeURIComponent(body)}` : null
}

// ── Devis sans réponse ──
export function devisRelanceMsg(clientName: string, quoteNumber: string, company: string | null, daysLeft?: number | null): RelanceMsg {
  const hello = `Bonjour ${clientName},`
  const validite = daysLeft != null
    ? (daysLeft > 0 ? ` Il reste valable ${daysLeft} jour${daysLeft > 1 ? 's' : ''}.` : ' Il arrive à expiration.')
    : ''
  const sign = company ? `\n\nBien à vous,\n${company}` : ''
  return {
    subject: `Votre devis ${quoteNumber}`,
    body: `${hello}

Je reviens vers vous au sujet du devis ${quoteNumber} que je vous ai transmis.${validite}

Avez-vous eu l'occasion d'en prendre connaissance ? Je reste à votre disposition pour toute question ou ajustement afin de lancer votre projet.${sign}`,
    sms: `${hello} je reviens vers vous concernant le devis ${quoteNumber}.${validite} Je reste dispo pour toute question.${company ? ` ${company}` : ''}`,
  }
}

// ── Facture non payée ──
export function factureRelanceMsg(clientName: string, invoiceNumber: string, amount: number, dueDate: string | null, overdue: boolean, company: string | null): RelanceMsg {
  const hello = `Bonjour ${clientName},`
  const ech = dueDate ? (overdue ? `, dont l'échéance était fixée au ${fmtDate(dueDate)},` : `, dont l'échéance est fixée au ${fmtDate(dueDate)},`) : ''
  const sign = company ? `\n\nBien à vous,\n${company}` : ''
  return {
    subject: overdue ? `Facture ${invoiceNumber} en attente de règlement` : `Rappel — facture ${invoiceNumber}`,
    body: `${hello}

Sauf erreur de ma part, la facture ${invoiceNumber} d'un montant de ${fmtEuro(amount)}${ech} reste à ce jour non réglée.

Pourriez-vous procéder au règlement dès que possible ? Si le paiement a déjà été effectué, merci de ne pas tenir compte de ce message.${sign}`,
    sms: `${hello} la facture ${invoiceNumber} (${fmtEuro(amount)})${ech ? ' échue' : ''} reste à régler. Merci par avance.${company ? ` ${company}` : ''}`,
  }
}

// ── Chantier à confirmer / planifier ──
export function chantierPlanifMsg(clientName: string, projectTitle: string, company: string | null): RelanceMsg {
  const hello = `Bonjour ${clientName},`
  const sign = company ? `\n\nBien à vous,\n${company}` : ''
  return {
    subject: `Planification — ${projectTitle}`,
    body: `${hello}

Votre devis étant accepté, je souhaite convenir avec vous d'une date pour démarrer le chantier « ${projectTitle} ».

Quelles seraient vos disponibilités dans les prochaines semaines ? Je m'adapte à votre planning.${sign}`,
    sms: `${hello} pour planifier le chantier « ${projectTitle} », quelles sont vos disponibilités ?${company ? ` ${company}` : ''}`,
  }
}
