'use client'

import { useState } from 'react'
import {
  Search, ExternalLink, Hammer, Wrench, Zap, Droplet, Paintbrush,
  LayoutGrid, TreePine, Package, Store,
} from 'lucide-react'

const CATEGORIES: { label: string; query: string; Icon: typeof Store }[] = [
  { label: 'Matériaux', query: 'matériaux de construction', Icon: Package },
  { label: 'Bricolage', query: 'magasin de bricolage', Icon: Hammer },
  { label: 'Outillage', query: 'magasin outillage professionnel', Icon: Wrench },
  { label: 'Plomberie', query: 'fournisseur plomberie sanitaire', Icon: Droplet },
  { label: 'Électricité', query: 'fournisseur matériel électrique', Icon: Zap },
  { label: 'Peinture', query: 'magasin de peinture', Icon: Paintbrush },
  { label: 'Carrelage', query: 'magasin carrelage revêtement', Icon: LayoutGrid },
  { label: 'Bois / Menuiserie', query: 'fournisseur bois quincaillerie', Icon: TreePine },
]

// Enseignes courantes du bâtiment en France — accès rapide « favoris ».
const BRANDS = [
  'Leroy Merlin', 'Castorama', 'Brico Dépôt', 'Point.P', 'La Plateforme du Bâtiment',
  'Gedimat', 'Cedeo', 'Rexel', 'Mr Bricolage', 'Bricomarché',
]

export default function StoresNearby({ address, suggested = [] }: { address: string; suggested?: string[] }) {
  const [q, setQ] = useState('')
  const mapUrl = (term: string) =>
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${term} près de ${address}`)}`

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const term = q.trim()
    if (term) window.open(mapUrl(term), '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="space-y-3">
      {/* Recherche libre : un type de magasin ou une marque */}
      <form onSubmit={submit} className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Un magasin, une marque…"
            className="w-full h-10 pl-9 pr-3 rounded-full border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <button type="submit" className="h-10 px-4 rounded-full bg-primary text-white text-sm font-semibold hover:opacity-90 transition-opacity flex items-center gap-1.5">
          <Search className="w-4 h-4" /> Chercher
        </button>
      </form>

      {/* Types de magasin (ceux adaptés au métier sont mis en avant) */}
      <div>
        <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-1.5">Type de magasin</p>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map(c => {
            const fav = suggested.includes(c.label)
            return (
              <a
                key={c.label}
                href={mapUrl(c.query)}
                target="_blank"
                rel="noopener noreferrer"
                title={`Chercher : ${c.label} près du chantier`}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
                  fav
                    ? 'bg-accent border-primary/30 text-primary'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-primary/30 hover:text-primary'
                }`}
              >
                <c.Icon className="w-3.5 h-3.5" /> {c.label}
              </a>
            )
          })}
        </div>
      </div>

      {/* Enseignes connues */}
      <div>
        <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-1.5">Enseignes</p>
        <div className="flex flex-wrap gap-1.5">
          {BRANDS.map(b => (
            <a
              key={b}
              href={mapUrl(b)}
              target="_blank"
              rel="noopener noreferrer"
              title={`Trouver un ${b} près du chantier`}
              className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium bg-white border border-gray-200 text-gray-600 hover:border-primary/30 hover:text-primary transition-colors"
            >
              {b} <ExternalLink className="w-3 h-3 opacity-50" />
            </a>
          ))}
        </div>
      </div>

      <p className="text-[11px] text-gray-400">Ouvre Google Maps sur les magasins autour de l&apos;adresse du chantier.</p>
    </div>
  )
}
