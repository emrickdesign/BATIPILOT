'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { FolderOpen, Upload, Download, Trash2, Search, FileText, User, HardHat, Plus, X, Settings2, Loader2 } from 'lucide-react'
import type { Document } from '@/types'
import { clientDisplayName } from '@/lib/chantiers'
import {
  documentFamilies, familyRetention, familyColors, recommendedCategories,
  formatFileSize, type DocumentCategory, type DocumentFamily,
} from '@/lib/documents'

type Doc = Document & { signedUrl?: string }
type ClientOption = { id: string; type: string; first_name: string | null; last_name: string | null; company_name: string | null }
type ProjectOption = { id: string; title: string }

const selectClass =
  'w-full h-10 rounded-md border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary'

export default function DocumentsManager({
  documents, clients, projects, categories, preselectClient, preselectProject,
}: {
  documents: Doc[]; clients: ClientOption[]; projects: ProjectOption[]
  categories: DocumentCategory[]
  preselectClient?: string; preselectProject?: string
}) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [showUpload, setShowUpload] = useState(!!(preselectClient || preselectProject))
  const [file, setFile] = useState<File | null>(null)
  const [category, setCategory] = useState('')
  const [clientId, setClientId] = useState(preselectClient || '')
  const [projectId, setProjectId] = useState(preselectProject || '')
  const [notes, setNotes] = useState('')
  const [uploading, setUploading] = useState(false)

  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [clientFilter, setClientFilter] = useState(preselectClient || '')
  const [projectFilter, setProjectFilter] = useState(preselectProject || '')

  // Gestion des catégories
  const [manage, setManage] = useState(false)
  const [newCat, setNewCat] = useState('')
  const [newFamily, setNewFamily] = useState<DocumentFamily>('Mon entreprise')
  const [busy, setBusy] = useState(false)

  const familyOf = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of categories) m.set(c.name, c.family)
    return m
  }, [categories])

  const filtered = useMemo(() => documents.filter(d => {
    if (catFilter && d.category !== catFilter) return false
    if (clientFilter && d.client_id !== clientFilter) return false
    if (projectFilter && d.project_id !== projectFilter) return false
    if (search && !d.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  }), [documents, search, catFilter, clientFilter, projectFilter])

  // Documents rangés par famille (via leur catégorie ; inconnue → Autre)
  const byFamily = useMemo(() => {
    const m = new Map<string, Doc[]>()
    for (const d of filtered) {
      const fam = (d.category && familyOf.get(d.category)) || 'Autre'
      const arr = m.get(fam) || []
      arr.push(d); m.set(fam, arr)
    }
    return m
  }, [filtered, familyOf])

  const catsByFamily = useMemo(() => {
    const m = new Map<string, DocumentCategory[]>()
    for (const c of categories) {
      const arr = m.get(c.family) || []
      arr.push(c); m.set(c.family, arr)
    }
    return m
  }, [categories])

  async function addCategory() {
    const name = newCat.trim()
    if (!name) { toast.error('Donnez un nom à la catégorie'); return }
    if (categories.some(c => c.name.toLowerCase() === name.toLowerCase())) { toast.error('Cette catégorie existe déjà'); return }
    setBusy(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setBusy(false); return }
    const { error } = await supabase.from('document_categories').insert({ user_id: user.id, name, family: newFamily })
    setBusy(false)
    if (error) { toast.error('Erreur'); return }
    toast.success(`Catégorie « ${name} » créée`)
    setNewCat('')
    router.refresh()
  }

  async function deleteCategory(c: DocumentCategory) {
    const used = documents.filter(d => d.category === c.name).length
    const msg = used > 0
      ? `${used} document(s) utilisent « ${c.name} ». Ils resteront mais passeront dans « Autre ». Supprimer la catégorie ?`
      : `Supprimer la catégorie « ${c.name} » ?`
    if (!confirm(msg)) return
    const { error } = await createClient().from('document_categories').delete().eq('id', c.id)
    if (error) { toast.error('Erreur'); return }
    toast.success('Catégorie supprimée')
    router.refresh()
  }

  async function addRecommended() {
    setBusy(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setBusy(false); return }
    const rows = recommendedCategories
      .filter(r => !categories.some(c => c.name.toLowerCase() === r.name.toLowerCase()))
      .map(r => ({ user_id: user.id, name: r.name, family: r.family }))
    if (rows.length === 0) { toast.info('Tout est déjà là'); setBusy(false); return }
    const { error } = await supabase.from('document_categories').insert(rows)
    setBusy(false)
    if (error) { toast.error('Erreur'); return }
    toast.success(`${rows.length} catégorie(s) ajoutée(s)`)
    router.refresh()
  }

  async function handleUpload() {
    if (!file) { toast.error('Choisissez un fichier'); return }
    setUploading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setUploading(false); return }

    const safe = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')
    const path = `docs/${user.id}/${Date.now()}-${safe}`

    const { error: upErr } = await supabase.storage.from('documents').upload(path, file, {
      contentType: file.type || undefined, upsert: false,
    })
    if (upErr) { toast.error('Erreur lors de l\'envoi du fichier'); setUploading(false); return }

    const { error: dbErr } = await supabase.from('documents').insert({
      user_id: user.id,
      name: file.name,
      category: category || null,
      client_id: clientId || null,
      project_id: projectId || null,
      storage_path: path,
      file_type: file.type || null,
      file_size: file.size,
      notes: notes || null,
    })
    if (dbErr) {
      await supabase.storage.from('documents').remove([path])
      toast.error('Erreur lors de l\'enregistrement')
      setUploading(false)
      return
    }

    toast.success('Document importé !')
    setFile(null); setCategory(''); setNotes('')
    if (fileRef.current) fileRef.current.value = ''
    setUploading(false)
    setShowUpload(false)
    router.refresh()
  }

  async function handleDelete(doc: Doc) {
    if (!confirm(`Supprimer « ${doc.name} » ?`)) return
    const supabase = createClient()
    await supabase.storage.from('documents').remove([doc.storage_path])
    const { error } = await supabase.from('documents').delete().eq('id', doc.id)
    if (error) { toast.error('Erreur lors de la suppression'); return }
    toast.success('Document supprimé')
    router.refresh()
  }

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-[26px] font-bold font-heading text-marine">Documents</h1>
          <p className="text-gray-500 mt-1 text-sm">
            Le coffre-fort de l&apos;entreprise : Kbis, assurances, bilans, paie… Tes devis, factures, tickets et plans restent dans leurs sections.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="h-10 gap-2" onClick={() => setManage(v => !v)}>
            <Settings2 className="w-4 h-4" /> Catégories
          </Button>
          <Button className="h-10 gap-2 shadow-sm" onClick={() => setShowUpload(v => !v)}>
            <Upload className="w-4 h-4" /> Importer un document
          </Button>
        </div>
      </div>

      {/* Gestion des catégories */}
      {manage && (
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex items-end gap-2 flex-wrap">
              <div className="space-y-1 flex-1 min-w-[180px]">
                <Label>Nouvelle catégorie</Label>
                <Input value={newCat} onChange={e => setNewCat(e.target.value)} placeholder="Ex : Procès-verbal de réception"
                  onKeyDown={e => e.key === 'Enter' && addCategory()} />
              </div>
              <div className="space-y-1">
                <Label>Famille</Label>
                <select value={newFamily} onChange={e => setNewFamily(e.target.value as DocumentFamily)} className={selectClass}>
                  {documentFamilies.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <Button onClick={addCategory} disabled={busy} className="gap-1">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Créer
              </Button>
            </div>

            {documentFamilies.map(fam => {
              const cats = catsByFamily.get(fam) || []
              if (cats.length === 0) return null
              return (
                <div key={fam}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <Badge className={`${familyColors[fam]} border-0 text-[11px]`}>{fam}</Badge>
                    <span className="text-[11px] text-gray-400">à conserver : {familyRetention[fam]}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {cats.map(c => (
                      <span key={c.id} className="inline-flex items-center gap-1 rounded-full border border-gray-200 pl-2.5 pr-1 py-1 text-xs text-gray-600">
                        {c.name}
                        <button onClick={() => deleteCategory(c)} title="Supprimer cette catégorie"
                          className="grid place-items-center w-4 h-4 rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )
            })}

            {categories.length < recommendedCategories.length && (
              <Button variant="outline" size="sm" onClick={addRecommended} disabled={busy}>
                Ajouter les catégories recommandées
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Panneau d'import */}
      {showUpload && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="space-y-1">
              <Label htmlFor="file">Fichier (PDF, image, Excel, Word)</Label>
              <input
                ref={fileRef}
                id="file"
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv,.doc,.docx,image/*"
                onChange={e => setFile(e.target.files?.[0] || null)}
                className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:bg-[#FBEDE7] file:text-[#B0472F] file:text-sm file:font-medium hover:file:bg-[#FCE7DE]"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="category">Catégorie</Label>
                <select id="category" value={category} onChange={e => setCategory(e.target.value)} className={selectClass}>
                  <option value="">— À classer —</option>
                  {documentFamilies.map(fam => {
                    const cats = catsByFamily.get(fam) || []
                    if (cats.length === 0) return null
                    return (
                      <optgroup key={fam} label={fam}>
                        {cats.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                      </optgroup>
                    )
                  })}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="client">Client</Label>
                <select id="client" value={clientId} onChange={e => setClientId(e.target.value)} className={selectClass}>
                  <option value="">— Aucun —</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{clientDisplayName(c)}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="project">Chantier</Label>
                <select id="project" value={projectId} onChange={e => setProjectId(e.target.value)} className={selectClass}>
                  <option value="">— Aucun —</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="notes">Note (optionnel)</Label>
              <Input id="notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ex: bilan 2025 transmis par la comptable" />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowUpload(false)} disabled={uploading}>Annuler</Button>
              <Button onClick={handleUpload} disabled={uploading || !file}>
                {uploading ? 'Envoi...' : 'Importer'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filtres */}
      {documents.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un document..." className="pl-9" />
          </div>
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className={`${selectClass} sm:w-52`}>
            <option value="">Toutes les catégories</option>
            {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
          <select value={clientFilter} onChange={e => setClientFilter(e.target.value)} className={`${selectClass} sm:w-44`}>
            <option value="">Tous les clients</option>
            {clients.map(c => <option key={c.id} value={c.id}>{clientDisplayName(c)}</option>)}
          </select>
          <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)} className={`${selectClass} sm:w-44`}>
            <option value="">Tous les chantiers</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </div>
      )}

      {/* Rangé par famille — même vides, les familles montrent quoi stocker */}
      {filtered.length === 0 && documents.length > 0 ? (
        <p className="text-sm text-gray-400 py-6 text-center">Aucun document ne correspond à votre recherche.</p>
      ) : (
        <div className="space-y-4">
          {documentFamilies.map(fam => {
            const docs = byFamily.get(fam) || []
            const cats = catsByFamily.get(fam) || []
            if (docs.length === 0 && cats.length === 0) return null
            return (
              <div key={fam}>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <Badge className={`${familyColors[fam]} border-0 text-xs`}>{fam}</Badge>
                  <span className="text-xs text-gray-400">{docs.length} document{docs.length > 1 ? 's' : ''}</span>
                  <span className="text-[11px] text-gray-400">· à conserver {familyRetention[fam]}</span>
                </div>
                {docs.length === 0 ? (
                  <Card className="border border-dashed border-gray-200 bg-transparent">
                    <CardContent className="py-4 px-4 text-xs text-gray-400">
                      Rien ici. À stocker : {cats.map(c => c.name).join(', ')}.
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-2">
                    {docs.map(doc => (
                      <DocRow key={doc.id} doc={doc} onDelete={() => handleDelete(doc)} />
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          {categories.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-gray-500">
                <FolderOpen className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="font-medium">Aucune catégorie</p>
                <p className="text-sm mt-1 mb-4">Crée tes catégories, ou pars des recommandées pour une entreprise du bâtiment.</p>
                <Button onClick={addRecommended} disabled={busy}>Ajouter les catégories recommandées</Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}

function DocRow({ doc, onDelete }: { doc: Doc; onDelete: () => void }) {
  const c = doc.clients
  const pr = doc.projects
  return (
    <Card className="card-interactive border border-gray-200/80">
      <CardContent className="p-3 flex items-center gap-3">
        <span className="grid place-items-center w-10 h-10 rounded-lg bg-gray-50 text-gray-400 flex-shrink-0">
          <FileText className="w-5 h-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-gray-900 truncate">{doc.name}</div>
          <div className="flex items-center flex-wrap gap-2 mt-1 text-xs text-gray-500">
            {doc.category && <Badge variant="outline" className="text-xs">{doc.category}</Badge>}
            {c && (
              <Link href={`/clients/${doc.client_id}`} className="flex items-center gap-1 hover:text-[#C14E33]">
                <User className="w-3 h-3" />{clientDisplayName(c)}
              </Link>
            )}
            {pr && (
              <Link href={`/chantiers/${doc.project_id}`} className="flex items-center gap-1 hover:text-[#C14E33]">
                <HardHat className="w-3 h-3" />{pr.title}
              </Link>
            )}
            {doc.file_size ? <span>{formatFileSize(doc.file_size)}</span> : null}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {doc.signedUrl && (
            <a href={doc.signedUrl} target="_blank" rel="noopener noreferrer"
              className="grid place-items-center w-8 h-8 rounded-md text-gray-400 hover:text-[#C14E33] hover:bg-gray-50" title="Télécharger / ouvrir">
              <Download className="w-4 h-4" />
            </a>
          )}
          <button onClick={onDelete}
            className="grid place-items-center w-8 h-8 rounded-md text-gray-400 hover:text-red-500 hover:bg-gray-50" title="Supprimer">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </CardContent>
    </Card>
  )
}
