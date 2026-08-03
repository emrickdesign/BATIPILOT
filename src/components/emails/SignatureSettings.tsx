'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { X, Loader2, Upload, Wand2, Image as ImageIcon, Type, Plus, Trash2 } from 'lucide-react'
import {
  DEFAULT_SIGNATURE_CONFIG, buildDefaultSignatureText, CONTACT_TYPES,
  type SignatureConfig, type Contact, type ContactType, type BackgroundStyle,
} from '@/lib/signature'

// Convertit une image (URL distante) en data URL. Indispensable avant de
// rasteriser le SVG : une image distante « taint » le canvas et fait échouer
// toBlob (c'était la cause du « génération impossible » quand le logo venait
// de la fiche entreprise). Les data URLs sont renvoyées telles quelles.
async function toDataUrl(src: string | null): Promise<string | null> {
  if (!src) return null
  if (src.startsWith('data:')) return src
  try {
    const res = await fetch(src, { mode: 'cors' })
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result))
      r.onerror = () => reject(new Error('read'))
      r.readAsDataURL(blob)
    })
  } catch { return null }
}

// ─── Icônes vectorielles (tracé 24×24, style ligne) dessinées dans les tuiles ──
const ICON_PATHS: Record<ContactType, string> = {
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.81.36 1.6.68 2.34a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.74-1.24a2 2 0 0 1 2.11-.45c.74.32 1.53.55 2.34.68A2 2 0 0 1 22 16.92z"/>',
  email: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/>',
  website: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  address: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  whatsapp: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z"/>',
  instagram: '<rect x="2" y="2" width="20" height="20" rx="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>',
  linkedin: '<path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/>',
}

const CARD_W = 1100

