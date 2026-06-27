'use client'

import { useEffect, useRef, useState } from 'react'
import { Search, Loader2, Building2, MapPin, CircleDot } from 'lucide-react'
import { Input } from '@/components/ui/input'
import type { CompanyResult } from '@/lib/siret'
import { formatSiret } from '@/lib/siret'

// Champ de recherche d'entreprise (annuaire public gratuit).
// Au choix d'un résultat, appelle onSelect pour pré-remplir le formulaire parent.
export default function EntrepriseSearch({ onSelect }: { onSelect: (c: CompanyResult) => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<CompanyResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  // Debounce + abort de la requête précédente.
  useEffect(() => {
    const term = q.trim()
    if (term.length < 3) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/entreprises/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal })
        const json = await res.json()
        setResults(Array.isArray(json.results) ? json.results : [])
        setOpen(true)
      } catch {
        // requête annulée ou erreur réseau : on ignore
      } finally {
        setLoading(false)
      }
    }, 350)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [q])

  // Ferme le menu au clic extérieur.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  function pick(c: CompanyResult) {
    onSelect(c)
    setQ(c.name)
    setOpen(false)
  }

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#FF6A00] animate-spin" />}
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Nom d'entreprise, ville ou SIRET…"
          className="pl-9"
        />
      </div>

      {open && q.trim().length >= 3 && (
        <div className="absolute z-20 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
          {results.length === 0 && !loading && (
            <p className="px-4 py-3 text-sm text-slate-500">Aucune entreprise trouvée.</p>
          )}
          {results.map((c) => (
            <button
              key={c.siret || c.siren}
              type="button"
              onClick={() => pick(c)}
              className="w-full text-left px-4 py-2.5 hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0"
            >
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[#FF6A00] flex-shrink-0" />
                <span className="font-medium text-marine text-sm truncate">{c.name}</span>
                {!c.active && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-rose-600">
                    <CircleDot className="w-3 h-3" /> fermé
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 mt-0.5 text-xs text-slate-500 truncate">
                <MapPin className="w-3 h-3 flex-shrink-0" />
                {[c.postalCode, c.city].filter(Boolean).join(' ')}
                {c.siret && <span className="ml-1.5 text-slate-400">· {formatSiret(c.siret)}</span>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
