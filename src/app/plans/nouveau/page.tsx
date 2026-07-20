'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { Upload, Sparkles, Loader2, FileText, Ruler, TrendingUp, AlertTriangle, FileSignature, RotateCcw, ArrowLeft, HelpCircle } from 'lucide-react'
import QuestionsStep, { type Question } from './QuestionsStep'
import DictationButton from '@/components/DictationButton'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils'

const UNIT_LABELS: Record<string, string> = { m2: 'm²', ml: 'ml', u: 'u', forfait: 'forfait', h: 'h', j: 'j', piece: 'pièce' }

type Ligne = {
  categorie: string; designation: string; unite: string; quantite: number
  prix_unitaire_ht: number; total_ht: number; source_prix: 'base' | 'estime'; cout_unitaire_estime?: number
}
type Piece = { nom: string; surface_sol_m2: number; perimetre_ml: number; surface_murs_m2: number }
type Result = {
  comprehension: string
  hypotheses: string[]
  pieces: Piece[]
  lignes: Ligne[]
  totaux: { total_ht: number; cout_matieres_estime: number; cout_main_oeuvre_estime: number; marge_estimee_eur: number; marge_estimee_pct: number }
  remarques: string[]
}

export default function PlansPage() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [demande, setDemande] = useState('')
  const [hauteur, setHauteur] = useState('2.5')
  const [analysing, setAnalysing] = useState(false)
  const [result, setResult] = useState<Result | null>(null)

  // Parcours en 2 temps : l'IA lit le plan et pose ses questions, puis chiffre.
  const [lecture, setLecture] = useState<{ lecture: string; pieces: string[]; questions: Question[] } | null>(null)
  const [reponses, setReponses] = useState<string[]>([])
  const [reading, setReading] = useState(false)

  async function lirePlan() {
    if (!file) { toast.error('Importez d\'abord un plan'); return }
    setReading(true)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('demande', demande)
    try {
      const res = await fetch('/api/plans/questions', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok || !json.questions?.length) {
        // Pas de questions exploitables : on ne bloque pas, on chiffre directement
        toast.info(json.error || 'Passage direct au chiffrage')
        await analyse([])
        return
      }
      setLecture({ lecture: json.lecture, pieces: json.pieces_detectees || [], questions: json.questions })
      setReponses(new Array(json.questions.length).fill(''))
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setReading(false)
    }
  }

  function pickFile(f: File | undefined) {
    if (!f) return
    const name = f.name.toLowerCase()
    if (!['.pdf', '.png', '.jpg', '.jpeg', '.webp'].some(e => name.endsWith(e))) {
      toast.error('Format : PDF, PNG ou JPG'); return
    }
    if (f.size > 15 * 1024 * 1024) { toast.error('Fichier trop lourd (max 15 Mo)'); return }
    setFile(f)
    setResult(null)
    if (f.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = e => setPreview(e.target?.result as string)
      reader.readAsDataURL(f)
    } else {
      setPreview(null)
    }
  }

  async function analyse(reps?: { question: string; reponse: string }[]) {
    if (!file) { toast.error('Importez d\'abord un plan'); return }
    if (!demande.trim()) { toast.error('Décrivez les travaux (au clavier ou au micro)'); return }
    setAnalysing(true)
    setResult(null)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('demande', demande)
    fd.append('hauteur_mur', hauteur)
    const payload = reps ?? (lecture?.questions || []).map((q, i) => ({ question: q.question, reponse: reponses[i] || '' })).filter(r => r.reponse.trim())
    if (payload.length) fd.append('reponses', JSON.stringify(payload))
    try {
      const res = await fetch('/api/plans/analyser', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Erreur analyse'); return }
      // Analyse conservée : on ouvre sa fiche. Si la sauvegarde a échoué, on
      // affiche quand même le résultat plutôt que de le perdre.
      if (json.id) { router.push(`/plans/${json.id}`); return }
      toast.warning('Analyse réussie mais non sauvegardée')
      setResult(json.data)
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setAnalysing(false)
    }
  }

  function creerDevis() {
    if (!result) return
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

  const t = result?.totaux

  return (
    <div className="space-y-4 max-w-3xl">
      <Link href="/plans">
        <Button variant="ghost" size="sm" className="gap-1"><ArrowLeft className="w-4 h-4" /> Toutes les analyses</Button>
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Analyser un plan</h1>
        <p className="text-sm text-gray-500">Importez un plan, décrivez les travaux, et obtenez un métré chiffré avec votre marge.</p>
      </div>

      {/* Étape 2 : l'IA a lu le plan, elle pose ses questions */}
      {lecture ? (
        <QuestionsStep
          lecture={lecture.lecture}
          pieces={lecture.pieces}
          questions={lecture.questions}
          reponses={reponses}
          setReponses={setReponses}
          analysing={analysing}
          onAnalyser={() => analyse()}
          onSkip={() => analyse([])}
        />
      ) : (
      <>
      {/* 1. IMPORT DU PLAN */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-base flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-gray-900 text-white text-xs flex items-center justify-center">1</span> Le plan</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div
            onClick={() => fileRef.current?.click()}
            onDrop={e => { e.preventDefault(); pickFile(e.dataTransfer.files[0]) }}
            onDragOver={e => e.preventDefault()}
            className="border-2 border-dashed border-gray-300 rounded-xl p-5 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all"
          >
            {preview ? (
              <img src={preview} alt="Plan" className="max-h-72 mx-auto rounded-lg shadow object-contain" />
            ) : file ? (
              <div className="space-y-1 py-3">
                <FileText className="w-10 h-10 text-blue-500 mx-auto" />
                <p className="text-sm font-medium text-gray-800">{file.name}</p>
                <p className="text-xs text-gray-400">Cliquez pour changer</p>
              </div>
            ) : (
              <div className="space-y-2 py-3">
                <Upload className="w-9 h-9 text-gray-400 mx-auto" />
                <p className="font-medium text-gray-700">Glissez votre plan ici</p>
                <p className="text-sm text-gray-400">PDF, PNG ou JPG — plan coté de préférence</p>
              </div>
            )}
          </div>
          <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" className="hidden" onChange={e => pickFile(e.target.files?.[0])} />
        </CardContent>
      </Card>

      {/* 2. DEMANDE */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-base flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-gray-900 text-white text-xs flex items-center justify-center">2</span> Vos travaux</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <div className="flex items-start gap-2">
            <Textarea
              value={demande}
              onChange={e => setDemande(e.target.value)}
              rows={6}
              placeholder="Dictez tout ce que vous savez : les pièces concernées, les travaux, les matériaux voulus, l'état de l'existant, les contraintes d'accès… Plus vous en dites, plus le chiffrage sera juste. Vous pouvez faire des pauses, la dictée continue."
              className="flex-1"
            />
            <DictationButton value={demande} onChange={setDemande} />
          </div>
          <div className="flex items-center gap-2 text-sm">
            <label className="text-gray-500">Hauteur sous plafond :</label>
            <input
              type="number" step="0.05" value={hauteur} onChange={e => setHauteur(e.target.value)}
              className="w-20 border border-gray-200 rounded px-2 py-1 text-sm"
            />
            <span className="text-gray-400">m</span>
          </div>
        </CardContent>
      </Card>

      {/* BOUTON ANALYSER */}
      {/* Deux sorties : chiffrer tout de suite, ou faire creuser l'IA d'abord */}
      <div className="flex flex-col sm:flex-row gap-2">
        <Button variant="outline" onClick={lirePlan} disabled={reading || analysing || !file}
          className="flex-1 h-12 text-base gap-2">
          {reading
            ? <><Loader2 className="w-5 h-5 animate-spin" /> Lecture du plan…</>
            : <><HelpCircle className="w-5 h-5" /> Me poser des questions d&apos;abord</>}
        </Button>
        <Button onClick={() => analyse([])} disabled={reading || analysing || !file}
          className="flex-1 h-12 text-base gap-2">
          {analysing
            ? <><Loader2 className="w-5 h-5 animate-spin" /> Chiffrage en cours…</>
            : <><Sparkles className="w-5 h-5" /> Analyser directement</>}
        </Button>
      </div>
      <p className="text-[11px] text-gray-400 text-center -mt-2">
        « Me poser des questions » fait relire votre plan et votre description à l&apos;IA : elle creuse ce qui manque avant de chiffrer.
      </p>
      </>
      )}

      {analysing && (
        <Card><CardContent className="py-6 text-center text-sm text-gray-500 space-y-1">
          <p>📐 Lecture des cotes et calcul des surfaces…</p>
          <p>🧱 Déduction des matériaux et quantités…</p>
          <p>💰 Chiffrage avec votre base de prix et calcul de la marge…</p>
        </CardContent></Card>
      )}

      {/* RÉSULTAT */}
      {result && (
        <div className="space-y-4">
          {/* Compréhension */}
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

          {/* Métrés par pièce */}
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

          {/* Lignes chiffrées */}
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

          {/* Totaux + marge */}
          {t && (
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
                    <p className="text-gray-400 text-xs">Coût main d'œuvre estimé</p>
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
          )}

          {/* Remarques */}
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

          {/* Actions */}
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => { setResult(null); setDemande('') }} className="gap-2">
              <RotateCcw className="w-4 h-4" /> Nouvelle analyse
            </Button>
            <Button onClick={creerDevis} className="flex-1 h-11 gap-2">
              <FileSignature className="w-4 h-4" /> Créer un devis avec ces {result.lignes.length} lignes
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
