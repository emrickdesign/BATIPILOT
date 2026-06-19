'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { ArrowLeft, Upload, Loader2, Check, AlertCircle, Pencil } from 'lucide-react'
import Link from 'next/link'

type ParsedItem = { name: string; unit: string; price: number; description?: string; enabled: boolean }
type ParsedCategory = { name: string; items: ParsedItem[] }

export default function ImporterPrixPage() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<'upload' | 'analyse' | 'valider' | 'saving'>('upload')
  const [categories, setCategories] = useState<ParsedCategory[]>([])
  const [editingCell, setEditingCell] = useState<{ catIdx: number; itemIdx: number; field: string } | null>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
    if (!allowed.includes(file.type)) {
      toast.error('Format non supporté. Utilisez PDF, JPG ou PNG.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Fichier trop lourd (max 10 Mo)')
      return
    }

    setStep('analyse')
    const form = new FormData()
    form.append('file', file)

    try {
      const res = await fetch('/api/prix/import', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Erreur analyse')

      const cats: ParsedCategory[] = data.data.categories.map((c: any) => ({
        name: c.name,
        items: c.items.map((i: any) => ({ ...i, enabled: true })),
      }))
      setCategories(cats)
      setStep('valider')
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors de l\'analyse')
      setStep('upload')
    }
  }

  function updateItem(catIdx: number, itemIdx: number, field: string, value: string | number | boolean) {
    setCategories(prev => {
      const updated = [...prev]
      updated[catIdx] = {
        ...updated[catIdx],
        items: updated[catIdx].items.map((item, i) =>
          i === itemIdx ? { ...item, [field]: value } : item
        ),
      }
      return updated
    })
  }

  async function handleSave() {
    setStep('saving')
    const toSave = categories
      .map(cat => ({
        name: cat.name,
        items: cat.items.filter(i => i.enabled),
      }))
      .filter(cat => cat.items.length > 0)

    const res = await fetch('/api/prix/sauvegarder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categories: toSave }),
    })
    const data = await res.json()
    if (data.success) {
      toast.success(`${data.count} prestations importées !`)
      router.push('/prix')
    } else {
      toast.error('Erreur lors de la sauvegarde')
      setStep('valider')
    }
  }

  const totalEnabled = categories.reduce((sum, c) => sum + c.items.filter(i => i.enabled).length, 0)

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/prix">
          <Button variant="ghost" size="sm" className="gap-1">
            <ArrowLeft className="w-4 h-4" /> Retour
          </Button>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Importer mes prix</h1>
      </div>

      {step === 'upload' && (
        <Card>
          <CardContent className="py-10 text-center space-y-4">
            <Upload className="w-12 h-12 mx-auto text-gray-300" />
            <div>
              <p className="font-medium text-gray-700">Importez votre document de prix</p>
              <p className="text-sm text-gray-500 mt-1">
                Devis existant, bordereau de prix, liste Excel en PDF, Word scanné...
                <br />L&apos;IA va analyser et extraire toutes vos prestations et tarifs.
              </p>
            </div>
            <div className="text-xs text-gray-400">Formats acceptés : PDF, JPG, PNG — Max 10 Mo</div>
            <Button onClick={() => fileRef.current?.click()} size="lg" className="gap-2">
              <Upload className="w-4 h-4" /> Choisir un fichier
            </Button>
            <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={handleFile} />
          </CardContent>
        </Card>
      )}

      {step === 'analyse' && (
        <Card>
          <CardContent className="py-16 text-center space-y-4">
            <Loader2 className="w-12 h-12 mx-auto text-blue-500 animate-spin" />
            <p className="font-medium text-gray-700">Analyse en cours...</p>
            <p className="text-sm text-gray-500">L&apos;IA lit votre document et extrait vos prix. 20 à 40 secondes.</p>
          </CardContent>
        </Card>
      )}

      {step === 'valider' && (
        <>
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-blue-800">Vérifiez les prix avant d&apos;importer</p>
                  <p className="text-sm text-blue-600 mt-1">
                    L&apos;IA a extrait {totalEnabled} prestations. Vous pouvez modifier les noms, unités et prix,
                    ou décocher les lignes que vous ne voulez pas.
                    <br />Cliquez sur une valeur pour la modifier directement.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {categories.map((cat, catIdx) => (
            <Card key={catIdx}>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-base flex items-center justify-between">
                  <span>{cat.name}</span>
                  <span className="text-sm font-normal text-gray-400">
                    {cat.items.filter(i => i.enabled).length}/{cat.items.length} sélectionnées
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="space-y-1">
                  {cat.items.map((item, itemIdx) => (
                    <div
                      key={itemIdx}
                      className={`flex items-center gap-3 py-2 px-3 rounded-lg ${item.enabled ? 'bg-gray-50' : 'opacity-40'}`}
                    >
                      <input
                        type="checkbox"
                        checked={item.enabled}
                        onChange={e => updateItem(catIdx, itemIdx, 'enabled', e.target.checked)}
                        className="w-4 h-4 flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        {editingCell?.catIdx === catIdx && editingCell.itemIdx === itemIdx && editingCell.field === 'name' ? (
                          <Input
                            autoFocus
                            defaultValue={item.name}
                            className="h-7 text-sm"
                            onBlur={e => { updateItem(catIdx, itemIdx, 'name', e.target.value); setEditingCell(null) }}
                            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                          />
                        ) : (
                          <span
                            className="text-sm text-gray-900 cursor-pointer hover:text-blue-600 flex items-center gap-1 group"
                            onClick={() => setEditingCell({ catIdx, itemIdx, field: 'name' })}
                          >
                            {item.name}
                            <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-50" />
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <select
                          value={item.unit}
                          onChange={e => updateItem(catIdx, itemIdx, 'unit', e.target.value)}
                          className="text-xs border border-gray-200 rounded px-1 py-1 bg-white"
                        >
                          {['m2','ml','u','forfait','h','j','piece'].map(u => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                        </select>
                        {editingCell?.catIdx === catIdx && editingCell.itemIdx === itemIdx && editingCell.field === 'price' ? (
                          <Input
                            autoFocus
                            type="number"
                            defaultValue={item.price}
                            className="h-7 w-24 text-sm text-right"
                            onBlur={e => { updateItem(catIdx, itemIdx, 'price', parseFloat(e.target.value) || 0); setEditingCell(null) }}
                            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                          />
                        ) : (
                          <span
                            className="text-sm font-semibold w-20 text-right cursor-pointer hover:text-blue-600 group flex items-center justify-end gap-1"
                            onClick={() => setEditingCell({ catIdx, itemIdx, field: 'price' })}
                          >
                            <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-50" />
                            {item.price > 0 ? `${item.price} €` : '— €'}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => { setStep('upload'); setCategories([]) }} className="flex-1">
              Recommencer
            </Button>
            <Button onClick={handleSave} className="flex-1 h-12 text-base gap-2">
              <Check className="w-4 h-4" />
              Importer {totalEnabled} prestations
            </Button>
          </div>
        </>
      )}

      {step === 'saving' && (
        <Card>
          <CardContent className="py-16 text-center space-y-4">
            <Loader2 className="w-12 h-12 mx-auto text-green-500 animate-spin" />
            <p className="font-medium text-gray-700">Sauvegarde en cours...</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
