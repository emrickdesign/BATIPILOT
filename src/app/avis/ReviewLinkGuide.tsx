'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Star, Search, ExternalLink, Check, Loader2, Pencil, Sparkles, MapPin, ChevronDown } from 'lucide-react'

const GOOGLE_SEARCH = `https://www.google.com/search?q=${encodeURIComponent('mon entreprise')}`

type Candidate = { placeId: string; name: string; address: string; reviewUrl: string }

export default function ReviewLinkGuide({ initialUrl, collapsible = false }: { initialUrl: string; collapsible?: boolean }) {
  const router = useRouter()
  const [url, setUrl] = useState(initialUrl)
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(!collapsible)
  const [searching, setSearching] = useState(false)
  const [candidates, setCandidates] = useState<Candidate[] | null>(null)
  const [showManual, setShowManual] = useState(false)

  async function save(explicit?: string) {
    const value = (explicit ?? url).trim()
    if (!value) return
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    const { data, error } = await supabase.from('companies')
      .update({ google_review_url: value }).eq('user_id', user.id).select('id')
    setSaving(false)
    if (error) { toast.error('Enregistrement impossible'); return }
    if (!data || data.length === 0) { toast.error('Complétez d’abord votre fiche dans Paramètres → Mon entreprise.'); return }
    setUrl(value)
    toast.success('Lien d’avis enregistré ✅')
    router.refresh()
  }

  // Bouton unique : cherche la fiche Google et enregistre le lien automatiquement.
  async function findAuto() {
    setSearching(true)
    setCandidates(null)
    try {
      const res = await fetch('/api/avis/rechercher', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Recherche impossible'); setShowManual(true); return }
      const list: Candidate[] = json.candidates || []
      if (list.length === 0) { toast.error('Aucune fiche trouvée — collez le lien à la main juste en dessous.'); setShowManual(true); return }
      if (list.length === 1) { await save(list[0].reviewUrl); return }
      setCandidates(list) // plusieurs fiches → l'utilisateur choisit
    } catch { toast.error('Recherche impossible'); setShowManual(true) } finally { setSearching(false) }
  }

  // Mode replié : le lien est déjà configuré.
  if (collapsible && !open) {
    return (
      <Card className="border-0 shadow-[var(--shadow-sm)]">
        <CardContent className="p-4 flex items-center gap-3">
          <span className="grid place-items-center w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex-shrink-0"><Check className="w-5 h-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-marine">Lien d&apos;avis Google configuré</p>
            <p className="text-xs text-gray-400 truncate">{initialUrl}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}><Pencil className="w-4 h-4 mr-1.5" /> Modifier</Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-0 shadow-[var(--shadow-sm)] ring-1 ring-amber-100">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-base flex items-center gap-2"><Star className="w-4 h-4 text-amber-500" /> {collapsible ? 'Modifier mon lien d\'avis' : 'Activez les avis Google'}</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-4">
        <p className="text-sm text-gray-500">
          BatiPilot retrouve votre fiche Google et enregistre votre lien d&apos;avis automatiquement. Ensuite, vos clients de chantiers terminés apparaissent ci-dessous, prêts à être sollicités en un clic.
        </p>

        {/* Bouton automatique (chemin principal) */}
        <div>
          <Button onClick={findAuto} disabled={searching || saving} className="w-full h-11 gap-2">
            {searching || saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
            {searching ? 'Recherche de votre fiche…' : saving ? 'Enregistrement…' : 'Trouver mon lien automatiquement'}
          </Button>
          <p className="text-xs text-gray-400 mt-1.5 text-center">D&apos;après le nom et l&apos;adresse de votre entreprise (réglages).</p>
        </div>

        {/* Plusieurs fiches trouvées → choix */}
        {candidates && candidates.length > 1 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-marine">Plusieurs fiches trouvées — laquelle est la vôtre ?</p>
            {candidates.map(c => (
              <button key={c.placeId} onClick={() => save(c.reviewUrl)} disabled={saving}
                className="w-full text-left flex items-start gap-2.5 rounded-xl border border-gray-200 p-3 hover:border-primary hover:bg-primary/[0.03] transition-colors disabled:opacity-60">
                <MapPin className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-marine truncate">{c.name}</span>
                  {c.address && <span className="block text-xs text-gray-400 truncate">{c.address}</span>}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Repli vers la méthode manuelle */}
        {!showManual ? (
          <button onClick={() => setShowManual(true)} className="text-xs text-gray-400 hover:text-gray-600 inline-flex items-center gap-1">
            <ChevronDown className="w-3.5 h-3.5" /> Le faire manuellement
          </button>
        ) : (
          <div className="space-y-4 border-t border-gray-100 pt-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Méthode manuelle</p>
            {/* Étape 1 */}
            <div className="flex gap-3">
              <span className="grid place-items-center w-6 h-6 rounded-full bg-gray-200 text-gray-600 text-xs font-bold flex-shrink-0">1</span>
              <div className="flex-1 space-y-2">
                <p className="text-sm text-marine font-medium">Ouvrez votre fiche sur Google</p>
                <a href={GOOGLE_SEARCH} target="_blank" rel="noopener noreferrer" className="inline-flex">
                  <Button type="button" variant="outline" size="sm" className="gap-2">
                    <Search className="w-4 h-4" /> Rechercher « mon entreprise » <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
                  </Button>
                </a>
              </div>
            </div>
            {/* Étape 2 */}
            <div className="flex gap-3">
              <span className="grid place-items-center w-6 h-6 rounded-full bg-gray-200 text-gray-600 text-xs font-bold flex-shrink-0">2</span>
              <div className="flex-1">
                <p className="text-sm text-marine font-medium">Cliquez sur « Demandez des avis »</p>
                <p className="text-xs text-gray-400 mt-0.5">Google affiche un lien court (il commence par <span className="font-mono">g.page/r/…</span>).</p>
              </div>
            </div>
            {/* Étape 3 */}
            <div className="flex gap-3">
              <span className="grid place-items-center w-6 h-6 rounded-full bg-gray-200 text-gray-600 text-xs font-bold flex-shrink-0">3</span>
              <div className="flex-1 space-y-2">
                <p className="text-sm text-marine font-medium">Collez le lien et enregistrez</p>
                <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://g.page/r/XXXXXXXX/review" />
                <Button onClick={() => save()} disabled={saving || !url.trim()} size="sm">
                  {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Check className="w-4 h-4 mr-1.5" />} Enregistrer le lien
                </Button>
              </div>
            </div>
          </div>
        )}

        {collapsible && <Button variant="ghost" size="sm" onClick={() => { setUrl(initialUrl); setOpen(false); setCandidates(null); setShowManual(false) }}>Fermer</Button>}
      </CardContent>
    </Card>
  )
}
