'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { Suspense } from 'react'

const UNITS: Record<string, string> = { m2: 'm²', ml: 'ml', u: 'unité', forfait: 'forfait', h: 'heure', j: 'jour', piece: 'pièce' }
const selectClass = 'w-full h-10 rounded-md border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary'

function NouveauPrixForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([])
  const [categoryId, setCategoryId] = useState(searchParams.get('category') || '')
  const [newCategory, setNewCategory] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [unit, setUnit] = useState('m2')
  const [price, setPrice] = useState('')
  const [vat, setVat] = useState('10')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    createClient().from('price_categories').select('id, name').order('sort_order').then(({ data }) => setCategories(data || []))
  }, [])

  async function handleSave() {
    if (!name.trim()) { toast.error('Indiquez le nom de la prestation'); return }
    if (!categoryId && !newCategory.trim()) { toast.error('Choisissez ou créez une catégorie'); return }
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    let catId = categoryId
    if (!catId && newCategory.trim()) {
      const { data: cat, error: catErr } = await supabase.from('price_categories')
        .insert({ user_id: user.id, name: newCategory.trim(), sort_order: categories.length }).select('id').single()
      if (catErr || !cat) { toast.error('Erreur création catégorie'); setSaving(false); return }
      catId = cat.id
    }

    const { error } = await supabase.from('price_items').insert({
      user_id: user.id,
      category_id: catId,
      name: name.trim(),
      description: description.trim() || null,
      unit,
      unit_price_ht: Number(price.replace(',', '.')) || 0,
      vat_rate: Number(vat.replace(',', '.')) || 0,
      is_active: true,
    })
    setSaving(false)
    if (error) { toast.error('Erreur lors de l\'ajout'); return }
    toast.success('Prestation ajoutée')
    router.push('/prix')
    router.refresh()
  }

  return (
    <div className="space-y-4 max-w-xl">
      <div className="flex items-center gap-3">
        <Link href="/prix"><Button variant="ghost" size="sm" className="gap-1"><ArrowLeft className="w-4 h-4" /> Retour</Button></Link>
        <h1 className="text-2xl font-bold text-gray-900">Nouvelle prestation</h1>
      </div>

      <Card>
        <CardHeader className="pb-3 pt-4 px-4"><CardTitle className="text-base">Prestation</CardTitle></CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <div className="space-y-1">
            <Label>Catégorie</Label>
            <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className={selectClass}>
              <option value="">— Nouvelle catégorie —</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {!categoryId && (
              <Input value={newCategory} onChange={e => setNewCategory(e.target.value)} placeholder="Nom de la nouvelle catégorie (ex: Plomberie)" className="mt-2" />
            )}
          </div>
          <div className="space-y-1">
            <Label>Nom de la prestation *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Peinture mur" />
          </div>
          <div className="space-y-1">
            <Label>Description (optionnel)</Label>
            <Textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="Détails de la prestation" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Unité</Label>
              <select value={unit} onChange={e => setUnit(e.target.value)} className={selectClass}>
                {Object.entries(UNITS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="space-y-1"><Label>Prix HT (€)</Label><Input type="number" step="0.01" value={price} onChange={e => setPrice(e.target.value)} placeholder="28" /></div>
            <div className="space-y-1">
              <Label>TVA %</Label>
              <select value={vat} onChange={e => setVat(e.target.value)} className={selectClass}>
                <option value="5.5">5,5 %</option><option value="10">10 %</option><option value="20">20 %</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="w-full h-12 text-base">{saving ? 'Ajout...' : 'Ajouter la prestation'}</Button>
    </div>
  )
}

export default function NouveauPrixPage() {
  return <Suspense fallback={<div className="p-8 text-center text-gray-400">Chargement...</div>}><NouveauPrixForm /></Suspense>
}
