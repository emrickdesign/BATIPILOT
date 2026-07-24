'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import DictationButton from '@/components/DictationButton'
import { ArrowLeft, Camera, Loader2, Trash2, Sparkles, AlertTriangle, HelpCircle, FileText } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { fmtUnit } from '@/lib/materiaux'
import { clientDisplayName } from '@/lib/chantiers'
import type { VisitResult } from '@/lib/visites'

export type VisitPhoto = { id: string; url: string; caption: string | null; storage_path: string }
type ClientOption = { id: string; type: string; first_name: string | null; last_name: string | null; company_name: string | null }
type Visit = {
  id: string; title: string; address: string | null; transcript: string | null; notes: string | null
  status: string; client_id: string | null; ai_result: VisitResult | null
}

export default function VisiteTunnel({ visit, photos: initialPhotos, clients }: { visit: Visit; photos: VisitPhoto[]; clients: ClientOption[] }) {
  const router = useRouter()
  const [title, setTitle] = useState(visit.title)
  const [address, setAddress] = useState(visit.address || '')
  const [clientId, setClientId] = useState(visit.client_id || '')
  const [notes, setNotes] = useState(visit.transcript || '')
  const [photos, setPhotos] = useState<VisitPhoto[]>(initialPhotos)
  const [uploading, setUploading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState<VisitResult | null>(visit.ai_result)
  const photoRef = useRef<HTMLInputElement>(null)

  async function patch(fields: Record<string, unknown>) {
    const { error } = await createClient().from('site_visits').update(fields).eq('id', visit.id)
    if (error) toast.error('Enregistrement impossible')
  }

  async function addPhotos(files: FileList) {
    setUploading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setUploading(false); return }
    let order = photos.length
    for (const file of Array.from(files)) {
      const safe = (file.name || 'photo.jpg').replace(/[^a-zA-Z0-9.\-_]/g, '_')
      const path = `visites/${user.id}/${Date.now()}-${safe}`
      const { error: upErr } = await supabase.storage.from('documents').upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false })
      if (upErr) { toast.error('Envoi photo impossible'); continue }
      const { data, error } = await supabase.from('site_visit_photos')
        .insert({ visit_id: visit.id, user_id: user.id, storage_path: path, sort_order: order++ })
        .select('id').single()
      if (error || !data) { await supabase.storage.from('documents').remove([path]); continue }
      setPhotos(prev => [...prev, { id: data.id, url: URL.createObjectURL(file), caption: null, storage_path: path }])
    }
    setUploading(false)
  }

  async function removePhoto(p: VisitPhoto) {
    setPhotos(prev => prev.filter(x => x.id !== p.id))
    const supabase = createClient()
    await supabase.storage.from('documents').remove([p.storage_path])
    await supabase.from('site_visit_photos').delete().eq('id', p.id)
  }

  async function saveCaption(p: VisitPhoto, caption: string) {
    setPhotos(prev => prev.map(x => (x.id === p.id ? { ...x, caption } : x)))
    await createClient().from('site_visit_photos').update({ caption: caption || null }).eq('id', p.id)
  }

  async function analyze() {
    if (photos.length === 0 && !notes.trim()) { toast.error('Ajoutez au moins une photo ou une note'); return }
    setAnalyzing(true)
    // On s'assure que les notes en cours sont bien enregistrées avant l'analyse.
    await patch({ transcript: notes.trim() || null })
    try {
      const res = await fetch('/api/visites/analyser', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visitId: visit.id }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Analyse impossible'); return }
      setResult(json.data as VisitResult)
      toast.success('Visite analysée ✨')
      router.refresh()
    } catch { toast.error('Analyse impossible') } finally { setAnalyzing(false) }
  }

  const devisHref = `/devis/nouveau${clientId ? `?client=${clientId}` : ''}`
  const linkedClient = clients.find(c => c.id === clientId)

  return (
    <div className="space-y-5 max-w-2xl animate-fade-up pb-24">
      <div className="flex items-center gap-3">
        <Link href="/visites"><Button variant="ghost" size="sm" className="gap-1"><ArrowLeft className="w-4 h-4" /> Visites</Button></Link>
      </div>

      {/* En-tête éditable */}
      <Card className="border-0 shadow-[var(--shadow-sm)]">
        <CardContent className="p-4 space-y-3">
          <Input value={title} onChange={e => setTitle(e.target.value)} onBlur={() => title.trim() && patch({ title: title.trim() })}
            className="h-11 text-base font-semibold" placeholder="Nom de la visite" />
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Client / prospect</Label>
              <select value={clientId} onChange={e => { setClientId(e.target.value); patch({ client_id: e.target.value || null }) }}
                className="w-full h-10 rounded-md border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="">— Aucun —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{clientDisplayName(c)}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Adresse</Label>
              <Input value={address} onChange={e => setAddress(e.target.value)} onBlur={() => patch({ address: address.trim() || null })}
                className="h-10" placeholder="Adresse du chantier" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Photos */}
      <Card className="border-0 shadow-[var(--shadow-sm)]">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-base flex items-center gap-2"><Camera className="w-4 h-4 text-gray-400" /> Photos {photos.length > 0 && <span className="text-sm font-normal text-gray-500">· {photos.length}</span>}</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <input ref={photoRef} type="file" accept="image/*" capture="environment" multiple className="hidden"
            onChange={e => { if (e.target.files?.length) addPhotos(e.target.files); if (photoRef.current) photoRef.current.value = '' }} />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {photos.map(p => (
              <div key={p.id} className="group relative">
                <div className="relative aspect-square rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {p.url ? <img src={p.url} alt={p.caption || 'Photo de visite'} className="w-full h-full object-cover" /> : null}
                  <button onClick={() => removePhoto(p)} className="absolute top-1.5 right-1.5 grid place-items-center w-7 h-7 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity" title="Supprimer">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <Input defaultValue={p.caption || ''} onBlur={e => e.target.value !== (p.caption || '') && saveCaption(p, e.target.value)}
                  placeholder="Légende…" className="h-8 mt-1.5 text-xs" />
              </div>
            ))}
            <button onClick={() => photoRef.current?.click()} disabled={uploading}
              className="aspect-square rounded-xl border-2 border-dashed border-gray-300 grid place-items-center text-gray-400 hover:border-primary hover:text-primary transition-colors disabled:opacity-60">
              {uploading ? <Loader2 className="w-6 h-6 animate-spin" /> : <div className="text-center"><Camera className="w-7 h-7 mx-auto" /><span className="text-xs font-medium">Ajouter</span></div>}
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Notes + dictée */}
      <Card className="border-0 shadow-[var(--shadow-sm)]">
        <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><FileText className="w-4 h-4 text-gray-400" /> Notes de visite</CardTitle>
          <DictationButton value={notes} onChange={setNotes} size="sm" title="Dicter vos observations" />
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <Textarea value={notes} onChange={e => setNotes(e.target.value)} onBlur={() => patch({ transcript: notes.trim() || null })}
            rows={5} placeholder="Parlez ou écrivez : état existant, dimensions, contraintes d'accès, souhaits du client…" />
          <p className="text-xs text-gray-400 mt-1.5">Astuce : appuyez sur le micro et décrivez à voix haute pendant que vous visitez.</p>
        </CardContent>
      </Card>

      {/* Analyse */}
      <Button onClick={analyze} disabled={analyzing} className="w-full h-12 text-base gap-2">
        {analyzing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
        {analyzing ? 'Analyse en cours…' : result ? 'Relancer l\'analyse' : 'Analyser la visite'}
      </Button>

      {result && (
        <Card className="border-0 shadow-[var(--shadow-sm)] ring-1 ring-primary/10">
          <div className="bg-gradient-to-r from-accent/40 to-transparent px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-marine">Analyse de la visite</h3>
          </div>
          <CardContent className="p-4 space-y-4">
            {result.resume && <p className="text-sm text-gray-700">{result.resume}</p>}

            {result.observations.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Observations</p>
                <ul className="space-y-1">
                  {result.observations.map((o, i) => (
                    <li key={i} className="text-sm text-gray-700"><span className="font-medium text-marine">{o.element}</span>{o.detail ? ` — ${o.detail}` : ''}</li>
                  ))}
                </ul>
              </div>
            )}

            {result.travaux_suggeres.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Postes suggérés (pré-chiffrage)</p>
                <div className="rounded-lg border border-gray-100 overflow-hidden">
                  {result.travaux_suggeres.map((l, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2 text-sm border-b border-gray-50 last:border-0">
                      <div className="min-w-0 flex-1">
                        <p className="text-gray-800 truncate">{l.designation}</p>
                        <p className="text-[11px] text-gray-400">{l.categorie} · {l.quantite} {fmtUnit(l.unite)}{l.source_prix === 'estime' && ' · prix estimé'}</p>
                      </div>
                      <span className="font-semibold text-marine tabular-nums flex-shrink-0">{formatCurrency(l.quantite * l.prix_unitaire_ht)}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between px-3 py-2 bg-gray-50 text-sm font-semibold">
                    <span className="text-gray-500">Estimation totale HT</span>
                    <span className="text-marine tabular-nums">{formatCurrency(result.total_ht)}</span>
                  </div>
                </div>
                <p className="text-[11px] text-gray-400 mt-1.5">Estimation de repérage — à affiner dans le devis.</p>
              </div>
            )}

            {result.points_attention.length > 0 && (
              <div className="rounded-lg bg-amber-50 border border-amber-100 p-3">
                <p className="text-xs font-semibold text-amber-700 mb-1.5 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Points d&apos;attention</p>
                <ul className="space-y-1">
                  {result.points_attention.map((p, i) => <li key={i} className="text-sm text-amber-900">{p}</li>)}
                </ul>
              </div>
            )}

            {result.questions_client.length > 0 && (
              <div className="rounded-lg bg-sky-50 border border-sky-100 p-3">
                <p className="text-xs font-semibold text-sky-700 mb-1.5 flex items-center gap-1.5"><HelpCircle className="w-3.5 h-3.5" /> À demander au client</p>
                <ul className="space-y-1">
                  {result.questions_client.map((q, i) => <li key={i} className="text-sm text-sky-900">{q}</li>)}
                </ul>
              </div>
            )}

            <Link href={devisHref} className="block">
              <Button className="w-full h-11 gap-2"><FileText className="w-4 h-4" /> Créer le devis{linkedClient ? ` pour ${clientDisplayName(linkedClient)}` : ''}</Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
