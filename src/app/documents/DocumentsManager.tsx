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
import { FolderOpen, Upload, Download, Trash2, Search, FileText, User, HardHat, Plus, X, Loader2, AlertTriangle } from 'lucide-react'
import type { Document } from '@/types'
import { clientDisplayName } from '@/lib/chantiers'
import {
  documentFamilies, familyRetention, familyRhythm, familyColors, familyTints, recommendedCategories,
  familyNeedsExpiry, expiryState, daysUntil, formatFileSize,
  type DocumentCategory, type DocumentFamily,
} from '@/lib/documents'
import { formatDate } from '@/lib/utils'

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
  const [expiry, setExpiry] = useState('')
  const [clientId, setClientId] = useState(preselectClient || '')
  const [projectId, setProjectId] = useState(preselectProject || '')
  const [notes, setNotes] = useState('')
  const [uploading, setUploading] = useState(false)

  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [clientFilter, setClientFilter] = useState(preselectClient || '')
  const [projectFilter, setProjectFilter] = useState(preselectProject || '')

  // Gestion des catégories (ajout via la colonne de droite du board)
  const [newCat, setNewCat] = useState('')
  const [newFamily, setNewFamily] = useState<DocumentFamily>("L'entreprise")
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

  // Une colonne par catégorie. Les documents sans catégorie (ou dont la catégorie
  // a été supprimée) atterrissent dans « À classer » plutôt que de disparaître.
  const byCategory = useMemo(() => {
    const m = new Map<string, Doc[]>()
    const orphans: Doc[] = []
    for (const d of filtered) {
      if (d.category && familyOf.has(d.category)) {
        const arr = m.get(d.category) || []
        arr.push(d); m.set(d.category, arr)
      } else orphans.push(d)
    }
    return { m, orphans }
  }, [filtered, familyOf])

  // Ce qui expire : le vrai intérêt du classement par rythme
  const expiring = useMemo(() => {
    const rows = documents
      .map(d => ({ doc: d, state: expiryState(d.expiry_date) }))
      .filter(r => r.state === 'expire' || r.state === 'bientot')
    return rows.sort((a, b) => (daysUntil(a.doc.expiry_date) ?? 0) - (daysUntil(b.doc.expiry_date) ?? 0))
  }, [documents])

  // Ordonnées par famille (ordre du rythme, pas alphabétique) : les couleurs
  // se regroupent naturellement au lieu de sortir en désordre.
  const orderedCats = useMemo(() => {
    const rank = (f: string) => {
      const i = (documentFamilies as readonly string[]).indexOf(f)
      return i === -1 ? 99 : i
    }
    return [...categories].sort((a, b) => rank(a.family) - rank(b.family) || a.name.localeCompare(b.name))
  }, [categories])

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
      expiry_date: expiry || null,
    })
    if (dbErr) {
      await supabase.storage.from('documents').remove([path])
      toast.error('Erreur lors de l\'enregistrement')
      setUploading(false)
      return
    }

    toast.success('Document importé !')
    setFile(null); setCategory(''); setNotes(''); setExpiry('')
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
        <Button className="h-10 gap-2 shadow-sm" onClick={() => setShowUpload(v => !v)}>
          <Upload className="w-4 h-4" /> Importer un document
        </Button>
      </div>

      {/* Ce qui expire — remonté en haut, c'est l'urgent */}
      {expiring.length > 0 && (
        <Card className="border border-amber-200 bg-amber-50/50">
          <CardContent className="p-3.5">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <p className="text-sm font-semibold text-amber-800">
                {expiring.length} document{expiring.length > 1 ? 's' : ''} à renouveler
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {expiring.map(({ doc, state }) => {
                const j = daysUntil(doc.expiry_date) ?? 0
                return (
                  <span key={doc.id}
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${state === 'expire' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                    <span className="font-medium">{doc.category || doc.name}</span>
                    {state === 'expire' ? `expiré depuis ${Math.abs(j)} j` : `dans ${j} j`}
                  </span>
                )
              })}
            </div>
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* L'échéance n'a de sens que pour ce qui expire (assurances, contrôles, avis) */}
              {familyNeedsExpiry(familyOf.get(category)) && (
                <div className="space-y-1">
                  <Label htmlFor="expiry">Valable jusqu&apos;au</Label>
                  <Input id="expiry" type="date" value={expiry} onChange={e => setExpiry(e.target.value)} />
                  <p className="text-[11px] text-gray-400">On te préviendra 30 jours avant.</p>
                </div>
              )}
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="notes">Note (optionnel)</Label>
                <Input id="notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ex: bilan 2025 transmis par la comptable" />
              </div>
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

      {/* Board : une colonne par catégorie, teintée par famille, ajout à droite */}
      {categories.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            <FolderOpen className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="font-medium">Aucune catégorie</p>
            <p className="text-sm mt-1 mb-4">Crée tes catégories, ou pars des recommandées pour une entreprise du bâtiment.</p>
            <Button onClick={addRecommended} disabled={busy}>Ajouter les catégories recommandées</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 items-start">
          {/* À classer : n'apparaît que s'il y a des orphelins */}
          {byCategory.orphans.length > 0 && (
            <Column title="À classer" family="Autre" count={byCategory.orphans.length} hint="Range-les en leur donnant une catégorie">
              {byCategory.orphans.map(d => <DocCard key={d.id} doc={d} onDelete={() => handleDelete(d)} />)}
            </Column>
          )}

          {orderedCats.map(c => {
            const docs = byCategory.m.get(c.name) || []
            return (
              <Column key={c.id} title={c.name} family={c.family} count={docs.length}
                hint={docs.length === 0 ? `Vide · à conserver ${familyRetention[c.family]}` : undefined}
                onDelete={() => deleteCategory(c)}>
                {docs.map(d => <DocCard key={d.id} doc={d} onDelete={() => handleDelete(d)} />)}
              </Column>
            )
          })}

          {/* Colonne d'ajout, en dernière case */}
          <div className="rounded-xl border border-dashed border-gray-300 p-3 space-y-2">
            <p className="text-xs font-semibold text-gray-500">Nouvelle catégorie</p>
            <Input value={newCat} onChange={e => setNewCat(e.target.value)} placeholder="Ex : PV de réception"
              className="h-9 text-sm" onKeyDown={e => e.key === 'Enter' && addCategory()} />
            <select value={newFamily} onChange={e => setNewFamily(e.target.value as DocumentFamily)}
              className="w-full h-9 rounded-md border border-gray-200 bg-white px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary">
              {documentFamilies.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <Button size="sm" className="w-full gap-1" onClick={addCategory} disabled={busy}>
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Ajouter
            </Button>
          </div>
        </div>
      )}

      {filtered.length === 0 && documents.length > 0 && (
        <p className="text-sm text-gray-400 -mt-2 text-center">Aucun document ne correspond à votre recherche.</p>
      )}
    </div>
  )
}