function esc(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Choisit noir ou blanc pour rester lisible sur la couleur d'accent.
function contrastColor(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return '#FFFFFF'
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#111111' : '#FFFFFF'
}

interface Rect { x: number; y: number; w: number; h: number }
interface SigGeometry {
  svg: string
  height: number
  photo: (Rect & { rx: number }) | null
  logo: Rect | null
}

// withImages=false : produit un SVG SANS <image> (fond, texte, icônes). La photo
// et le logo sont alors dessinés séparément sur le canvas (voir renderSignaturePng)
// — évite le bug WebKit/Safari qui « taint » le canvas dès qu'un SVG embarque une image.
function buildSignatureSvg(c: SignatureConfig, opts: { withImages?: boolean } = {}): SigGeometry {
  const withImages = opts.withImages !== false
  const pad = 48
  const rows = c.contacts.filter(r => r.value.trim())
  const rowTop = 198
  const rowStep = 62
  // Hauteur dynamique : s'agrandit avec le nombre de lignes de contact.
  const contentBottom = rowTop + Math.max(rows.length, 1) * rowStep + 28
  const H = Math.max(460, contentBottom)

  const hasPhoto = !!c.photo_url
  const photoSize = H - pad * 2
  const cardR = Math.max(0, Math.min(60, c.card_radius))
  const iconR = Math.max(0, Math.min(28, c.icon_radius))
  const iconColor = contrastColor(c.accent_color)

  // Fonds « séparés » (vague, diagonale) : une bande visuelle à gauche (bg_color2)
  // accueille la photo/logo, et le CONTENU commence toujours à DROITE du
  // séparateur — rien ne le traverse, quelle que soit la présence d'une photo.
  const split = c.bg_style === 'wave' || c.bg_style === 'diagonal'
  const A = 40 // amplitude de la vague / inclinaison de la diagonale
  const bandW = split ? (hasPhoto ? pad + photoSize + 60 : 220) : 0
  const textX = split ? bandW + A + 28 : (hasPhoto ? pad + photoSize + 48 : pad)

  let bgLayer = ''
  if (c.bg_style === 'dots') {
    bgLayer = `<rect width="${CARD_W}" height="${H}" fill="url(#sigdots)"/>`
  } else if (c.bg_style === 'wave') {
    bgLayer = `<path d="M0 0 L ${bandW} 0 C ${bandW - A} ${Math.round(H * 0.30)}, ${bandW + A} ${Math.round(H * 0.70)}, ${bandW} ${H} L 0 ${H} Z" fill="${esc(c.bg_color2)}"/>`
  } else if (c.bg_style === 'diagonal') {
    bgLayer = `<path d="M0 0 L ${bandW + A} 0 L ${bandW - A} ${H} L 0 ${H} Z" fill="${esc(c.bg_color2)}"/>`
  }

  // Géométrie photo/logo — utilisée pour le SVG (aperçu) ET pour la composition canvas.
  const photo = hasPhoto ? { x: pad, y: pad, w: photoSize, h: photoSize, rx: Math.min(cardR, photoSize / 2) } : null
  // Logo : dans la bande gauche (centré) quand il n'y a pas de photo mais un
  // fond séparé ; sinon en haut à droite, côté contenu.
  let logo: Rect | null = null
  if (c.logo_url) {
    if (split && !hasPhoto) {
      const w = Math.min(160, bandW - 2 * pad), h = 64
      logo = { x: Math.max(pad, (bandW - A - w) / 2), y: Math.round((H - h) / 2), w, h }
    } else {
      logo = { x: CARD_W - pad - 200, y: pad, w: 200, h: 72 }
    }
  }

  const defs = `<defs>
    <clipPath id="sigcard"><rect width="${CARD_W}" height="${H}" rx="${cardR}"/></clipPath>
    ${withImages && photo ? `<clipPath id="sigphoto"><rect x="${photo.x}" y="${photo.y}" width="${photo.w}" height="${photo.h}" rx="${photo.rx}"/></clipPath>` : ''}
    ${c.bg_style === 'dots' ? `<pattern id="sigdots" width="36" height="36" patternUnits="userSpaceOnUse"><circle cx="7" cy="7" r="3" fill="${esc(c.bg_color2)}"/></pattern>` : ''}
  </defs>`

  const photoBlock = withImages && photo && c.photo_url
    ? `<image href="${c.photo_url}" x="${photo.x}" y="${photo.y}" width="${photo.w}" height="${photo.h}" preserveAspectRatio="xMidYMid slice" clip-path="url(#sigphoto)"/>`
    : ''
  const logoBlock = withImages && logo && c.logo_url
    ? `<image href="${c.logo_url}" x="${logo.x}" y="${logo.y}" width="${logo.w}" height="${logo.h}" preserveAspectRatio="xMidYMid meet"/>`
    : ''

  let rowsSvg = ''
  rows.forEach((r, i) => {
    const y = rowTop + i * rowStep
    const label = CONTACT_TYPES.find(t => t.id === r.type)?.label || ''
    rowsSvg += `
      <rect x="${textX}" y="${y}" width="48" height="48" rx="${iconR}" fill="${esc(c.accent_color)}"/>
      <g transform="translate(${textX + 12},${y + 12})" fill="none" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[r.type] || ''}</g>
      <text x="${textX + 66}" y="${y + 18}" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="700" fill="${esc(c.accent_color)}">${esc(label)}</text>
      <text x="${textX + 66}" y="${y + 41}" font-family="Arial, Helvetica, sans-serif" font-size="24" fill="${esc(c.text_color)}">${esc(r.value)}</text>`
  })

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${H}" viewBox="0 0 ${CARD_W} ${H}">
    ${defs}
    <rect width="${CARD_W}" height="${H}" rx="${cardR}" fill="${esc(c.bg_color)}"/>
    <g clip-path="url(#sigcard)">${bgLayer}</g>
    <rect x="${textX}" y="${pad + 4}" width="6" height="${c.role ? 150 : 96}" rx="3" fill="${esc(c.accent_color)}"/>
    ${photoBlock}
    ${logoBlock}
    <text x="${textX + 24}" y="${pad + 74}" font-family="Arial, Helvetica, sans-serif" font-size="56" font-weight="800" fill="${esc(c.text_color)}">${esc(c.full_name || 'Prénom Nom')}</text>
    ${c.role ? `<text x="${textX + 24}" y="${pad + 122}" font-family="Arial, Helvetica, sans-serif" font-size="30" fill="${esc(c.accent_color)}">${esc(c.role)}</text>` : ''}
    ${rowsSvg}
  </svg>`
  return { svg, height: H, photo, logo }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image load'))
    img.src = src
  })
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

// object-fit: cover
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const ir = img.width / img.height, r = w / h
  let sw: number, sh: number, sx: number, sy: number
  if (ir > r) { sh = img.height; sw = sh * r; sx = (img.width - sw) / 2; sy = 0 }
  else { sw = img.width; sh = sw / r; sx = 0; sy = (img.height - sh) / 2 }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h)
}

// object-fit: contain (centré)
function drawContain(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const ir = img.width / img.height, r = w / h
  let dw: number, dh: number
  if (ir > r) { dw = w; dh = w / ir } else { dh = h; dw = h * ir }
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
}

// Rendu PNG robuste (Safari + Chrome) : le SVG rasterisé ne contient AUCUNE image ;
// photo et logo sont dessinés séparément depuis leurs data URLs → pas de « taint ».
// `c` doit déjà avoir des images en data URL (voir toDataUrl).
async function renderSignaturePng(c: SignatureConfig): Promise<Blob> {
  const { svg, height, photo, logo } = buildSignatureSvg(c, { withImages: false })
  const scale = 2
  const canvas = document.createElement('canvas')
  canvas.width = CARD_W * scale
  canvas.height = height * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas indisponible')
  ctx.scale(scale, scale)

  const baseImg = await loadImage(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`)
  ctx.drawImage(baseImg, 0, 0, CARD_W, height)

  if (photo && c.photo_url) {
    const p = await loadImage(c.photo_url)
    ctx.save()
    roundRectPath(ctx, photo.x, photo.y, photo.w, photo.h, photo.rx)
    ctx.clip()
    drawCover(ctx, p, photo.x, photo.y, photo.w, photo.h)
    ctx.restore()
  }
  if (logo && c.logo_url) {
    const l = await loadImage(c.logo_url)
    drawContain(ctx, l, logo.x, logo.y, logo.w, logo.h)
  }

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('conversion PNG impossible'))), 'image/png'))
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(new Error('read'))
    r.readAsDataURL(file)
  })
}

