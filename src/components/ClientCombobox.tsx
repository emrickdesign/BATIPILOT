'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X, ChevronDown } from 'lucide-react'

export type ComboOption = { id: string; label: string; sub?: string | null }

/** Sélecteur avec recherche : on tape les premières lettres → propositions filtrées.
 *  Bouton "Voir toute la liste" si aucun résultat. */
export default function ClientCombobox({
  options, value, onChange, placeholder = 'Rechercher…', allowNone = true,
}: { options: ComboOption[]; value: string; onChange: (id: string) => void; placeholder?: string; allowNone?: boolean }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  const selected = options.find(o => o.id === value) || null

  // Affiche le nom sélectionné dans le champ quand il n'y a pas de recherche en cours.
  useEffect(() => {
    if (selected && query === '') setQuery(selected.label)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, options.length])

  // Ferme au clic extérieur
  useEffect(() => {
    function onDoc(e: MouseEvent) { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const q = query.trim().toLowerCase()
  const isSelectedQuery = selected && query === selected.label
  const matches = useMemo(() => {
    if (showAll || !q || isSelectedQuery) return options
    return options.filter(o => o.label.toLowerCase().includes(q))
  }, [options, q, showAll, isSelectedQuery])

  function pick(o: ComboOption) {
    onChange(o.id)
    setQuery(o.label)
    setOpen(false)
    setShowAll(false)
  }
  function clear() {
    onChange('')
    setQuery('')
    setShowAll(false)
    setOpen(true)
  }

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setShowAll(false); setOpen(true); if (selected) onChange('') }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="w-full h-11 rounded-md border border-gray-200 bg-white pl-9 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        {query ? (
          <button type="button" onClick={clear} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        ) : (
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        )}
      </div>

      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg py-1">
          {allowNone && (
            <button type="button" onClick={() => pick({ id: '', label: '' })}
              className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:bg-gray-50">— Aucun —</button>
          )}
          {matches.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-400">
              Aucun résultat.
              {!showAll && <button type="button" onClick={() => setShowAll(true)} className="ml-1 text-primary font-medium hover:underline">Voir toute la liste</button>}
            </div>
          ) : matches.map(o => (
            <button key={o.id} type="button" onClick={() => pick(o)}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${o.id === value ? 'bg-accent text-primary font-medium' : 'text-gray-800'}`}>
              {o.label}{o.sub ? <span className="text-gray-400 text-xs ml-1.5">{o.sub}</span> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
