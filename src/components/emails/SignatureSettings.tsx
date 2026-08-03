'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { X, Loader2, Upload, Wand2, Download, Image as ImageIcon, Type } from 'lucide-react'
import {
  DEFAULT_SIGNATURE_CONFIG, buildDefaultSignatureText, type SignatureConfig,
} from '@/lib/signature'

// ─── Génération SVG de la carte de signature ────────────────────────────────
const CARD_W = 1100
const CARD_H = 460

function esc(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function buildSignatureSvg(c: SignatureConfig): string {
  const pad = 48
  const hasPhoto = !!c.photo_url
  const photoSize = CARD_H - pad * 2
  const textX = hasPhoto ? pad + photoSize + 48 : pad
  const rows = [
    { label: 'Tél.', value: c.phone },
    { label: 'Email', value: c.email },
    { label: 'Site', value: c.website },
  ].filter(r => r.value)

  const photoBlock = hasPhoto ? `
    <clipPath id="pc"><rect x="${pad}" y="${pad}" width="${photoSize}" height="${photoSize}" rx="24"/></clipPath>
    <image href="${c.photo_url}" x="${pad}" y="${pad}" width="${photoSize}" height="${photoSize}"
           preserveAspectRatio="xMidYMid slice" clip-path="url(#pc)"/>` : ''

  const logoBlock = c.logo_url
    ? `<image href="${c.logo_url}" x="${CARD_W - pad - 200}" y="${pad}" width="200" height="70" preserveAspectRatio="xMidYMid meet"/>`
    : ''

  let rowsSvg = ''
  const rowTop = 236
  rows.forEach((r, i) => {
    const y = rowTop + i * 70
    rowsSvg += `
      <rect x="${textX}" y="${y}" width="48" height="48" rx="12" fill="${esc(c.accent_color)}"/>
      <text x="${textX + 66}" y="${y + 20}" font-family="Arial, Helvetica, sans-serif" font-size="17" font-weight="700" fill="${esc(c.accent_color)}">${esc(r.label)}</text>
      <text x="${textX + 66}" y="${y + 42}" font-family="Arial, Helvetica, sans-serif" font-size="24" fill="${esc(c.text_color)}">${esc(r.value)}</text>`
  })

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
    <rect width="${CARD_W}" height="${CARD_H}" rx="28" fill="${esc(c.bg_color)}"/>
    <rect x="${textX}" y="${pad + 4}" width="6" height="${c.role ? 150 : 96}" rx="3" fill="${esc(c.accent_color)}"/>
    ${photoBlock}
    ${logoBlock}
    <text x="${textX + 24}" y="${pad + 74}" font-family="Arial, Helvetica, sans-serif" font-size="56" font-weight="800" fill="${esc(c.text_color)}">${esc(c.full_name || 'Prénom Nom')}</text>
    ${c.role ? `<text x="${textX + 24}" y="${pad + 122}" font-family="Arial, Helvetica, sans-serif" font-size="30" fill="${esc(c.accent_color)}">${esc(c.role)}</text>` : ''}
    ${rowsSvg}
  </svg>`
}

// Rasterise le SVG en PNG (2×). Photos/logos en data URL → canvas non « taint ».
function svgToPngBlob(svg: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    img.onload = () => {
      const scale = 2
      const canvas = document.createElement('canvas')
      canvas.width = CARD_W * scale
      canvas.height = CARD_H * scale
      const ctx = canvas.getContext('2d')
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error('canvas')); return }
      ctx.scale(scale, scale)
      ctx.drawImage(img, 0, 0, CARD_W, CARD_H)
      URL.revokeObjectURL(url)
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/png')
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('svg load')) }
    img.src = url
  })
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(new Error('read'))
    r.readAsDataURL(file)
  })
}

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
        supabase.from('companies').select('trade_name, phone, email, website, logo_url').eq('user_id', user.id).maybeSingle(),
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
      // Config visuelle : reprend l'enregistré, sinon pré-remplit avec le contexte connu.
      const saved = (sig?.config || null) as Partial<SignatureConfig> | null
      setConfig({
        ...DEFAULT_SIGNATURE_CONFIG,
        full_name: saved?.full_name ?? profile?.full_name ?? '',
        role: saved?.role ?? '',
        phone: saved?.phone ?? company?.phone ?? '',
        email: saved?.email ?? company?.email ?? '',
        website: saved?.website ?? company?.website ?? '',
        photo_url: saved?.photo_url ?? null,
        logo_url: saved?.logo_url ?? company?.logo_url ?? null,
        bg_color: saved?.bg_color ?? DEFAULT_SIGNATURE_CONFIG.bg_color,
        accent_color: saved?.accent_color ?? DEFAULT_SIGNATURE_CONFIG.accent_color,
        text_color: saved?.text_color ?? DEFAULT_SIGNATURE_CONFIG.text_color,
        layout: saved?.layout ?? 'photo_left',
      })
      setReady(true)
    })
  }, [])

  function setC<K extends keyof SignatureConfig>(k: K, v: SignatureConfig[K]) {
    setConfig(prev => ({ ...prev, [k]: v }))
  }

  async function pickImage(ref: React.RefObject<HTMLInputElement | null>, key: 'photo_url' | 'logo_url', file?: File) {
    const f = file || ref.current?.files?.[0]
    if (!f) return
    if (!f.type.startsWith('image/')) { toast.error('Choisissez une image'); return }
    if (f.size > 3 * 1024 * 1024) { toast.error('Image trop lourde (3 Mo max)'); return }
    try { setC(key, await fileToDataUrl(f)) } catch { toast.error('Lecture impossible') }
  }

  function randomColors() {
    // Palette pseudo-aléatoire sans Math.random (indispo) : rotation par l'horloge.
    const idx = new Date().getSeconds() % PALETTES.length
    const [bg, accent, text] = PALETTES[idx]
    setConfig(prev => ({ ...prev, bg_color: bg, accent_color: accent, text_color: text }))
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
      const svg = buildSignatureSvg(config)
      const blob = await svgToPngBlob(svg)
      const supabase = createClient()
      const path = `${userId}/signature.png`
      const up = await supabase.storage.from('signatures').upload(path, blob, {
        contentType: 'image/png', upsert: true, cacheControl: '0',
      })
      if (up.error) throw up.error
      const { data: pub } = supabase.storage.from('signatures').getPublicUrl(path)
      // Cache-buster : l'URL est stable (upsert), on force le rafraîchissement.
      const url = `${pub.publicUrl}?v=${Date.now()}`
      const { error } = await supabase.from('email_signatures').upsert({
        user_id: userId, signature_image_url: url, config, include_visual: true, updated_at: new Date().toISOString(),
      })
      if (error) throw error
      setImageUrl(url)
      setIncludeVisual(true)
      toast.success('Signature visuelle générée et enregistrée')
    } catch (e) {
      console.error(e)
      toast.error('Génération impossible')
    } finally {
      setSaving(false)
    }
  }

  async function importImage(file?: File) {
    const f = file || importRef.current?.files?.[0]
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

  function downloadPng() {
    svgToPngBlob(buildSignatureSvg(config)).then(blob => {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = 'signature.png'
      a.click()
      URL.revokeObjectURL(a.href)
    }).catch(() => toast.error('Export impossible'))
  }

  const previewSvg = buildSignatureSvg(config)

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* En-tête */}
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="font-heading text-lg font-bold text-marine">Ma signature email</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Fermer">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Onglets */}
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
            <div className="space-y-4">
              {/* Aperçu en direct */}
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-gray-50 p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`data:image/svg+xml;utf8,${encodeURIComponent(previewSvg)}`} alt="Aperçu signature" className="w-full rounded-lg" />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Prénom Nom"><Input value={config.full_name} onChange={e => setC('full_name', e.target.value)} placeholder="Jean Dupont" /></Field>
                <Field label="Rôle / fonction"><Input value={config.role} onChange={e => setC('role', e.target.value)} placeholder="Gérant" /></Field>
                <Field label="Téléphone"><Input value={config.phone} onChange={e => setC('phone', e.target.value)} placeholder="07 12 34 56 78" /></Field>
                <Field label="Email"><Input value={config.email} onChange={e => setC('email', e.target.value)} placeholder="contact@entreprise.fr" /></Field>
                <Field label="Site web"><Input value={config.website} onChange={e => setC('website', e.target.value)} placeholder="monentreprise.fr" /></Field>
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

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                <Button onClick={generateAndSave} disabled={saving} className="gap-1.5 bg-[#E0674C] hover:bg-[#c9563d]">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} Générer & enregistrer
                </Button>
                <Button variant="outline" onClick={downloadPng} className="gap-1.5"><Download className="h-4 w-4" /> Télécharger le PNG</Button>
                <input ref={importRef} type="file" accept="image/*" hidden onChange={() => importImage()} />
                <Button variant="outline" onClick={() => importRef.current?.click()} disabled={saving} className="gap-1.5"><Upload className="h-4 w-4" /> Importer une image</Button>
              </div>

              {imageUrl && (
                <div className="space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-3">
                  <p className="text-xs font-medium text-gray-500">Signature enregistrée (utilisée dans les mails)</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imageUrl} alt="Signature enregistrée" className="max-h-24 rounded-lg border border-gray-200" />
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600">
                    <input type="checkbox" checked={includeVisual} onChange={e => toggleInclude(e.target.checked)} className="h-4 w-4 accent-[#E0674C]" />
                    L’inclure par défaut dans mes mails
                  </label>
                </div>
              )}
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
      <div className="flex items-center gap-1.5">
        <input type="color" value={value} onChange={e => onChange(e.target.value)} className="h-9 w-10 cursor-pointer rounded border border-gray-200 bg-white p-0.5" />
        <Input value={value} onChange={e => onChange(e.target.value)} className="h-9 w-24 text-xs" />
      </div>
    </div>
  )
}
