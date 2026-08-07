'use client'
/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Camera, Search, Image as ImageIcon, MapPin, ClipboardList, CheckCircle2, Clock, Archive } from 'lucide-react'
import StatCard from '@/components/charts/StatCard'
import { visitStatusLabels } from '@/lib/visites'
import ArchiveVisitButton from './ArchiveVisitButton'

export type VisitItem = {
  id: string; title: string; address: string | null; status: string; createdAt: string
  clientName: string | null; thumb: string | null; photoCount: number
}

const IN_PROGRESS = ['brouillon', 'en_cours', 'analyse']

type Filter = 'all' | 'active' | 'valide' | 'encours' | 'archive'
type Sort = 'recent' | 'ancien' | 'titre'

const badgeCls = (status: string) =>
  status === 'valide' ? 'bg-[#F1F6E9] text-[#3F7A2E]'
  : status === 'archive' ? 'bg-gray-100 text-gray-500'
  : 'bg-[#FBEFD4] text-[#8A5A08]'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'active', label: 'Actives' },
  { key: 'valide', label: 'Validées' },
  { key: 'encours', label: 'En cours' },
  { key: 'archive', label: 'Archivées' },
  { key: 'all', label: 'Toutes' },
]

export default function VisitesGallery({ visits }: { visits: VisitItem[] }) {
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('active')
  const [sort, setSort] = useState<Sort>('recent')

  const stats = useMemo(() => ({
    total: visits.length,
    valide: visits.filter(v => v.status === 'valide').length,
    encours: visits.filter(v => IN_PROGRESS.includes(v.status)).length,
    photos: visits.reduce((s, v) => s + v.photoCount, 0),
  }), [visits])

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    let out = visits.filter(v => {
      if (filter === 'active') return v.status !== 'archive'
      if (filter === 'valide') return v.status === 'valide'
      if (filter === 'encours') return IN_PROGRESS.includes(v.status)
      if (filter === 'archive') return v.status === 'archive'
      return true
    })
    if (s) out = out.filter(v =>
      v.title.toLowerCase().includes(s) ||
      (v.clientName || '').toLowerCase().includes(s) ||
      (v.address || '').toLowerCase().includes(s))
    out = [...out].sort((a, b) =>
      sort === 'titre' ? a.title.localeCompare(b.title)
      : sort === 'ancien' ? a.createdAt.localeCompare(b.createdAt)
      : b.createdAt.localeCompare(a.createdAt))
    return out
  }, [visits, q, filter, sort])

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 animate-fade-up">
        <StatCard label="Visites" value={String(stats.total)} icon={ClipboardList} tone="coral" note="au total" />
        <StatCard label="Validées" value={String(stats.valide)} icon={CheckCircle2} tone="green" note="prêtes à rattacher" />
        <StatCard label="En cours" value={String(stats.encours)} icon={Clock} tone="amber" note="à finaliser" />
        <StatCard label="Photos" value={String(stats.photos)} icon={ImageIcon} tone="blue" note="prises sur site" />
      </div>

      {/* Filtres + recherche */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 animate-fade-up">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher (titre, client, adresse)…"
            className="w-full h-10 rounded-lg border border-gray-300 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`text-xs font-medium px-3 h-8 rounded-full border transition-colors ${
                filter === f.key ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200 hover:border-primary/40'}`}>
              {f.label}
            </button>
          ))}
        </div>
        <select value={sort} onChange={e => setSort(e.target.value as Sort)}
          className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary/30 sm:ml-auto">
          <option value="recent">Plus récentes</option>
          <option value="ancien">Plus anciennes</option>
          <option value="titre">Titre A–Z</option>
        </select>
      </div>

      {/* Galerie */}
      {shown.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-14">Aucune visite{q || filter !== 'all' ? ' pour ce filtre' : ''}.</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-up">
          {shown.map(v => (
            <div key={v.id} className="relative group">
              {v.status !== 'archive' && <ArchiveVisitButton visitId={v.id} />}
              <Link href={`/visites/${v.id}`}
                className="block rounded-2xl border border-gray-200/70 bg-white overflow-hidden card-interactive">
                {/* Image */}
                <div className="relative aspect-[4/3] bg-[#FCE7DE]">
                  {v.thumb ? (
                    <img src={v.thumb} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="absolute inset-0 grid place-items-center text-[#C14E33]"><Camera className="w-10 h-10" /></span>
                  )}
                  <span className={`absolute top-2 left-2 text-[11px] font-semibold px-2 py-0.5 rounded-full ${badgeCls(v.status)}`}>
                    {visitStatusLabels[v.status] || v.status}
                  </span>
                  {v.photoCount > 0 && (
                    <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 text-[11px] font-medium text-white bg-black/55 px-2 py-0.5 rounded-full backdrop-blur-sm">
                      <ImageIcon className="w-3 h-3" /> {v.photoCount}
                    </span>
                  )}
                </div>
                {/* Infos */}
                <div className="p-3.5">
                  <p className="text-[15px] font-bold text-marine leading-snug line-clamp-1">{v.title}</p>
                  {v.clientName && <p className="text-xs text-gray-500 truncate mt-0.5">{v.clientName}</p>}
                  <div className="flex items-center justify-between mt-2 text-[11px] text-gray-400">
                    <span>{new Date(v.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    {v.address && <span className="inline-flex items-center gap-1 truncate max-w-[55%]"><MapPin className="w-3 h-3 flex-shrink-0" /> <span className="truncate">{v.address}</span></span>}
                  </div>
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}

      {filter !== 'archive' && filter !== 'all' && stats.total > 0 && visits.some(v => v.status === 'archive') && (
        <button onClick={() => setFilter('archive')} className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-gray-600">
          <Archive className="w-3.5 h-3.5" /> Voir les visites archivées
        </button>
      )}
    </div>
  )
}
