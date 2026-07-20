'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  Ruler, TrendingUp, AlertTriangle, FileSignature, Plus, Trash2, Save, Loader2, Users, Wand2, RotateCcw,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import {
  UNIT_LABELS, moCost, moTotal, prixDepuisMarge, recomputeTotaux,
  type Ligne, type Result, type MoLigne,
} from '@/lib/plans'

type EmployeeOption = { id: string; full_name: string; hourly_cost: number | null }

const num = (v: string) => Number(String(v).replace(',', '.')) || 0
const round2 = (n: number) => Math.round(n * 100) / 100

export default function ChiffrageEditor({
  analyseId, initial, employees,
}: { analyseId: string; initial: Result; employees: EmployeeOption[] }) {
  const router = useRouter()
  const [lignes, setLignes] = useState<Ligne[]>(initial.lignes)
  const [mo, setMo] = useState<MoLigne[]>(initial.main_oeuvre?.lignes || [])
  const [margeCible, setMargeCible] = useState(initial.main_oeuvre?.marge_cible_pct || 0)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const coutMo = useMemo(() => mo.reduce((t, l) => t + moCost(l), 0), [mo])
  const totaux = useMemo(() => recomputeTotaux(lignes, coutMo), [lignes, coutMo])

  function touch() { setDirty(true) }

  function setLigne(i: number, patch: Partial<Ligne>) {
    setLignes(prev => prev.map((l, idx) => {
      if (idx !== i) return l
      const next = { ...l, ...patch }
      // Le total suit toujours quantité × prix : jamais de ligne incohérente
      next.total_ht = round2((Number(next.quantite) || 0) * (Number(next.prix_unitaire_ht) || 0))
      return next
    }))
    touch()
  }

  function addLigne() {
    setLignes(prev => [...prev, {
      categorie: '', designation: '', unite: 'u', quantite: 1,
      prix_unitaire_ht: 0, total_ht: 0, source_prix: 'estime', cout_unitaire_estime: 0,
    }])
    touch()
  }

  function delLigne(i: number) { setLignes(prev => prev.filter((_, idx) => idx !== i)); touch() }

  /** Applique la marge cible : prix de vente déduit du coût de revient. */
  function appliquerMarge() {
    const concernees = lignes.filter(l => (Number(l.cout_unitaire_estime) || 0) > 0)
    if (concernees.length === 0) {
      toast.error('Aucune ligne n\'a de coût de revient — renseignez-le d\'abord'); return
    }
    setLignes(prev => prev.map(l => {
      const cout = Number(l.cout_unitaire_estime) || 0
      if (!cout) return l
      const pu = prixDepuisMarge(cout, margeCible)
      return { ...l, prix_unitaire_ht: pu, total_ht: round2(pu * (Number(l.quantite) || 0)) }
    }))
    touch()
    toast.success(`Marge de ${margeCible}% appliquée à ${concernees.length} ligne(s)`)
  }

  function addMo(emp?: EmployeeOption) {
    setMo(prev => [...prev, {
      employee_id: emp?.id ?? null,
      nom: emp?.full_name || 'Intervenant',
      jours: 1,
      heures_par_jour: 7,
      cout_horaire: Number(emp?.hourly_cost) || 0,
    }])
    touch()
  }
  function setMoLigne(i: number, patch: Partial<MoLigne>) {
    setMo(prev => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
    touch()
  }
  function delMo(i: number) { setMo(prev => prev.filter((_, idx) => idx !== i)); touch() }

  async function save() {
    setSaving(true)
    try {
      const body: Result = {
        ...initial,
        lignes,
        totaux,
        main_oeuvre: { lignes: mo, marge_cible_pct: margeCible },
      }
      const res = await fetch(`/api/plans/${analyseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ result: body }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Erreur enregistrement'); return }
      toast.success('Chiffrage enregistré')
      setDirty(false)
      router.refresh()
    } finally { setSaving(false) }
  }

  function creerDevis() {
    sessionStorage.setItem('devis_prefill', JSON.stringify({
      title: initial.comprehension?.slice(0, 80) || 'Devis depuis plan',
      lines: lignes.map(l => ({
        category: l.categorie, designation: l.designation, description: '',
        quantity: l.quantite, unit: l.unite, unit_price_ht: l.prix_unitaire_ht, vat_rate: 10,
      })),
    }))
    router.push('/devis/nouveau?from=plan')
  }

  const margeReelle = totaux.marge_estimee_pct
  const margeNegative = totaux.marge_estimee_eur < 0

  return (
    <div className="space-y-4">
      {initial.comprehension && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="p-4">
            <p className="text-sm text-blue-900"><span className="font-semibold">Compris :</span> {initial.comprehension}</p>
            {initial.hypotheses?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {initial.hypotheses.map((h, i) => <Badge key={i} variant="outline" className="text-xs bg-white">{h}</Badge>)}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {initial.pieces?.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-base flex items-center gap-2"><Ruler className="w-4 h-4" /> Métrés</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="grid sm:grid-cols-2 gap-3">
              {initial.pieces.map((p, i) => (
                <div key={i} className="border border-gray-100 rounded-lg p-3 bg-gray-50">
                  <p className="font-semibold text-gray-800 text-sm mb-2">{p.nom}</p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div><p className="text-base font-bold text-gray-900">{p.surface_sol_m2}</p><p className="text-[10px] text-gray-400 uppercase">m² sol</p></div>
                    <div><p className="text-base font-bold text-gray-900">{p.surface_murs_m2}</p><p className="text-[10px] text-gray-400 uppercase">m² murs</p></div>
                    <div><p className="text-base font-bold text-gray-900">{p.perimetre_ml}</p><p className="text-[10px] text-gray-400 uppercase">ml périm.</p></div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Chiffrage éditable ─── */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4 flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Chiffrage</CardTitle>
          <span className="text-[11px] text-gray-400">Tout est modifiable</span>
        </CardHeader>
        <CardContent className="px-3 pb-4">
          <div className="hidden md:flex items-center gap-2 px-2 pb-1 text-[10px] uppercase text-gray-400">
            <span className="flex-1">Désignation</span>
            <span className="w-16 text-right">Qté</span>
            <span className="w-20">Unité</span>
            <span className="w-24 text-right">Coût u.</span>
            <span className="w-24 text-right">Vente u.</span>
            <span className="w-24 text-right">Total</span>
            <span className="w-7" />
          </div>

          <div className="space-y-1.5">
            {lignes.map((l, i) => {
              const cout = Number(l.cout_unitaire_estime) || 0
              const pu = Number(l.prix_unitaire_ht) || 0
              const margeLigne = pu > 0 && cout > 0 ? Math.round(((pu - cout) / pu) * 100) : null
              return (
                <div key={i} className="flex flex-wrap md:flex-nowrap items-center gap-2 p-2 rounded-lg border border-gray-100 hover:border-gray-200">
                  <div className="flex-1 min-w-[180px]">
                    <Input value={l.designation} onChange={e => setLigne(i, { designation: e.target.value })}
                      placeholder="Désignation" className="h-8 text-sm border-0 px-1 font-medium focus-visible:ring-1" />
                    <div className="flex items-center gap-1.5 px-1">
                      <Input value={l.categorie} onChange={e => setLigne(i, { categorie: e.target.value })}
                        placeholder="Catégorie" className="h-6 text-[11px] text-gray-400 border-0 px-0 focus-visible:ring-1 w-28" />
                      {l.source_prix === 'estime' && <Badge variant="outline" className="text-[9px] text-amber-600 border-amber-300 px-1">estimé</Badge>}
                      {margeLigne !== null && (
                        <span className={`text-[10px] font-medium ${margeLigne < 0 ? 'text-red-600' : 'text-gray-400'}`}>{margeLigne}% marge</span>
                      )}
                    </div>
                  </div>
                  <Input type="number" step="0.01" value={l.quantite} onChange={e => setLigne(i, { quantite: num(e.target.value) })}
                    className="h-8 w-16 text-sm text-right" />
                  <select value={l.unite} onChange={e => setLigne(i, { unite: e.target.value })}
                    className="h-8 w-20 rounded-md border border-gray-200 bg-white px-1 text-xs">
                    {Object.entries(UNIT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <Input type="number" step="0.01" value={l.cout_unitaire_estime ?? 0} onChange={e => setLigne(i, { cout_unitaire_estime: num(e.target.value) })}
                    title="Coût de revient unitaire" className="h-8 w-24 text-sm text-right text-gray-500" />
                  <Input type="number" step="0.01" value={l.prix_unitaire_ht} onChange={e => setLigne(i, { prix_unitaire_ht: num(e.target.value) })}
                    title="Prix de vente unitaire HT" className="h-8 w-24 text-sm text-right font-medium" />
                  <span className="w-24 text-right text-sm font-semibold tabular-nums">{formatCurrency(l.total_ht)}</span>
                  <button onClick={() => delLigne(i)} title="Supprimer"
                    className="grid place-items-center w-7 h-7 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 flex-shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )
            })}
          </div>

          <Button variant="outline" size="sm" onClick={addLigne} className="mt-2 gap-1">
            <Plus className="w-3.5 h-3.5" /> Ajouter une ligne
          </Button>
        </CardContent>
      </Card>

      {/* ─── Main-d'œuvre : à partir des vrais salariés ─── */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-base flex items-center gap-2"><Users className="w-4 h-4" /> Main-d&apos;œuvre</CardTitle></CardHeader>
        <CardContent className="px-4 pb-4 space-y-2">
          {mo.length === 0 && <p className="text-sm text-gray-400">Combien de personnes, combien de jours ? Ajoutez-les pour un coût réel.</p>}

          {mo.map((l, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 p-2 rounded-lg border border-gray-100">
              <Input value={l.nom} onChange={e => setMoLigne(i, { nom: e.target.value })}
                className="h-8 text-sm flex-1 min-w-[120px]" placeholder="Nom" />
              <div className="flex items-center gap-1">
                <Input type="number" step="0.5" value={l.jours} onChange={e => setMoLigne(i, { jours: num(e.target.value) })}
                  className="h-8 w-16 text-sm text-right" />
                <span className="text-xs text-gray-400">j ×</span>
                <Input type="number" step="0.5" value={l.heures_par_jour} onChange={e => setMoLigne(i, { heures_par_jour: num(e.target.value) })}
                  className="h-8 w-16 text-sm text-right" />
                <span className="text-xs text-gray-400">h ×</span>
                <Input type="number" step="0.5" value={l.cout_horaire} onChange={e => setMoLigne(i, { cout_horaire: num(e.target.value) })}
                  className="h-8 w-20 text-sm text-right" />
                <span className="text-xs text-gray-400">€/h</span>
              </div>
              <span className="w-24 text-right text-sm font-semibold tabular-nums">{formatCurrency(moCost(l))}</span>
              <button onClick={() => delMo(i)} className="grid place-items-center w-7 h-7 rounded text-gray-300 hover:text-red-500 hover:bg-red-50">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}

          <div className="flex items-center gap-2 flex-wrap pt-1">
            {employees.filter(e => !mo.some(m => m.employee_id === e.id)).slice(0, 6).map(e => (
              <Button key={e.id} variant="outline" size="sm" className="gap-1 text-xs" onClick={() => addMo(e)}>
                <Plus className="w-3 h-3" /> {e.full_name}
                {e.hourly_cost ? <span className="text-gray-400">{e.hourly_cost}€/h</span> : null}
              </Button>
            ))}
            <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => addMo()}>
              <Plus className="w-3 h-3" /> Intervenant libre
            </Button>
          </div>
          {mo.length > 0 && (
            <div className="flex justify-between pt-2 border-t border-gray-100 text-sm">
              <span className="text-gray-500">Coût main-d&apos;œuvre</span>
              <span className="font-bold tabular-nums">{formatCurrency(coutMo)}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Marge cible ─── */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-base">Marge cible</CardTitle></CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <div className="flex items-center gap-3">
            <input type="range" min={0} max={70} step={1} value={margeCible}
              onChange={e => { setMargeCible(Number(e.target.value)); touch() }}
              className="flex-1 accent-[var(--primary)]" />
            <span className="w-14 text-right font-bold text-marine tabular-nums">{margeCible}%</span>
            <Button size="sm" onClick={appliquerMarge} className="gap-1.5">
              <Wand2 className="w-3.5 h-3.5" /> Appliquer
            </Button>
          </div>
          <p className="text-[11px] text-gray-400">
            Recalcule le prix de vente de chaque ligne ayant un coût de revient : <strong>vente = coût ÷ (1 − marge)</strong>.
            Les lignes sans coût ne bougent pas — modifiez-les à la main.
          </p>
        </CardContent>
      </Card>

      {/* ─── Totaux ─── */}
      <Card className="border-gray-900 border-2">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Total chantier HT</span>
            <span className="text-2xl font-bold text-gray-900 tabular-nums">{formatCurrency(totaux.total_ht)}</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-gray-400 text-xs">Coût matières</p>
              <p className="font-semibold text-gray-700 tabular-nums">{formatCurrency(totaux.cout_matieres_estime)}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-gray-400 text-xs">Coût main-d&apos;œuvre</p>
              <p className="font-semibold text-gray-700 tabular-nums">{formatCurrency(coutMo)}</p>
            </div>
          </div>
          <div className={`flex items-center justify-between rounded-lg p-3 border ${margeNegative ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
            <span className={`font-semibold flex items-center gap-1.5 ${margeNegative ? 'text-red-800' : 'text-green-800'}`}>
              <TrendingUp className="w-4 h-4" /> {margeNegative ? 'Perte' : 'Marge'}
            </span>
            <span className={`text-xl font-bold tabular-nums ${margeNegative ? 'text-red-700' : 'text-green-700'}`}>
              {formatCurrency(totaux.marge_estimee_eur)} <span className="text-sm font-medium">({margeReelle}%)</span>
            </span>
          </div>
          {margeNegative && <p className="text-[11px] text-red-600">⚠︎ Vous vendez en dessous du coût de revient.</p>}
        </CardContent>
      </Card>

      {initial.remarques?.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="p-4">
            <p className="font-medium text-amber-800 text-sm flex items-center gap-1.5 mb-2"><AlertTriangle className="w-4 h-4" /> À vérifier sur place</p>
            <ul className="text-sm text-amber-700 space-y-1 list-disc ml-5">
              {initial.remarques.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2 flex-wrap sticky bottom-3">
        <Button onClick={save} disabled={saving || !dirty} variant={dirty ? 'default' : 'outline'} className="gap-2 shadow-sm">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {dirty ? 'Enregistrer les modifications' : 'Enregistré'}
        </Button>
        {dirty && (
          <Button variant="ghost" onClick={() => { setLignes(initial.lignes); setMo(initial.main_oeuvre?.lignes || []); setMargeCible(initial.main_oeuvre?.marge_cible_pct || 0); setDirty(false) }} className="gap-1.5">
            <RotateCcw className="w-4 h-4" /> Annuler
          </Button>
        )}
        <Button onClick={creerDevis} className="flex-1 min-w-[200px] gap-2 shadow-sm">
          <FileSignature className="w-4 h-4" /> Créer un devis ({lignes.length} lignes)
        </Button>
      </div>
    </div>
  )
}
