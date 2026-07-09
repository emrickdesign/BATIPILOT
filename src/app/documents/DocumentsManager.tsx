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
import { FolderOpen, Upload, Download, Trash2, Search, FileText, User, HardHat } from 'lucide-react'
import type { Document } from '@/types'
import { clientDisplayName } from '@/lib/chantiers'
import { documentCategoryOptions, documentCategoryColors, formatFileSize } from '@/lib/documents'

type Doc = Document & { signedUrl?: string }
type ClientOption = { id: string; type: string; first_name: string | null; last_name: string | null; company_name: string | null }
type ProjectOption = { id: string; title: string }

const selectClass =
  'w-full h-10 rounded-md border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary'

export default function DocumentsManager({
  documents, clients, projects, preselectClient, preselectProject,
}: {
  documents: Doc[]; clients: ClientOption[]; projects: ProjectOption[]
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

  const filtered = useMemo(() => documents.filter(d => {
    if (catFilter && d.category !== catFilter) return false
    if (clientFilter && d.client_id !== clientFilter) return false
    if (projectFilter && d.project_id !== projectFilter) return false
    if (search && !d.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  }), [documents, search, catFilter, clientFilter, projectFilter])

  const presentCategories = useMemo(
    () => documentCategoryOptions.filter(c => documents.some(d => d.category === c)),
    [documents],
  )

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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-[26px] font-bold font-heading text-marine">Documents</h1>
          <p className="text-gray-500 mt-1 text-sm">Centralisez devis, factures, tickets, plans et contrats.</p>
        </div>
        <Button className="h-10 gap-2 shadow-sm" onClick={() => setShowUpload(v => !v)}>
          <Upload className="w-4 h-4" /> Importer un document
        </Button>
      </div>

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
                  {documentCategoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
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
              <Input id="notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ex: facture fournisseur mars" />
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
        <div className="space-y-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un document..." className="pl-9" />
            </div>
            <select value={clientFilter} onChange={e => setClientFilter(e.target.value)} className={`${selectClass} sm:w-48`}>
              <option value="">Tous les clients</option>
              {clients.map(c => <option key={c.id} value={c.id}>{clientDisplayName(c)}</option>)}
            </select>
            <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)} className={`${selectClass} sm:w-48`}>
              <option value="">Tous les chantiers</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </div>
          {presentCategories.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <FilterChip active={!catFilter} onClick={() => setCatFilter('')}>Tous ({documents.length})</FilterChip>
              {presentCategories.map(c => (
                <FilterChip key={c} active={catFilter === c} onClick={() => setCatFilter(c)}>
                  {c} ({documents.filter(d => d.category === c).length})
                </FilterChip>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Liste */}
      {documents.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            <FolderOpen className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="font-medium">Aucun document pour l&apos;instant</p>
            <p className="text-sm mt-1">Importez vos devis, factures, tickets, plans, contrats…</p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-400 py-6 text-center">Aucun document ne correspond à votre recherche.</p>
      ) : (
        <div className="grid gap-2">
          {filtered.map(doc => {
            const c = doc.clients
            const pr = doc.projects
            return (
              <Card key={doc.id} className="card-interactive border border-gray-200/80">
                <CardContent className="p-3 flex items-center gap-3">
                  <span className="grid place-items-center w-10 h-10 rounded-lg bg-gray-50 text-gray-400 flex-shrink-0">
                    <FileText className="w-5 h-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-gray-900 truncate">{doc.name}</div>
                    <div className="flex items-center flex-wrap gap-2 mt-1 text-xs text-gray-500">
                      {doc.category && (
                        <Badge className={`${documentCategoryColors[doc.category] || 'bg-gray-100 text-gray-600'} border-0 text-xs`}>
                          {doc.category}
                        </Badge>
                      )}
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
                    <button onClick={() => handleDelete(doc)}
                      className="grid place-items-center w-8 h-8 rounded-md text-gray-400 hover:text-red-500 hover:bg-gray-50" title="Supprimer">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
        active ? 'border-primary bg-[#FBEDE7] text-[#B0472F]' : 'border-gray-200 text-gray-600 hover:border-gray-300'
      }`}>
      {children}
    </button>
  )
}