// Modèles prédéfinis : couleurs + arrondis en 1 clic.
const TEMPLATES: { name: string; patch: Partial<SignatureConfig> }[] = [
  { name: 'Sombre', patch: { bg_color: '#111111', bg_color2: '#2A2A2A', bg_style: 'solid', accent_color: '#E0674C', text_color: '#FFFFFF', card_radius: 28, icon_radius: 12 } },
  { name: 'Marine', patch: { bg_color: '#0F1B2D', bg_color2: '#16304d', bg_style: 'solid', accent_color: '#F2B705', text_color: '#FFFFFF', card_radius: 20, icon_radius: 10 } },
  { name: 'Vague', patch: { bg_color: '#111111', bg_color2: '#F5EFE6', bg_style: 'wave', accent_color: '#E0674C', text_color: '#FFFFFF', card_radius: 28, icon_radius: 12 } },
  { name: 'Points', patch: { bg_color: '#0E3A34', bg_color2: '#1c5148', bg_style: 'dots', accent_color: '#F2B705', text_color: '#FFFFFF', card_radius: 24, icon_radius: 12 } },
  { name: 'Clair', patch: { bg_color: '#F5EFE6', bg_color2: '#e9dfce', bg_style: 'solid', accent_color: '#C14E33', text_color: '#1A1A1A', card_radius: 24, icon_radius: 12 } },
  { name: 'Anguleux', patch: { bg_color: '#1A1A1A', bg_color2: '#2A2A2A', bg_style: 'diagonal', accent_color: '#22A45A', text_color: '#FFFFFF', card_radius: 0, icon_radius: 0 } },
  { name: 'Tout rond', patch: { bg_color: '#14213D', bg_color2: '#22345c', bg_style: 'solid', accent_color: '#FCA311', text_color: '#FFFFFF', card_radius: 48, icon_radius: 24 } },
]

const BG_STYLES: { id: BackgroundStyle; label: string }[] = [
  { id: 'solid', label: 'Uni' },
  { id: 'dots', label: 'Points' },
  { id: 'wave', label: 'Vague' },
  { id: 'diagonal', label: 'Diagonale' },
]

const PALETTES: [string, string, string][] = [
  ['#111111', '#E0674C', '#FFFFFF'],
  ['#0F1B2D', '#22A45A', '#FFFFFF'],
  ['#1A1526', '#C77DFF', '#FFFFFF'],
  ['#F5EFE6', '#C14E33', '#1A1A1A'],
  ['#0E3A34', '#F2B705', '#FFFFFF'],
  ['#14213D', '#FCA311', '#FFFFFF'],
]

