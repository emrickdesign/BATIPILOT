// Signature email — helpers partagés (texte + visuelle).
// La signature TEXTE est ajoutée aux réponses (IA et nouveaux messages).
// La signature VISUELLE est une image PNG hébergée (bucket public `signatures`)
// insérée en bas du mail HTML quand l'utilisateur l'active.

export interface SignatureConfig {
  full_name: string
  role: string
  phone: string
  email: string
  website: string
  photo_url: string | null   // data URL ou URL hébergée (aperçu/génération)
  logo_url: string | null
  bg_color: string
  accent_color: string
  text_color: string
  layout: 'photo_left' | 'compact' | 'banner'
}

export const DEFAULT_SIGNATURE_CONFIG: SignatureConfig = {
  full_name: '',
  role: '',
  phone: '',
  email: '',
  website: '',
  photo_url: null,
  logo_url: null,
  bg_color: '#111111',
  accent_color: '#E0674C',
  text_color: '#FFFFFF',
  layout: 'photo_left',
}

/** Signature texte par défaut, dérivée du nom de la personne + entreprise. */
export function buildDefaultSignatureText(opts: {
  fullName?: string | null
  tradeName?: string | null
  phone?: string | null
  email?: string | null
}): string {
  const lines = ['Cordialement,']
  if (opts.fullName) lines.push(opts.fullName)
  if (opts.tradeName) lines.push(opts.tradeName)
  const coord = [opts.phone, opts.email].filter(Boolean).join(' · ')
  if (coord) lines.push(coord)
  return lines.join('\n')
}

/** Ajoute la signature texte à un corps, sans doublon ni triple saut de ligne. */
export function appendSignature(body: string, signature: string): string {
  const sig = (signature || '').trim()
  if (!sig) return body
  const b = (body || '').replace(/\s+$/, '')
  if (b.includes(sig)) return body       // déjà présente (regénération)
  return b ? `${b}\n\n${sig}` : sig
}

/** Bloc HTML d'une signature visuelle (image hébergée) pour l'insérer dans un mail. */
export function visualSignatureHtml(imageUrl: string): string {
  return `<div style="margin-top:16px"><img src="${imageUrl}" alt="Signature" style="max-width:100%;height:auto;border:0;display:block" /></div>`
}
