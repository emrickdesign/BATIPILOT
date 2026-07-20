'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { ArrowLeft, Sparkles, Loader2, Check, Trash2, Calculator, AlertTriangle } from 'lucide-react'
import DictationButton from '@/components/DictationButton'
import { formatCurrency } from '@/lib/utils'

const UNIT_LABELS: Record<string, string> = {
  m2: 'm²', ml: 'ml', u: 'unité', forfait: 'forfait', h: 'heure', j: 'jour', piece: 'pièce',
}
const UNITS = Object.keys(UNIT_LABELS)

type Item = { name: string; unit: string; price: number; description?: string; enabled: boolean }
type Categorie = { name: string; items: Item[] }

const num = (v: string) => Number(String(v).replace(',', '.')) || 0

export default function GenererPrixPage() {
  const router = useRouter()
  const [description, setDescription] = useState('')
  const [coutHoraire, setCoutHoraire] = useState('')
  const [margeCible, setMargeCible] = useState('30')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [res, setRes] = useState<{ metier: string; avertissement: string; categories: Categorie[] } | null>(null)

  async function generer() {
    if (!description.trim()) { toast.error('Décrivez votre activité (au clavier ou au micro)'); return }
    setLoading(true)
    try {
      const r = await fetch('/api/prix/generer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description,
          cout_horaire: num(coutHoraire),
          marge_cible: num(margeCible),
        }),
      })
      const json = await r.json()
      if (!r.ok) { toast.error(json.error || 'Erreur'); return }
      if (!json.categories?.length) { toast.error('Aucune prestation générée — précisez votre activité'); return }
      setRes({ metier: json.metier_compris, avertissement: json.avertissement, categories: json.categories })
    } catch {
      toast.error('Erreur réseau')
    } finally { setLoading(false) }
  }

  function setItem(ci: number, ii: number, patch: Partial<Item>) {
    setRes(prev => !prev ? prev : {
      ...prev,
      categories: prev.categories.map((c, x) => x !== ci ? c : {
        ...c, items: c.items.map((it, y) => y !== ii ? it : { ...it, ...patch }),
      }),
    })
  }
  function delItem(ci: number, ii: number) {
    setRes(prev => !prev ? prev : {
      ...prev,
      categories: prev.categories.map((c, x) => x !== ci ? c : { ...c, items: c.items.filter((_, y) => y !== ii) }),
    })
  }

  const retenus = res?.categories.reduce((t, c) => t + c.items.filter(i => i.enabled).length, 0) || 0

  async function enregistrer() {
    if (!res || retenus === 0) { toast.error('Sélectionnez au moins une prestation'); return }
    setSaving(true)
    try {
      const payload = {
        categories: res.categories
          .map(c => ({ name: c.name, items: c.items.filter(i => i.enabled) }))
          .filter(c => c.items.length > 0),
      }
      const r = await fetch('/api/prix/sauvegarder', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const json = await r.json()
      if (!r.ok) { toast.error(json.error || 'Erreur enregistrement'); return }
      toast.success(`${json.count} prestation(s) ajoutée(s) à vos prix`)
      router.push('/prix')
    } finally { setSaving(false) }
  }

  // Aperçu du calcul, pour comprendre d'où sortiraient les prix
  const ch = num(coutHoraire), mc = num(margeCible)
  const exemple = ch > 0 ? Math.round((ch * 2) / (1 - Math.min(mc, 90) / 100)) : 0

  return (
    <div className="space-y-5 animate-fade-up">
      <Link href="/prix">
        <Button variant="ghost" size="sm" className="gap-1 -ml-2"><ArrowLeft className="w-4 h-4" /> Mes prix</Button>
      </Link>
      <div>
        <h1 className="text-2xl md:text-[26px] font-bold font-heading text-marine">Construire ma base de prix</h1>
        <p className="text-gray-500 mt-1 text-sm">
          Dites votre métier, on vous propose une base de départ que vous ajustez. Rien n&apos;est enregistré avant votre validation.
        </p>
      </div>

      {!res ? (
        <div className="grid lg:grid-cols-2 gap-4 items-start">
          <Card className="border border-gray-200/80">
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-[15px] font-heading flex items-center gap-2">
                <span className="grid place-items-center w-6 h-6 rounded-full bg-accent text-primary text-xs font-bold">1</span>
                Votre activité
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <div className="relative">
                <Textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={9}
                  placeholder="Dictez : votre métier, votre région, le type de chantiers que vous faites le plus, ce que vous facturez souvent…&#10;&#10;Ex : « Je suis électricien en Île-de-France, je fais surtout de la rénovation d'appartements, tableaux, prises, luminaires. »"
                  className="pr-14 resize-none"
                />
                <div className="absolute top-2 right-2">
                  <DictationButton value={description} onChange={setDescription} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-gray-200/80">
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-[15px] font-heading flex items-center gap-2">
                <span className="grid place-items-center w-6 h-6 rounded-full bg-accent text-primary text-xs font-bold">2</span>
                Vos chiffres <span className="font-normal text-gray-400 text-xs">(recommandé)</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-5 space-y-4">
              <p className="text-xs text-gray-500">
                Vous ne savez pas à quel prix vendre ? Partez de ce que vous connaissez : ce que vous coûte une heure de
                main-d&apos;œuvre, et la marge que vous voulez. Les prix seront calculés là-dessus au lieu d&apos;être des moyennes.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-gray-500">Coût horaire main-d&apos;œuvre</label>
                  <div className="flex items-center gap-1">
                    <Input type="number" step="0.5" value={coutHoraire} onChange={e => setCoutHoraire(e.target.value)} placeholder="35" className="h-9" />
                    <span className="text-xs text-gray-400">€/h</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-500">Marge visée</label>
                  <div className="flex items-center gap-1">
                    <Input type="number" step="1" value={margeCible} onChange={e => setMargeCible(e.target.value)} className="h-9" />
                    <span className="text-xs text-gray-400">%</span>
                  </div>
                </div>
              </div>
              {exemple > 0 && (
                <div className="rounded-xl bg-gray-50 p-3 text-sm">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 mb-1">
                    <Calculator className="w-3.5 h-3.5" /> Comment le prix est calculé
                  </p>
                  <p className="text-gray-600 text-xs">
                    Une prestation de <strong>2 h</strong> vous coûte {formatCurrency(ch * 2)} de main-d&apos;œuvre.
                    Avec {mc}% de marge, elle se vend <strong className="text-marine">{formatCurrency(exemple)}</strong> HT
                    (hors fourniture).
                  </p>
                </div>
              )}
              <Button onClick={generer} disabled={loading || !description.trim()} className="w-full h-11 gap-2">
                {loading
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Génération en cours…</>
                  : <><Sparkles className="w-4 h-4" /> Générer ma base de prix</>}
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="space-y-4">
          <Card className="border-blue-200 bg-blue-50/50">
            <CardContent className="p-4 space-y-1">
              <p className="text-sm text-blue-900"><span className="font-semibold">Compris :</span> {res.metier}</p>
              {res.avertissement && (
                <p className="text-xs text-amber-700 flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> {res.avertissement}
                </p>
              )}
            </CardContent>
          </Card>

          {res.categories.map((cat, ci) => (
            <Card key={ci} className="border border-gray-200/80">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-base font-heading text-marine">{cat.name}</CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 space-y-1">
                {cat.items.map((it, ii) => (
                  <div key={ii} className={`flex items-center gap-2 p-2 rounded-lg border ${it.enabled ? 'border-gray-100' : 'border-gray-100 opacity-40'}`}>
                    <input type="checkbox" checked={it.enabled} onChange={e => setItem(ci, ii, { enabled: e.target.checked })}
                      className="w-4 h-4 accent-[var(--primary)] flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <Input value={it.name} onChange={e => setItem(ci, ii, { name: e.target.value })}
                        className="h-8 text-sm border-0 px-1 font-medium focus-visible:ring-1" />
                      {it.description && <p className="text-[11px] text-gray-400 px-1 truncate">{it.description}</p>}
                    </div>
                    <select value={it.unit} onChange={e => setItem(ci, ii, { unit: e.target.value })}
                      className="h-8 w-24 rounded-md border border-gray-200 bg-white px-1 text-xs flex-shrink-0">
                      {UNITS.map(u => <option key={u} value={u}>{UNIT_LABELS[u]}</option>)}
                    </select>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Input type="number" step="0.01" value={it.price} onChange={e => setItem(ci, ii, { price: num(e.target.value) })}
                        className="h-8 w-24 text-sm text-right" />
                      <span className="text-xs text-gray-400">€ HT</span>
                    </div>
                    <button onClick={() => delItem(ci, ii)} className="grid place-items-center w-7 h-7 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 flex-shrink-0">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}

          <Card className="border border-gray-200/80 bg-gray-50/60 sticky bottom-3">
            <CardContent className="p-4 flex items-center gap-3 flex-wrap">
              <Badge className="bg-accent text-primary border-0">{retenus} prestation{retenus > 1 ? 's' : ''} retenue{retenus > 1 ? 's' : ''}</Badge>
              <div className="flex-1" />
              <Button variant="outline" onClick={() => setRes(null)} disabled={saving}>Recommencer</Button>
              <Button onClick={enregistrer} disabled={saving || retenus === 0} className="gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Ajouter à mes prix
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
