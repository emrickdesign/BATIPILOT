'use client'

import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Ruler, TrendingUp, AlertTriangle, FileSignature } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { UNIT_LABELS, type Result } from '@/lib/plans'

/** Rendu d'une analyse — partagé entre la nouvelle analyse et une analyse rouverte. */
export default function AnalyseResult({ result }: { result: Result }) {
  const router = useRouter()
  const t = result.totaux

  function creerDevis() {
    const lines = result.lignes.map(l => ({
      category: l.categorie,
      designation: l.designation,
      description: '',
      quantity: l.quantite,
      unit: l.unite,
      unit_price_ht: l.prix_unitaire_ht,
      vat_rate: 10,
    }))
    sessionStorage.setItem('devis_prefill', JSON.stringify({
      title: result.comprehension?.slice(0, 80) || 'Devis depuis plan',
      lines,
    }))
    router.push('/devis/nouveau?from=plan')
  }

  return (
    <div className="space-y-4">
      <Card className="border-blue-200 bg-blue-50/50">
        <CardContent className="p-4">
          <p className="text-sm text-blue-900"><span className="font-semibold">Compris :</span> {result.comprehension}</p>
          {result.hypotheses?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {result.hypotheses.map((h, i) => <Badge key={i} variant="outline" className="text-xs bg-white">{h}</Badge>)}
            </div>
          )}
        </CardContent>
      </Card>

      {result.pieces?.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-base flex items-center gap-2"><Ruler className="w-4 h-4" /> Métrés</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="grid sm:grid-cols-2 gap-3">
              {result.pieces.map((p, i) => (
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

      <Card>
        <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-base">Chiffrage détaillé</CardTitle></CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="space-y-1">
            {result.lignes.map((l, i) => (
              <div key={i} className="flex items-center gap-2 py-2 px-2 rounded-lg hover:bg-gray-50 text-sm">
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-gray-900">{l.designation}</span>
                  <span className="text-xs text-gray-400 ml-2">{l.categorie}</span>
                  {l.source_prix === 'estime' && <Badge variant="outline" className="ml-2 text-[10px] text-amber-600 border-amber-300">prix estimé</Badge>}
                </div>
                <span className="text-gray-500 text-xs whitespace-nowrap">{l.quantite} {UNIT_LABELS[l.unite] || l.unite} × {formatCurrency(l.prix_unitaire_ht)}</span>
                <span className="font-semibold text-gray-900 w-24 text-right">{formatCurrency(l.total_ht)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-gray-900 border-2">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Total chantier HT</span>
            <span className="text-2xl font-bold text-gray-900">{formatCurrency(t.total_ht)}</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-gray-400 text-xs">Coût matières estimé</p>
              <p className="font-semibold text-gray-700">{formatCurrency(t.cout_matieres_estime)}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-gray-400 text-xs">Coût main d&apos;œuvre estimé</p>
              <p className="font-semibold text-gray-700">{formatCurrency(t.cout_main_oeuvre_estime)}</p>
            </div>
          </div>
          <div className="flex items-center justify-between bg-green-50 rounded-lg p-3 border border-green-200">
            <span className="font-semibold text-green-800 flex items-center gap-1.5"><TrendingUp className="w-4 h-4" /> Marge estimée</span>
            <span className="text-xl font-bold text-green-700">{formatCurrency(t.marge_estimee_eur)} <span className="text-sm font-medium">({t.marge_estimee_pct}%)</span></span>
          </div>
          <p className="text-[11px] text-gray-400">Estimation indicative à valider — les coûts réels dépendent de vos fournisseurs et du temps passé.</p>
        </CardContent>
      </Card>

      {result.remarques?.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="p-4">
            <p className="font-medium text-amber-800 text-sm flex items-center gap-1.5 mb-2"><AlertTriangle className="w-4 h-4" /> À vérifier sur place</p>
            <ul className="text-sm text-amber-700 space-y-1 list-disc ml-5">
              {result.remarques.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </CardContent>
        </Card>
      )}

      <Button onClick={creerDevis} className="w-full h-11 gap-2">
        <FileSignature className="w-4 h-4" /> Créer un devis avec ces {result.lignes.length} lignes
      </Button>
    </div>
  )
}
