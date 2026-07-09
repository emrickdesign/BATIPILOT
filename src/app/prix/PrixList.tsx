'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Pencil, Trash2, Check, X, Tag } from 'lucide-react'
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

  const visibleCats = categories
    .map(c => ({ ...c, price_items: c.price_items.filter(i => i.is_active) }))
    .filter(c => c.price_items.length > 0)

  if (!visibleCats.length) {
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
    <div className="space-y-4">
      {visibleCats.map(cat => (
        <Card key={cat.id}>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-base font-semibold text-gray-800">{cat.name}</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="space-y-1">
              {cat.price_items.map(item => {
                const isEditing = editingId === item.id
                const isBusy = busyId === item.id
                return (
                  <div
                    key={item.id}
                    className={`group flex items-center gap-2 py-2 px-3 rounded-lg transition-colors ${isEditing ? 'bg-[#FBEDE7]' : 'hover:bg-gray-50'} ${isBusy ? 'opacity-50' : ''}`}
                  >
                    {isEditing ? (
                      <>
                        <Input
                          autoFocus
                          value={draft.name}
                          onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') saveEdit(cat.id, item); if (e.key === 'Escape') setEditingId(null) }}
                          className="h-8 text-sm flex-1"
                          placeholder="Nom de la prestation"
                        />
                        <select
                          value={draft.unit}
                          onChange={e => setDraft(d => ({ ...d, unit: e.target.value }))}
                          className="h-8 text-xs border border-gray-200 rounded px-1 bg-white"
                        >
                          {UNITS.map(u => <option key={u} value={u}>{UNIT_LABELS[u]}</option>)}
                        </select>
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            step="0.01"
                            value={draft.price}
                            onChange={e => setDraft(d => ({ ...d, price: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Enter') saveEdit(cat.id, item); if (e.key === 'Escape') setEditingId(null) }}
                            className="h-8 w-24 text-sm text-right"
                            placeholder="0.00"
                          />
                          <span className="text-xs text-gray-400">€ HT</span>
                        </div>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-[#3F7A2E] hover:text-[#3F7A2E] hover:bg-[#E9F2DB]" onClick={() => saveEdit(cat.id, item)}>
                          <Check className="w-4 h-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-gray-400 hover:text-gray-600" onClick={() => setEditingId(null)}>
                          <X className="w-4 h-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <div className="min-w-0 flex-1">
                          <span className="text-sm font-medium text-gray-900">{item.name}</span>
                          {item.description && <span className="text-xs text-gray-400 ml-2">{item.description}</span>}
                        </div>
                        <Badge variant="outline" className="text-xs flex-shrink-0">{UNIT_LABELS[item.unit] || item.unit}</Badge>
                        <span className="font-semibold text-sm text-gray-900 w-20 text-right flex-shrink-0">
                          {item.unit_price_ht > 0 ? formatCurrency(item.unit_price_ht) : '—'}
                        </span>
                        <span className="text-xs text-gray-400 flex-shrink-0">HT</span>
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
        </Card>
      ))}
    </div>
  )
}
