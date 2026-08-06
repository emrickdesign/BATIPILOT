'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Search, User, MapPin, X } from 'lucide-react'

export type SearchClient = { id: string; name: string; ville: string; isPro: boolean }

// Recherche rapide d'une fiche client par nom / prénom / ville → ouvre la fiche.
export default function ClientSearch({ clients }: { clients: SearchClient[] }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)

  const results = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return []
    return clients
      .filter(c => c.name.toLowerCase().includes(s) || c.ville.toLowerCase().includes(s))
      .slice(0, 8)
  }, [q, clients])

  useEffect(() => { setActive(0) }, [q])

  // Ferme au clic extérieur.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  function go(id: string) {
    router.push(`/clients/${id}`)
  }

  function onKey(e: React.KeyboardEvent) {
    if (!results.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); go(results[active].id) }
    else if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          placeholder="Rechercher une fiche client (nom, prénom, ville)…"
          className="w-full h-11 rounded-xl border border-gray-200 bg-white pl-10 pr-10 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
        />
        {q && (
          <button type="button" onClick={() => { setQ(''); setOpen(false) }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {open && q.trim() && (
        <div className="absolute z-30 mt-1.5 w-full rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden">
          {!results.length ? (
            <div className="px-4 py-3 text-sm text-gray-400">Aucune fiche pour « {q.trim()} »</div>
          ) : results.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onMouseEnter={() => setActive(i)}
              onClick={() => go(c.id)}
              className={`flex items-center gap-3 w-full text-left px-3 py-2.5 transition-colors ${i === active ? 'bg-primary/[0.06]' : 'hover:bg-gray-50'}`}
            >
              <span className={`grid place-items-center w-8 h-8 rounded-lg flex-shrink-0 ${c.isPro ? 'bg-[#EAF1FC] text-[#1F5FAE]' : 'bg-[#F3EEFB] text-[#6D4AAE]'}`}>
                <User className="w-4 h-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-gray-800 truncate">{c.name}</span>
                {c.ville && (
                  <span className="flex items-center gap-1 text-xs text-gray-400"><MapPin className="w-3 h-3" />{c.ville}</span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
