'use client'

import { useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Pencil, Trash2, Check, X, Tag, ChevronDown, Search, Layers, Percent, Loader2 } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'

const UNIT_LABELS: Record<string, string> = {
  m2: 'm²', ml: 'ml', u: 'unité', forfait: 'forfait', h: 'heure', j: 'jour', piece: 'pièce',
}
const UNITS = ['m2', 'ml', 'u', 'forfait', 'h', 'j', 'piece']

type Item = {
  id: string; name: string; description: string | null; unit: string
  unit_price_ht: number; supplier_cost: number | null; is_active: boolean; updated_at?: string | null
}
export type PrixCategory = { id: string; name: string; price_items: Item[] }
type Category = PrixCategory

/** Un an sans révision : le prix mérite un coup d'œil. */
const STALE_DAYS = 365
function monthsSince(d?: string | null): number | null {
  if (!d) return null
  const t = new Date(d).getTime()
  if (isNaN(t)) return null
  return Math.floor((Date.now() - t) / (30 * 86_400_000))
}

export default function PrixList({ initialCategories }: { initialCategories: Category[] }) {
  const [categories, setCategories] = useState<Category[]>(initialCategories)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<{ name: string; unit: string; price: string; cost: string }>({ name: '', unit: 'u', price: '', cost: '' })
  const [busyId, setBusyId] = useState<string | null>(null)

  // Gestion des catégories + révision en masse
  const [renamingCat, setRenamingCat] = useState<string | null>(null)
  const [catDraft, setCatDraft] = useState('')
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [adjustPct, setAdjustPct] = useState('5')
  const [adjustCat, setAdjustCat] = useState('')
  const [adjustCost, setAdjustCost] = useState(true)
  const [adjusting, setAdjusting] = useState(false)

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
    setDraft({
      name: item.name, unit: item.unit,
      price: String(item.unit_price_ht ?? ''),
      cost: item.supplier_cost != null ? String(item.supplier_cost) : '',
    })
  }

  async function saveEdit(catId: string, item: Item) {
    const name = draft.name.trim()
    if (!name) { toast.error('Le nom ne peut pas être vide'); return }
    setBusyId(item.id)
    const price = parseFloat(draft.price) || 0
    const cost = draft.cost.trim() === '' ? null : parseFloat(draft.cost) || 0
    try {
      const res = await fetch('/api/prix/item', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, name, unit: draft.unit, unit_price_ht: price, supplier_cost: cost }),
      })
      if (!res.ok) throw new Error()
      setCategories(prev => prev.map(c => c.id !== catId ? c : {
        ...c,
        price_items: c.price_items.map(i => i.id !== item.id ? i
          : { ...i, name, unit: draft.unit, unit_price_ht: price, supplier_cost: cost, updated_at: new Date().toISOString() }),
      }))
      setEditingId(null)
      toast.success('Prestation modifiée')
    } catch {
      toast.error('Erreur lors de la modification')
    } finally {
      setBusyId(null)
    }
  }

  async function renameCat(cat: Category) {
    const name = catDraft.trim()
    if (!name || name === cat.name) { setRenamingCat(null); return }
    const res = await fetch('/api/prix/categorie', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: cat.id, name }),
    })
    if (!res.ok) { toast.error('Renommage impossible'); return }
    setCategories(prev => prev.map(c => c.id === cat.id ? { ...c, name } : c))
    setRenamingCat(null)
    toast.success('Catégorie renommée')
  }

  async function deleteCat(cat: Category) {
    const nb = cat.price_items.filter(i => i.is_active).length
    if (nb > 0) {
      const autres = categories.filter(c => c.id !== cat.id)
      const cible = autres.length
        ? window.prompt(
            `« ${cat.name} » contient ${nb} prestation(s).\n\nTapez le nom d'une catégorie où les déplacer, ou laissez vide pour TOUT supprimer.\n\nCatégories : ${autres.map(c => c.name).join(', ')}`,
            autres[0].name,
          )
        : null
      if (cible === null && autres.length) return  // annulé
      const dest = cible?.trim() ? autres.find(c => c.name.toLowerCase() === cible.trim().toLowerCase()) : null
      if (cible?.trim() && !dest) { toast.error('Catégorie inconnue'); return }
      if (!dest && !window.confirm(`Supprimer définitivement « ${cat.name} » et ses ${nb} prestation(s) ?`)) return

      const res = await fetch('/api/prix/categorie', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: cat.id, move_to: dest?.id, force: !dest }),
      })
      if (!res.ok) { toast.error('Suppression impossible'); return }
      if (dest) {
        setCategories(prev => prev
          .map(c => c.id === dest.id ? { ...c, price_items: [...c.price_items, ...cat.price_items] } : c)
          .filter(c => c.id !== cat.id))
        toast.success(`${nb} prestation(s) déplacée(s) vers « ${dest.name} »`)
      } else {
        setCategories(prev => prev.filter(c => c.id !== cat.id))
        toast.success('Catégorie supprimée')
      }
      return
    }
    if (!window.confirm(`Supprimer la catégorie « ${cat.name} » ?`)) return
    const res = await fetch('/api/prix/categorie', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: cat.id }),
    })
    if (!res.ok) { toast.error('Suppression impossible'); return }
    setCategories(prev => prev.filter(c => c.id !== cat.id))
    toast.success('Catégorie supprimée')
  }

  async function appliquerRevision() {
    const pct = Number(adjustPct.replace(',', '.'))
    if (!pct) { toast.error('Indiquez un pourcentage'); return }
    const cible = adjustCat ? categories.find(c => c.id === adjustCat)?.name : 'toutes vos prestations'
    if (!window.confirm(`Appliquer ${pct > 0 ? '+' : ''}${pct}% sur ${cible} ?`)) return
    setAdjusting(true)
    try {
      const res = await fetch('/api/prix/ajuster', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pct, category_id: adjustCat || null, include_cost: adjustCost }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Révision impossible'); return }
      const f = 1 + pct / 100
      const r2 = (n: number) => Math.round(n * 100) / 100
      setCategories(prev => prev.map(c => (adjustCat && c.id !== adjustCat) ? c : {
        ...c,
        price_items: c.price_items.map(i => Number(i.unit_price_ht) > 0 ? {
          ...i,
          unit_price_ht: r2(i.unit_price_ht * f),
          supplier_cost: adjustCost && Number(i.supplier_cost) > 0 ? r2(Number(i.supplier_cost) * f) : i.supplier_cost,
          updated_at: new Date().toISOString(),
        } : i),
      }))
      setAdjustOpen(false)
      toast.success(`${json.count} prix révisé(s)`)
    } finally { setAdjusting(false) }
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
        <Button variant="outline" onClick={() => setAdjustOpen(v => !v)} className="gap-1.5">
          <Percent className="w-4 h-4" /> Réviser les prix
        </Button>
        <Button variant="outline" onClick={toggleAll} className="gap-1.5">
          <Layers className="w-4 h-4" /> {allOpen ? 'Tout replier' : 'Tout ouvrir'}
        </Button>
      </div>

      {/* Révision en masse : le geste annuel */}
      {adjustOpen && (
        <Card className="border-primary/30 bg-accent/20">
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-semibold text-marine">Réviser mes prix</p>
            <div className="flex items-end gap-2 flex-wrap">
              <div className="space-y-1">
                <label className="text-xs text-gray-500">Variation</label>
                <div className="flex items-center gap-1">
                  <Input type="number" step="0.5" value={adjustPct} onChange={e => setAdjustPct(e.target.value)} className="h-9 w-24 text-right" />
                  <span className="text-sm text-gray-400">%</span>
                </div>
              </div>
              <div className="space-y-1 flex-1 min-w-[180px]">
                <label className="text-xs text-gray-500">Sur</label>
                <select value={adjustCat} onChange={e => setAdjustCat(e.target.value)}
                  className="w-full h-9 rounded-md border border-gray-200 bg-white px-2 text-sm">
                  <option value="">Toutes les catégories</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-1.5 text-xs text-gray-600 h-9">
                <input type="checkbox" checked={adjustCost} onChange={e => setAdjustCost(e.target.checked)} className="w-4 h-4 accent-[var(--primary)]" />
                Ajuster aussi les coûts
              </label>
              <Button onClick={appliquerRevision} disabled={adjusting} className="h-9 gap-1.5">
                {adjusting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Percent className="w-4 h-4" />} Appliquer
              </Button>
              <Button variant="ghost" onClick={() => setAdjustOpen(false)} className="h-9">Annuler</Button>
            </div>
            <p className="text-[11px] text-gray-400">
              Les prestations sans prix ne sont pas touchées. Un pourcentage négatif baisse les prix.
            </p>
          </CardContent>
        </Card>
      )}

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
                className={`group/cat w-full text-left px-4 py-3 flex items-center gap-3 transition-colors disabled:cursor-default ${
                  open ? 'bg-accent/70 hover:bg-accent' : 'hover:bg-gray-50'
                }`}>
                <span className={`grid place-items-center w-9 h-9 rounded-xl flex-shrink-0 ${
                  open ? 'bg-primary text-primary-foreground' : 'bg-accent text-primary'
                }`}>
                  <Tag className="w-4 h-4" />
                </span>
                <div className="min-w-0 flex-1">
                  {renamingCat === cat.id ? (
                    <Input autoFocus value={catDraft} onClick={e => e.stopPropagation()}
                      onChange={e => setCatDraft(e.target.value)}
                      onKeyDown={e => {
                        e.stopPropagation()
                        if (e.key === 'Enter') renameCat(cat)
                        if (e.key === 'Escape') setRenamingCat(null)
                      }}
                      onBlur={() => renameCat(cat)}
                      className="h-7 text-sm font-semibold" />
                  ) : (
                    <p className="font-semibold text-marine truncate">{cat.name}</p>
                  )}
                  <p className={`text-[11px] ${open ? 'text-primary/80' : 'text-gray-400'}`}>
                    {cat.price_items.length} prestation{cat.price_items.length > 1 ? 's' : ''}
                    {prices.length > 0 && ` · ${formatCurrency(min)}${max !== min ? ` – ${formatCurrency(max)}` : ''}`}
                  </p>
                </div>
                {sansPrix > 0 && (
                  <Badge className="bg-amber-100 text-amber-700 border-0 text-[10px] flex-shrink-0">{sansPrix} sans prix</Badge>
                )}
                {/* Gérer la catégorie : au survol, pour ne pas alourdir l'en-tête */}
                <span className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover/cat:opacity-100 transition-opacity">
                  <span role="button" tabIndex={0} title="Renommer"
                    onClick={e => { e.stopPropagation(); setCatDraft(cat.name); setRenamingCat(cat.id) }}
                    onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); setCatDraft(cat.name); setRenamingCat(cat.id) } }}
                    className="grid place-items-center w-7 h-7 rounded text-gray-400 hover:text-[#C14E33] hover:bg-white/70">
                    <Pencil className="w-3.5 h-3.5" />
                  </span>
                  <span role="button" tabIndex={0} title="Supprimer la catégorie"
                    onClick={e => { e.stopPropagation(); deleteCat(cat) }}
                    onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); deleteCat(cat) } }}
                    className="grid place-items-center w-7 h-7 rounded text-gray-400 hover:text-red-500 hover:bg-white/70">
                    <Trash2 className="w-3.5 h-3.5" />
                  </span>
                </span>
                <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${open ? 'rotate-180 text-primary' : 'text-gray-400'}`} />
              </button>

              {open && (
                <CardContent className="px-3 pb-3 pt-0 bg-white border-t border-primary/20">
                  <div className="space-y-0.5 pt-2">
                    {cat.price_items.map((item, idx) => {
                      const isEditing = editingId === item.id
                      const isBusy = busyId === item.id
                      // Rayures pastel : une ligne sur deux, pour suivre une
                      // longue liste sans perdre la ligne des yeux.
                      const zebra = idx % 2 === 1 ? 'bg-accent/25' : 'bg-transparent'
                      const cost = Number(item.supplier_cost) || 0
                      const pv = Number(item.unit_price_ht) || 0
                      const margePct = cost > 0 && pv > 0 ? Math.round(((pv - cost) / pv) * 100) : null
                      const mois = monthsSince(item.updated_at)
                      const vieux = mois !== null && mois >= STALE_DAYS / 30
                      return (
                        <div key={item.id}
                          className={`group flex items-center gap-2 py-2 px-2 rounded-lg transition-colors ${isEditing ? 'bg-accent/70' : `${zebra} hover:bg-accent/50`} ${isBusy ? 'opacity-50' : ''}`}>
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
                              <Input type="number" step="0.01" value={draft.cost} title="Coût de revient (optionnel)"
                                onChange={e => setDraft(d => ({ ...d, cost: e.target.value }))}
                                onKeyDown={e => { if (e.key === 'Enter') saveEdit(cat.id, item); if (e.key === 'Escape') setEditingId(null) }}
                                className="h-8 w-20 text-sm text-right text-gray-500" placeholder="coût" />
                              <Input type="number" step="0.01" value={draft.price} title="Prix de vente HT"
                                onChange={e => setDraft(d => ({ ...d, price: e.target.value }))}
                                onKeyDown={e => { if (e.key === 'Enter') saveEdit(cat.id, item); if (e.key === 'Escape') setEditingId(null) }}
                                className="h-8 w-20 text-sm text-right font-medium" placeholder="vente" />
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
                                <p className="text-xs text-gray-400 truncate flex items-center gap-1.5" title={item.description || undefined}>
                                  {item.description && <span className="truncate">{item.description}</span>}
                                  {/* Marge réelle dès que le coût est connu */}
                                  {margePct !== null && (
                                    <span className={margePct < 20 ? 'text-red-500 font-medium' : 'text-gray-400'}>
                                      {margePct}% marge
                                    </span>
                                  )}
                                  {vieux && <span className="text-amber-600" title="Prix non révisé depuis plus d'un an">· à réviser</span>}
                                </p>
                              </div>
                              <Badge variant="outline" className="text-[10px] flex-shrink-0">{UNIT_LABELS[item.unit] || item.unit}</Badge>
                              {Number(item.supplier_cost) > 0 && (
                                <span className="text-xs text-gray-400 w-16 text-right flex-shrink-0 tabular-nums hidden sm:block" title="Coût de revient">
                                  {formatCurrency(Number(item.supplier_cost))}
                                </span>
                              )}
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