/** Colonne du board : une catégorie (ou « À classer »). */
function Column({ title, family, count, hint, onDelete, children }: {
  title: string; family: string; count: number; hint?: string
  onDelete?: () => void; children: React.ReactNode
}) {
  return (
    <div className={`rounded-xl border p-2.5 ${familyTints[family] || 'bg-gray-50 border-gray-200'}`}>
      <div className="flex items-start justify-between gap-1 mb-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-marine truncate" title={title}>{title}</p>
          <Badge className={`${familyColors[family] || 'bg-gray-100 text-gray-600'} border-0 text-[10px] mt-1`}
            title={familyRhythm[family] ? `${family} — ${familyRhythm[family]}` : family}>
            {family}
          </Badge>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="grid place-items-center min-w-5 h-5 px-1 rounded-full bg-white/80 text-[11px] font-semibold text-gray-500">{count}</span>
          {onDelete && (
            <button onClick={onDelete} title="Supprimer cette catégorie"
              className="grid place-items-center w-5 h-5 rounded-full text-gray-400 hover:text-red-500 hover:bg-white">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
      <div className="space-y-1.5">
        {count === 0
          ? <p className="text-[11px] text-gray-400 px-1 py-3 text-center">{hint || 'Vide'}</p>
          : children}
      </div>
    </div>
  )
}

/** Carte compacte : la colonne est étroite, on va à l'essentiel. */
function DocCard({ doc, onDelete }: { doc: Doc; onDelete: () => void }) {
  const c = doc.clients
  const pr = doc.projects
  return (
    <div className="rounded-lg bg-white border border-gray-200/80 p-2 hover:shadow-[var(--shadow-md)] transition-shadow">
      <div className="flex items-start gap-2">
        <FileText className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs font-medium text-gray-900 leading-snug break-words flex-1 min-w-0" title={doc.name}>{doc.name}</p>
      </div>
      {(c || pr) && (
        <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1.5 text-[10px] text-gray-500">
          {c && (
            <Link href={`/clients/${doc.client_id}`} className="flex items-center gap-0.5 hover:text-[#C14E33] truncate">
              <User className="w-2.5 h-2.5" />{clientDisplayName(c)}
            </Link>
          )}
          {pr && (
            <Link href={`/chantiers/${doc.project_id}`} className="flex items-center gap-0.5 hover:text-[#C14E33] truncate">
              <HardHat className="w-2.5 h-2.5" />{pr.title}
            </Link>
          )}
        </div>
      )}
      {doc.expiry_date && (() => {
        const st = expiryState(doc.expiry_date)
        const j = daysUntil(doc.expiry_date) ?? 0
        return (
          <p className={`mt-1.5 text-[10px] font-medium ${st === 'expire' ? 'text-red-600' : st === 'bientot' ? 'text-amber-600' : 'text-gray-400'}`}>
            {st === 'expire' ? `⚠ Expiré depuis ${Math.abs(j)} j` : st === 'bientot' ? `⚠ Expire dans ${j} j` : `Valable jusqu'au ${formatDate(doc.expiry_date)}`}
          </p>
        )
      })()}
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-[10px] text-gray-400">{formatFileSize(doc.file_size)}</span>
        <div className="flex items-center gap-0.5">
          {doc.signedUrl && (
            <a href={doc.signedUrl} target="_blank" rel="noopener noreferrer" title="Télécharger / ouvrir"
              className="grid place-items-center w-6 h-6 rounded text-gray-400 hover:text-[#C14E33] hover:bg-gray-50">
              <Download className="w-3.5 h-3.5" />
            </a>
          )}
          <button onClick={onDelete} title="Supprimer"
            className="grid place-items-center w-6 h-6 rounded text-gray-400 hover:text-red-500 hover:bg-gray-50">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
