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
import CameraCapture from '@/components/CameraCapture'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ArrowLeft, Camera, Loader2, Trash2, Sparkles, FileText, ImagePlus, HardHat, CheckCircle2 } from 'lucide-react'
import { clientDisplayName } from '@/lib/chantiers'

export type VisitPhoto = { id: string; url: string; caption: string | null; storage_path: string }
type ClientOption = { id: string; type: string; first_name: string | null; last_name: string | null; company_name: string | null }
type Visit = {
  id: string; title: string; address: string | null; transcript: string | null; notes: string | null
  status: string; client_id: string | null
}
type ProjectOption = { id: string; title: string }

export default function VisiteTunnel({ visit, photos: initialPhotos, clients }: { visit: Visit; photos: VisitPhoto[]; clients: ClientOption[] }) {
  const router = useRouter()
  const [title, setTitle] = useState(visit.title)
  const [address, setAddress] = useState(visit.address || '')
  const [clientId, setClientId] = useState(visit.client_id || '')
  const [notes, setNotes] = useState(visit.transcript || '')
  const [photos, setPhotos] = useState<VisitPhoto[]>(initialPhotos)
  const [uploading, setUploading] = useState(false)
  const [summarizing, setSummarizing] = useState(false)
  // Validation → rattachement à un chantier
  const [validateOpen, setValidateOpen] = useState(false)
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [projId, setProjId] = useState('')
  const [validating, setValidating] = useState(false)
  const photoRef = useRef<HTMLInputElement>(null)

  async function patch(fields: Record<string, unknown>) {
    const { error } = await createClient().from('site_visits').update(fields).eq('id', visit.id)
    if (error) toast.error('Enregistrement impossible')
  }

  async function addPhotos(files: FileList | File[]) {
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

  // Résumé : reformule la note (plus claire/concise) sans rien ajouter ni retirer.
  async function resume() {
    if (!notes.trim()) { toast.error('Écrivez ou dictez une note d\'abord'); return }
    setSummarizing(true)
    try {
      const res = await fetch('/api/visites/resume', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: notes }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Résumé impossible'); return }
      setNotes(json.summary)
      await patch({ transcript: String(json.summary).trim() || null })
      toast.success('Note clarifiée ✨')
    } catch { toast.error('Résumé impossible') } finally { setSummarizing(false) }
  }

  // Ouvre la validation : charge les chantiers (du client si lié, sinon tous).
  async function openValidate() {
    setValidateOpen(true)
    const supabase = createClient()
    let q = supabase.from('projects').select('id, title').eq('user_id', (await supabase.auth.getUser()).data.user?.id || '').neq('status', 'archive').order('created_at', { ascending: false })
    if (clientId) q = q.eq('client_id', clientId)
    const { data } = await q
    setProjects((data as ProjectOption[]) || [])
    if (data && data.length === 1) setProjId(data[0].id)
  }

  // Valide la visite : rattache les photos à l'album du chantier + la note aux notes du chantier.
  async function validate() {
    if (!projId) { toast.error('Choisissez le chantier'); return }
    setValidating(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setValidating(false); return }

    // Photos → documents du chantier (apparaissent dans l'album)
    if (photos.length) {
      const rows = photos.map(p => ({
        user_id: user.id, project_id: projId, client_id: clientId || null,
        name: p.caption || `Photo visite — ${title}`, category: 'photo',
        storage_path: p.storage_path, file_type: 'image/jpeg',
      }))
      const { error } = await supabase.from('documents').insert(rows)
      if (error) { toast.error('Erreur rattachement des photos'); setValidating(false); return }
    }

    // Note → notes du chantier
    const noteText = notes.trim()
    if (noteText) {
      await supabase.from('notes').insert({
        user_id: user.id, project_id: projId, author_employee_id: null,
        author_name: `Visite — ${title}`, body: noteText,
      })
    }

    await patch({ status: 'valide' })
    setValidating(false)
    setValidateOpen(false)
    toast.success('Visite validée — photos et note ajoutées au chantier ✅')
    router.push(`/chantiers/${projId}`)
  }

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
          {/* Caméra live (webcam MacBook ou mobile) + import fichier/galerie */}
          <input ref={photoRef} type="file" accept="image/*" multiple className="hidden"
            onChange={e => { if (e.target.files?.length) addPhotos(e.target.files); if (photoRef.current) photoRef.current.value = '' }} />
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <CameraCapture onCapture={f => addPhotos([f])} disabled={uploading} />
            <Button variant="outline" size="sm" className="gap-1.5" disabled={uploading} onClick={() => photoRef.current?.click()}>
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />} Importer
            </Button>
          </div>
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
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={resume} disabled={summarizing || !notes.trim()} title="Clarifier la note (sans rien changer au fond)">
              {summarizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Résumé
            </Button>
            <DictationButton value={notes} onChange={setNotes} size="sm" title="Dicter vos observations" />
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <Textarea value={notes} onChange={e => setNotes(e.target.value)} onBlur={() => patch({ transcript: notes.trim() || null })}
            rows={5} placeholder="Parlez ou écrivez : état existant, dimensions, contraintes d'accès, souhaits du client…" />
          <p className="text-xs text-gray-400 mt-1.5">Astuce : appuyez sur le micro et décrivez à voix haute pendant que vous visitez.</p>
        </CardContent>
      </Card>

      {/* Validation → rattache photos + note au chantier */}
      <Button onClick={openValidate} className="w-full h-12 text-base gap-2">
        <CheckCircle2 className="w-5 h-5" /> Valider la visite
      </Button>
      <p className="text-xs text-gray-400 text-center -mt-2">Les photos et la note seront ajoutées au chantier choisi.</p>

      <Dialog open={validateOpen} onOpenChange={setValidateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Valider la visite</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-500 -mt-1">À quel chantier rattacher les {photos.length} photo{photos.length > 1 ? 's' : ''} et la note ?</p>
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500 flex items-center gap-1.5"><HardHat className="w-3.5 h-3.5" /> Chantier</Label>
            <select value={projId} onChange={e => setProjId(e.target.value)}
              className="w-full h-10 rounded-md border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="">— Choisir un chantier —</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
            {projects.length === 0 && (
              <p className="text-xs text-[#C77D0E]">Aucun chantier{linkedClient ? ` pour ${clientDisplayName(linkedClient)}` : ''}. <Link href="/chantiers/nouveau" className="underline">Créez-en un</Link>.</p>
            )}
          </div>
          <Button onClick={validate} disabled={validating || !projId} className="w-full h-11 gap-2 mt-1">
            {validating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Valider et rattacher
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}