// ─── Composant ──────────────────────────────────────────────────────────────
export default function SignatureSettings({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'texte' | 'visuelle'>('texte')
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)

  const [signatureText, setSignatureText] = useState('')
  const [defaultText, setDefaultText] = useState('')
  const [config, setConfig] = useState<SignatureConfig>(DEFAULT_SIGNATURE_CONFIG)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [includeVisual, setIncludeVisual] = useState(false)

  const photoRef = useRef<HTMLInputElement>(null)
  const logoRef = useRef<HTMLInputElement>(null)
  const importRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setReady(true); return }
      setUserId(user.id)
      const [{ data: profile }, { data: company }, { data: sig }] = await Promise.all([
        supabase.from('profiles').select('full_name').eq('id', user.id).single(),
        supabase.from('companies').select('trade_name, phone, email, website, address, logo_url').eq('user_id', user.id).maybeSingle(),
        supabase.from('email_signatures').select('*').eq('user_id', user.id).maybeSingle(),
      ])
      const def = buildDefaultSignatureText({
        fullName: profile?.full_name, tradeName: company?.trade_name,
        phone: company?.phone, email: company?.email,
      })
      setDefaultText(def)
      setSignatureText(sig?.signature_text || def)
      setImageUrl(sig?.signature_image_url || null)
      setIncludeVisual(!!sig?.include_visual)

      const saved = (sig?.config || null) as (Partial<SignatureConfig> & { phone?: string; email?: string; website?: string }) | null
      // Contacts : reprend l'enregistré ; sinon migre l'ancien format plat ;
      // sinon pré-remplit avec les coordonnées de l'entreprise.
      let contacts: Contact[] = []
      if (Array.isArray(saved?.contacts)) {
        contacts = saved!.contacts.filter(c => c && typeof c.value === 'string')
      } else if (saved && (saved.phone || saved.email || saved.website)) {
        contacts = [
          { type: 'phone' as ContactType, value: saved.phone || '' },
          { type: 'email' as ContactType, value: saved.email || '' },
          { type: 'website' as ContactType, value: saved.website || '' },
        ].filter(c => c.value)
      } else {
        contacts = [
          { type: 'phone' as ContactType, value: company?.phone || '' },
          { type: 'email' as ContactType, value: company?.email || '' },
          { type: 'website' as ContactType, value: company?.website || '' },
        ].filter(c => c.value)
        if (!contacts.length) contacts = [{ type: 'phone', value: '' }]
      }

      // Photo/logo convertis en data URL dès le chargement (le logo entreprise
      // est une URL distante) → aperçu correct + génération sans « taint ».
      const [photoData, logoData] = await Promise.all([
        toDataUrl(saved?.photo_url ?? null),
        toDataUrl(saved?.logo_url ?? company?.logo_url ?? null),
      ])
      setConfig({
        ...DEFAULT_SIGNATURE_CONFIG,
        full_name: saved?.full_name ?? profile?.full_name ?? '',
        role: saved?.role ?? '',
        contacts,
        photo_url: photoData,
        logo_url: logoData,
        bg_color: saved?.bg_color ?? DEFAULT_SIGNATURE_CONFIG.bg_color,
        bg_color2: saved?.bg_color2 ?? DEFAULT_SIGNATURE_CONFIG.bg_color2,
        bg_style: saved?.bg_style ?? DEFAULT_SIGNATURE_CONFIG.bg_style,
        accent_color: saved?.accent_color ?? DEFAULT_SIGNATURE_CONFIG.accent_color,
        text_color: saved?.text_color ?? DEFAULT_SIGNATURE_CONFIG.text_color,
        card_radius: saved?.card_radius ?? DEFAULT_SIGNATURE_CONFIG.card_radius,
        icon_radius: saved?.icon_radius ?? DEFAULT_SIGNATURE_CONFIG.icon_radius,
        layout: 'photo_left',
      })
      setReady(true)
    })
  }, [])

  function setC<K extends keyof SignatureConfig>(k: K, v: SignatureConfig[K]) {
    setConfig(prev => ({ ...prev, [k]: v }))
  }

  function updateContact(i: number, patch: Partial<Contact>) {
    setConfig(prev => ({ ...prev, contacts: prev.contacts.map((c, j) => j === i ? { ...c, ...patch } : c) }))
  }
  function addContact() {
    setConfig(prev => ({ ...prev, contacts: [...prev.contacts, { type: 'phone', value: '' }] }))
  }
  function removeContact(i: number) {
    setConfig(prev => ({ ...prev, contacts: prev.contacts.filter((_, j) => j !== i) }))
  }

  async function pickImage(ref: React.RefObject<HTMLInputElement | null>, key: 'photo_url' | 'logo_url') {
    const f = ref.current?.files?.[0]
    if (!f) return
    if (!f.type.startsWith('image/')) { toast.error('Choisissez une image'); return }
    if (f.size > 3 * 1024 * 1024) { toast.error('Image trop lourde (3 Mo max)'); return }
    try { setC(key, await fileToDataUrl(f)) } catch { toast.error('Lecture impossible') }
  }

  function randomColors() {
    const idx = new Date().getSeconds() % PALETTES.length
    const [bg, accent, text] = PALETTES[idx]
    setConfig(prev => ({ ...prev, bg_color: bg, accent_color: accent, text_color: text }))
  }

  function applyTemplate(patch: Partial<SignatureConfig>) {
    setConfig(prev => ({ ...prev, ...patch }))
  }

  async function saveText() {
    if (!userId) return
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('email_signatures')
      .upsert({ user_id: userId, signature_text: signatureText, updated_at: new Date().toISOString() })
    setSaving(false)
    toast[error ? 'error' : 'success'](error ? 'Enregistrement impossible' : 'Signature texte enregistrée')
  }

  async function generateAndSave() {
    if (!userId) return
    setSaving(true)
    try {
      // Images en data URL (jamais d'URL distante) pour éviter le « taint » canvas.
      const safe = { ...config, photo_url: await toDataUrl(config.photo_url), logo_url: await toDataUrl(config.logo_url) }
      const blob = await renderSignaturePng(safe)
      const supabase = createClient()
      const path = `${userId}/signature.png`
      const up = await supabase.storage.from('signatures').upload(path, blob, {
        contentType: 'image/png', upsert: true, cacheControl: '0',
      })
      if (up.error) throw up.error
      const { data: pub } = supabase.storage.from('signatures').getPublicUrl(path)
      const url = `${pub.publicUrl}?v=${Date.now()}`
      const { error } = await supabase.from('email_signatures').upsert({
        user_id: userId, signature_image_url: url, config: safe, include_visual: true, updated_at: new Date().toISOString(),
      })
      if (error) throw error
      setImageUrl(url)
      setIncludeVisual(true)
      toast.success('Signature enregistrée — elle sera ajoutée à vos mails')
    } catch (e) {
      console.error('Signature enregistrement:', e)
      toast.error(`Enregistrement impossible${e instanceof Error && e.message ? ` : ${e.message}` : ' — réessayez'}`)
    } finally {
      setSaving(false)
    }
  }

  async function importImage() {
    const f = importRef.current?.files?.[0]
    if (!f || !userId) return
    if (!f.type.startsWith('image/')) { toast.error('Choisissez une image'); return }
    if (f.size > 3 * 1024 * 1024) { toast.error('Image trop lourde (3 Mo max)'); return }
    setSaving(true)
    try {
      const supabase = createClient()
      const ext = f.type === 'image/png' ? 'png' : f.type === 'image/webp' ? 'webp' : 'jpg'
      const path = `${userId}/imported.${ext}`
      const up = await supabase.storage.from('signatures').upload(path, f, { contentType: f.type, upsert: true, cacheControl: '0' })
      if (up.error) throw up.error
      const { data: pub } = supabase.storage.from('signatures').getPublicUrl(path)
      const url = `${pub.publicUrl}?v=${Date.now()}`
      const { error } = await supabase.from('email_signatures').upsert({
        user_id: userId, signature_image_url: url, include_visual: true, updated_at: new Date().toISOString(),
      })
      if (error) throw error
      setImageUrl(url)
      setIncludeVisual(true)
      toast.success('Signature importée')
    } catch { toast.error('Import impossible') }
    finally { setSaving(false) }
  }

  async function toggleInclude(v: boolean) {
    setIncludeVisual(v)
    if (!userId) return
    await createClient().from('email_signatures')
      .upsert({ user_id: userId, include_visual: v, updated_at: new Date().toISOString() })
  }

  const previewSvg = buildSignatureSvg(config).svg

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="font-heading text-lg font-bold text-marine">Ma signature email</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Fermer">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex gap-1 border-b px-4 pt-2">
          <button onClick={() => setTab('texte')} className={`flex items-center gap-1.5 rounded-t-lg px-4 py-2 text-sm font-medium ${tab === 'texte' ? 'border-b-2 border-[#E0674C] text-[#E0674C]' : 'text-gray-500 hover:text-gray-800'}`}>
            <Type className="h-4 w-4" /> Texte
          </button>
          <button onClick={() => setTab('visuelle')} className={`flex items-center gap-1.5 rounded-t-lg px-4 py-2 text-sm font-medium ${tab === 'visuelle' ? 'border-b-2 border-[#E0674C] text-[#E0674C]' : 'text-gray-500 hover:text-gray-800'}`}>
            <ImageIcon className="h-4 w-4" /> Visuelle
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {!ready ? (
            <div className="grid place-items-center py-16"><Loader2 className="h-6 w-6 animate-spin text-[#E0674C]" /></div>
          ) : tab === 'texte' ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">Ajoutée automatiquement en bas de vos réponses (IA et nouveaux messages).</p>
              <textarea
                value={signatureText}
                onChange={e => setSignatureText(e.target.value)}
                rows={6}
                className="w-full resize-none rounded-lg border border-gray-200 p-3 text-sm outline-none focus:border-[#E0674C]"
                placeholder={defaultText}
              />
              <div className="flex items-center gap-2">
                <Button onClick={saveText} disabled={saving} className="gap-1.5 bg-[#E0674C] hover:bg-[#c9563d]">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Enregistrer
                </Button>
                <Button variant="ghost" onClick={() => setSignatureText(defaultText)} className="text-sm text-gray-500">
                  Réinitialiser
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-5 lg:grid-cols-2">
              {/* Colonne gauche : aperçu + actions, toujours visibles (collant) */}
              <div className="space-y-3 lg:sticky lg:top-0 lg:self-start">
                {/* Pas d'arrondi CSS ici, sinon il masque l'arrondi réel de la carte */}
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`data:image/svg+xml;utf8,${encodeURIComponent(previewSvg)}`} alt="Aperçu signature" className="w-full" />
                </div>
                {/* Modèles — sous le rendu visuel, alignés en grille */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Modèles</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {TEMPLATES.map(t => (
                      <button key={t.name} type="button" onClick={() => applyTemplate(t.patch)}
                        className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-2 py-2 text-xs font-medium text-gray-700 transition-colors hover:border-[#E0674C] hover:text-[#E0674C]">
                        <span className="flex h-3.5 w-3.5 flex-shrink-0 overflow-hidden rounded-full border border-black/10">
                          <span className="w-1/2" style={{ background: t.patch.bg_color }} />
                          <span className="w-1/2" style={{ background: t.patch.accent_color }} />
                        </span>
                        <span className="truncate">{t.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                  <Button onClick={generateAndSave} disabled={saving} className="gap-1.5 bg-[#E0674C] hover:bg-[#c9563d]">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} Enregistrer
                  </Button>
                  <input ref={importRef} type="file" accept="image/*" hidden onChange={() => importImage()} />
                  <Button variant="outline" onClick={() => importRef.current?.click()} disabled={saving} className="gap-1.5"><Upload className="h-4 w-4" /> Importer ma signature</Button>
                </div>
                {imageUrl && (
                  <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-3">
                    <p className="text-xs font-medium text-gray-500">Signature enregistrée (utilisée dans les mails)</p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imageUrl} alt="Signature enregistrée" className="max-h-24 rounded-lg border border-gray-200" />
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600">
                      <input type="checkbox" checked={includeVisual} onChange={e => toggleInclude(e.target.checked)} className="h-4 w-4 accent-[#E0674C]" />
                      L&apos;inclure par défaut dans mes mails
                    </label>
                  </div>
                )}
              </div>

              {/* Colonne droite : réglages */}
              <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Prénom Nom"><Input value={config.full_name} onChange={e => setC('full_name', e.target.value)} placeholder="Jean Dupont" /></Field>
                <Field label="Rôle / fonction"><Input value={config.role} onChange={e => setC('role', e.target.value)} placeholder="Gérant" /></Field>
              </div>

              {/* Contacts dynamiques */}
              <div className="space-y-1.5">
                <Label>Coordonnées</Label>
                <div className="space-y-2">
                  {config.contacts.map((ct, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-gray-50/60 p-1.5">
                      <select
                        value={ct.type}
                        onChange={e => updateContact(i, { type: e.target.value as ContactType })}
                        className="h-9 flex-shrink-0 rounded-xl border-0 bg-white px-2.5 text-sm font-medium text-gray-700 shadow-sm outline-none"
                      >
                        {CONTACT_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                      </select>
                      <Input value={ct.value} onChange={e => updateContact(i, { value: e.target.value })} placeholder="Valeur…" className="h-9 flex-1 rounded-xl border-0 bg-white shadow-sm" />
                      <button type="button" onClick={() => removeContact(i)} className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500" aria-label="Retirer">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <Button variant="outline" size="sm" onClick={addContact} className="gap-1.5 rounded-full"><Plus className="h-3.5 w-3.5" /> Ajouter une info</Button>
              </div>

              {/* Photo + logo */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Photo</Label>
                  <div className="flex items-center gap-2">
                    <input ref={photoRef} type="file" accept="image/*" hidden onChange={() => pickImage(photoRef, 'photo_url')} />
                    <Button variant="outline" size="sm" onClick={() => photoRef.current?.click()} className="gap-1.5"><Upload className="h-3.5 w-3.5" /> Importer</Button>
                    {config.photo_url && <Button variant="ghost" size="sm" onClick={() => setC('photo_url', null)} className="text-xs text-gray-400">Retirer</Button>}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Logo</Label>
                  <div className="flex items-center gap-2">
                    <input ref={logoRef} type="file" accept="image/*" hidden onChange={() => pickImage(logoRef, 'logo_url')} />
                    <Button variant="outline" size="sm" onClick={() => logoRef.current?.click()} className="gap-1.5"><Upload className="h-3.5 w-3.5" /> Importer</Button>
                    {config.logo_url && <Button variant="ghost" size="sm" onClick={() => setC('logo_url', null)} className="text-xs text-gray-400">Retirer</Button>}
                  </div>
                </div>
              </div>

              {/* Couleurs */}
              <div className="flex flex-wrap items-end gap-4">
                <ColorField label="Fond" value={config.bg_color} onChange={v => setC('bg_color', v)} />
                <ColorField label="Accent" value={config.accent_color} onChange={v => setC('accent_color', v)} />
                <ColorField label="Texte" value={config.text_color} onChange={v => setC('text_color', v)} />
                <Button variant="outline" size="sm" onClick={randomColors} className="gap-1.5"><Wand2 className="h-3.5 w-3.5" /> Couleurs au hasard</Button>
              </div>

              {/* Motif de fond */}
              <div className="space-y-1.5">
                <Label className="text-xs">Motif de fond</Label>
                <div className="flex flex-wrap items-end gap-2">
                  {BG_STYLES.map(s => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setC('bg_style', s.id)}
                      className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${config.bg_style === s.id ? 'border-[#E0674C] bg-[#E0674C]/8 text-[#E0674C]' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}
                    >
                      {s.label}
                    </button>
                  ))}
                  {config.bg_style !== 'solid' && (
                    <ColorField label="2ᵉ couleur" value={config.bg_color2} onChange={v => setC('bg_color2', v)} />
                  )}
                </div>
              </div>

              {/* Arrondis */}
              <div className="grid gap-4 sm:grid-cols-2">
                <RangeField label="Arrondi de la carte" value={config.card_radius} max={60} onChange={v => setC('card_radius', v)} />
                <RangeField label="Arrondi des icônes" value={config.icon_radius} max={28} onChange={v => setC('icon_radius', v)} />
              </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label>{label}</Label>{children}</div>
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        <span className="relative inline-block h-9 w-9 flex-shrink-0 overflow-hidden rounded-full border border-gray-200 shadow-sm">
          <input
            type="color"
            value={value}
            onChange={e => onChange(e.target.value)}
            className="absolute left-1/2 top-1/2 h-[150%] w-[150%] -translate-x-1/2 -translate-y-1/2 cursor-pointer border-0 bg-transparent p-0"
            aria-label={label}
          />
        </span>
        <Input value={value} onChange={e => onChange(e.target.value)} className="h-9 w-24 rounded-xl text-xs" />
      </div>
    </div>
  )
}

function RangeField({ label, value, max, onChange }: { label: string; value: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        <span className="text-xs text-gray-400">{value} px</span>
      </div>
      <input type="range" min={0} max={max} value={value} onChange={e => onChange(Number(e.target.value))} className="w-full accent-[#E0674C]" />
    </div>
  )
}
