'use client'

import { useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Pencil, Trash2, Check, X, Tag, ChevronDown, Search, Layers } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'

const UNIT_LABELS: Record<string, string> = {
  m2: 'm²', ml: 'ml', u: 'unité', forfait: 'forfait', h: 'heure', j: 'jour', piece: 'pièce',
}
const UNITS = ['m2', 'ml', 'u', 'forfait', 'h', 'j', 'piece']

type Item = { id: string; name: string; description: string | null; unit: string; unit_price_ht: number; is_active: boolean }
type Category = { id: string; name: string; price_items: Item[] }

export default function PrixList({ initialCategories }: { initialCategories: Category[] }) {
  const [categories, setCategories] = useState<Category[]>(initialCategories)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<{ name: string; unit: string; price: string }>({ name: '', unit: 'u', price: '' })
  const [busyId, setBusyId] = useState<string | null>(null)

  // Replié par défaut : on arrive sur une vue d'ensemble, pas sur un mur de prix.
  const [openIds, setOpenIds] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [unitFilter, setUnitFilter] = useState<string>('')   // '' = toutes
  const [sansPrixOnly, setSansPrixOnly] = useState(false)

  function toggle(id: string) {
    setOpenIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function startEdit(item: Item) {
    setEditingId(item.id)
    setDraft({ name: item.name, unit: item.unit, price: String(item.unit_price_ht ?? '') })
  }

  async function saveEdit(catId: string, item: Item) {
    const name = draft.name.trim()
    if (!name) { toast.error('Le nom ne peut pas être vide'); return }
    setBusyId(item.id)
    const price = parseFloat(draft.price) || 0
    try {
      const res = await fetch('/api/prix/item', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, name, unit: draft.unit, unit_price_ht: price }),
      })
      if (!res.ok) throw new Error()
      setCategories(prev => prev.map(c => c.id !== catId ? c : {
        ...c,
        price_items: c.price_items.map(i => i.id !== item.id ? i : { ...i, name, unit: draft.unit, unit_price_ht: price }),
      }))
      setEditingId(null)
      toast.success('Prestation modifiée')
    } catch {
      toast.error('Erreur lors de la modification')
    } finally {
      setBusyId(null)
    }
  }

  async function remove(catId: string, item: Item) {
    if (!confirm(`Supprimer « ${item.name} » ?`)) return
    setBusyId(item.id)
    try {
      const res = await fetch('/api/prix/item', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id }),
      })
      if (!res.ok) throw new Error()
      setCategories(prev => prev.map(c => c.id !== catId ? c : {
        ...c,
        price_items: c.price_items.filter(i => i.id !== item.id),
      }))
      toast.success('Prestation supprimée')
    } catch {
      toast.error('Erreur lors de la suppression')
    } finally {
      setBusyId(null)
    }
  }

  // Unités réellement présentes : un filtre ne propose que ce qui existe
  const unitsPresent = useMemo(() => {
    const s = new Set<string>()
    for (const c of categories) for (const i of c.price_items) if (i.is_active) s.add(i.unit)
    return UNITS.filter(u => s.has(u))
  }, [categories])

  const visibleCats = useMemo(() => {
    const q = search.trim().toLowerCase()
    return categories
      .map(c => ({
        ...c,
        price_items: c.price_items
          .filter(i => i.is_active)
          .filter(i => !unitFilter || i.unit === unitFilter)
          .filter(i => !sansPrixOnly || !(Number(i.unit_price_ht) > 0))
          .filter(i => !q || i.name.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)),
      }))
      .filter(c => c.price_items.length > 0)
  }, [categories, search, unitFilter, sansPrixOnly])

  const nbSansPrix = useMemo(
    () => categories.reduce((t, c) => t + c.price_items.filter(i => i.is_active && !(Number(i.unit_price_ht) > 0)).length, 0),
    [categories],
  )

  const totalItems = visibleCats.reduce((t, c) => t + c.price_items.length, 0)
  const allOpen = visibleCats.length > 0 && visibleCats.every(c => openIds.has(c.id))
  // Seule la recherche déplie : on cherche une prestation précise, la voir est
  // le but. Un filtre, lui, sert à balayer — les cartes restent fermées et on
  // ouvre ce qu'on veut.
  const searching = search.trim().length > 0
  const filtering = searching || !!unitFilter || sansPrixOnly

  function toggleAll() {
    setOpenIds(allOpen ? new Set() : new Set(visibleCats.map(c => c.id)))
  }

  if (!categories.some(c => c.price_items.some(i => i.is_active))) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Tag className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="font-medium text-gray-700">Aucune prestation</p>
          <p className="text-sm text-gray-500 mt-1">Importez un document ou ajoutez vos prestations.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher une prestation…" className="pl-9" />
        </div>
        <Button variant="outline" onClick={toggleAll} className="gap-1.5">
          <Layers className="w-4 h-4" /> {allOpen ? 'Tout replier' : 'Tout ouvrir'}
        </Button>
      </div>

      {/* Filtres : par unité (ce qui se vend à l'heure, à la journée, au m²…) */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <Chip active={!unitFilter && !sansPrixOnly} onClick={() => { setUnitFilter(''); setSansPrixOnly(false) }}>
          Tout
        </Chip>
        {unitsPresent.map(u => (
          <Chip key={u} active={unitFilter === u} onClick={() => setUnitFilter(unitFilter === u ? '' : u)}>
            {UNIT_LABELS[u]}
          </Chip>
        ))}
        {nbSansPrix > 0 && (
          <Chip active={sansPrixOnly} onClick={() => setSansPrixOnly(v => !v)} tone="warn">
            À fixer ({nbSansPrix})
          </Chip>
        )}
      </div>

      {filtering && (
        <p className="text-xs text-gray-400">
          {totalItems} prestation{totalItems > 1 ? 's' : ''} dans {visibleCats.length} catégorie{visibleCats.length > 1 ? 's' : ''}
        </p>
      )}

      {/* Colonnes fluides plutôt qu'une grille : en grille, ouvrir une carte
          allongeait toute la ligne et créait de grands trous. Ici chaque carte
          se replace d'elle-même et l'ensemble reste compact. */}
      <div className="columns-1 md:columns-2 xl:columns-3 gap-3 [column-fill:_balance]">
        {visibleCats.map(cat => {
          const open = searching || openIds.has(cat.id)
          const prices = cat.price_items.map(i => Number(i.unit_price_ht) || 0).filter(p => p > 0)
          const min = prices.length ? Math.min(...prices) : 0
          const max = prices.length ? Math.max(...prices) : 0
          const sansPrix = cat.price_items.filter(i => !(Number(i.unit_price_ht) > 0)).length

          return (
            <Card key={cat.id} className="border border-gray-200/80 overflow-hidden mb-3 break-inside-avoid">
              {/* En-tête cliquable : l'essentiel se lit sans ouvrir.
                  Ouvert, il se teinte pour se détacher de la liste blanche. */}
              <button onClick={() => toggle(cat.id)} disabled={searching}
                className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors disabled:cursor-default ${
                  open ? 'bg-accent/70 hover:bg-accent' : 'hover:bg-gray-50'
                }`}>
                <span className={`grid place-items-center w-9 h-9 rounded-xl flex-shrink-0 ${
                  open ? 'bg-primary text-primary-foreground' : 'bg-accent text-primary'
                }`}>
                  <Tag className="w-4 h-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-marine truncate">{cat.name}</p>
                  <p className={`text-[11px] ${open ? 'text-primary/80' : 'text-gray-400'}`}>
                    {cat.price_items.length} prestation{cat.price_items.length > 1 ? 's' : ''}
                    {prices.length > 0 && ` · ${formatCurrency(min)}${max !== min ? ` – ${formatCurrency(max)}` : ''}`}
                  </p>
                </div>
                {sansPrix > 0 && (
                  <Badge className="bg-amber-100 text-amber-700 border-0 text-[10px] flex-shrink-0">{sansPrix} sans prix</Badge>
                )}
                <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${open ? 'rotate-180 text-primary' : 'text-gray-400'}`} />
              </button>

              {open && (
                <CardContent className="px-3 pb-3 pt-0 bg-white border-t border-primary/20">
                  <div className="space-y-0.5 pt-2">
                    {cat.price_items.map(item => {
                      const isEditing = editingId === item.id
                      const isBusy = busyId === item.id
                      return (
                        <div key={item.id}
                          className={`group flex items-center gap-2 py-2 px-2 rounded-lg transition-colors ${isEditing ? 'bg-accent/60' : 'hover:bg-gray-50'} ${isBusy ? 'opacity-50' : ''}`}>
                          {isEditing ? (
                            <>
                              <Input autoFocus value={draft.name}
                                onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                                onKeyDown={e => { if (e.key === 'Enter') saveEdit(cat.id, item); if (e.key === 'Escape') setEditingId(null) }}
                                className="h-8 text-sm flex-1" placeholder="Nom de la prestation" />
                              <select value={draft.unit} onChange={e => setDraft(d => ({ ...d, unit: e.target.value }))}
                                className="h-8 text-xs border border-gray-200 rounded px-1 bg-white">
                                {UNITS.map(u => <option key={u} value={u}>{UNIT_LABELS[u]}</option>)}
                              </select>
                              <Input type="number" step="0.01" value={draft.price}
                                onChange={e => setDraft(d => ({ ...d, price: e.target.value }))}
                                onKeyDown={e => { if (e.key === 'Enter') saveEdit(cat.id, item); if (e.key === 'Escape') setEditingId(null) }}
                                className="h-8 w-20 text-sm text-right" placeholder="0.00" />
                              <Button size="icon" variant="ghost" className="h-8 w-8 text-[#3F7A2E] hover:bg-[#E9F2DB]" onClick={() => saveEdit(cat.id, item)}>
                                <Check className="w-4 h-4" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-8 w-8 text-gray-400" onClick={() => setEditingId(null)}>
                                <X className="w-4 h-4" />
                              </Button>
                            </>
                          ) : (
                            <>
                              {/* Une ligne pour le titre, une pour le sous-titre :
                                  tronqués plutôt que repliés (le titre complet
                                  reste lisible au survol). */}
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-gray-900 truncate" title={item.name}>{item.name}</p>
                                {item.description && (
                                  <p className="text-xs text-gray-400 truncate" title={item.description}>{item.description}</p>
                                )}
                              </div>
                              <Badge variant="outline" className="text-[10px] flex-shrink-0">{UNIT_LABELS[item.unit] || item.unit}</Badge>
                              <span className={`font-semibold text-sm w-20 text-right flex-shrink-0 tabular-nums ${item.unit_price_ht > 0 ? 'text-gray-900' : 'text-amber-600'}`}>
                                {item.unit_price_ht > 0 ? formatCurrency(item.unit_price_ht) : 'à fixer'}
                              </span>
                              <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-gray-400 hover:text-[#C14E33]" onClick={() => startEdit(item)}>
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-gray-400 hover:text-red-600" onClick={() => remove(cat.id, item)}>
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              )}
            </Card>
          )
        })}
      </div>

      {visibleCats.length === 0 && filtering && (
        <p className="text-sm text-gray-400 text-center py-6">
          Aucune prestation ne correspond{search ? ` à « ${search} »` : ' à ce filtre'}.
        </p>
      )}
    </div>
  )
}

function Chip({ active, onClick, children, tone }: {
  active: boolean; onClick: () => void; children: React.ReactNode; tone?: 'warn'
}) {
  const base = 'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors'
  const cls = active
    ? tone === 'warn'
      ? 'border-amber-300 bg-amber-100 text-amber-700'
      : 'border-primary bg-accent text-primary'
    : 'border-gray-200 text-gray-600 hover:border-gray-300'
  return <button type="button" onClick={onClick} className={`${base} ${cls}`}>{children}</button>
}
