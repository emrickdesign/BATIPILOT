'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Star, ExternalLink, Check, Loader2, Pencil, Search, MapPin, X } from 'lucide-react'
import FicheAutocomplete, { type SelectedFiche } from './FicheAutocomplete'

export default function ReviewLinkGuide({ initialUrl, collapsible = false, companyName = '', companyAddress = '', mapsKey = '', biasLat, biasLng }: { initialUrl: string; collapsible?: boolean; companyName?: string; companyAddress?: string; mapsKey?: string; biasLat?: number; biasLng?: number }) {
  const router = useRouter()
  const [url, setUrl] = useState(initialUrl)
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(!collapsible)
  const [selected, setSelected] = useState<SelectedFiche | null>(null)
  const [showManual, setShowManual] = useState(false)

  // Recherche Google grand public en mode « Lieux » (udm=1) sur le nom + l'adresse :
  // ça atterrit directement sur la fiche d'établissement (l'index public la connaît,
  // contrairement à l'API). Repli sur « mon entreprise » si le nom n'est pas renseigné.
  const query = [companyName.trim(), companyAddress.trim()].filter(Boolean).join(' ') || 'mon entreprise'
  const googleSearch = `https://www.google.com/search?udm=1&q=${encodeURIComponent(query)}`

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
    toast.success('Lien d’avis enregistré ✅')
    router.refresh()
  }

  // Mode replié : le lien est déjà configuré → carte verte « validé ».
  if (collapsible && !open) {
    return (
      <Card className="border-0 shadow-[var(--shadow-sm)] ring-1 ring-emerald-200 bg-emerald-50/40">
        <CardContent className="p-4 flex items-center gap-3">
          <span className="grid place-items-center w-9 h-9 rounded-full bg-emerald-500 text-white flex-shrink-0"><Check className="w-5 h-5" strokeWidth={3} /></span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-emerald-800">Fiche Google validée — avis activés</p>
            <p className="text-xs text-emerald-700/70 truncate">Vos clients peuvent être sollicités en un clic ci-dessus.</p>
          </div>
          <Button variant="outline" size="sm" className="border-emerald-200 text-emerald-700 hover:bg-emerald-100" onClick={() => setOpen(true)}><Pencil className="w-4 h-4 mr-1.5" /> Changer</Button>
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
          Récupérez votre lien d&apos;avis Google — une seule fois. Ensuite, vos clients de chantiers terminés apparaissent ci-dessous, prêts à être sollicités en un clic.
        </p>

        {/* Méthode automatique : widget d'autocomplétion Google */}
        {mapsKey && (
          <div className="space-y-2">
            <p className="text-sm text-marine font-medium flex items-center gap-1.5"><Search className="w-4 h-4 text-primary" /> Trouvez votre entreprise</p>
            <FicheAutocomplete apiKey={mapsKey} biasLat={biasLat} biasLng={biasLng} onSelect={r => setSelected(r)} />
            <p className="text-xs text-gray-400">
              Tapez le nom de votre entreprise et sélectionnez votre fiche. Fonctionne pour les <span className="font-medium">fiches Google actives</span> ; si votre fiche est trop petite/récente et n&apos;apparaît pas, utilisez le guide manuel juste en dessous.
            </p>

            {/* Confirmation : avis de la fiche choisie (mis à jour à chaque sélection) */}
            {selected && (
              <div className="rounded-xl border border-primary/30 bg-primary/[0.03] p-3 space-y-2 animate-fade-up">
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-marine truncate">{selected.name || 'Fiche sélectionnée'}</p>
                    {selected.address && <p className="text-xs text-gray-400 truncate">{selected.address}</p>}
                    {typeof selected.rating === 'number' && (
                      <p className="text-xs text-amber-600 font-medium mt-0.5">★ {selected.rating.toFixed(1)}{selected.reviewsCount ? ` · ${selected.reviewsCount} avis` : ''}</p>
                    )}
                  </div>
                  <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-700 flex-shrink-0" title="Ce n'est pas ma fiche"><X className="w-4 h-4" /></button>
                </div>

                {selected.reviews && selected.reviews.length > 0 ? (
                  <div className="space-y-1.5 border-t border-primary/10 pt-2">
                    {selected.reviews.map((rv, i) => (
                      <div key={i} className="text-xs">
                        <span className="font-medium text-gray-700">{rv.author || 'Client'}</span>
                        <span className="text-amber-500"> {'★'.repeat(Math.round(rv.rating))}</span>
                        {rv.text && <span className="text-gray-500 line-clamp-2"> — {rv.text}</span>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 border-t border-primary/10 pt-2">Pas encore d&apos;avis sur cette fiche — vérifiez que c&apos;est bien la vôtre.</p>
                )}

                <Button onClick={() => save(`https://search.google.com/local/writereview?placeid=${selected.placeId}`)} disabled={saving} className="w-full h-10 gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} C&apos;est ma fiche — enregistrer le lien d&apos;avis
                </Button>
              </div>
            )}

            <button type="button" onClick={() => setShowManual(v => !v)} className="w-full flex items-center gap-2 pt-1 text-[11px] uppercase tracking-wide text-gray-400 hover:text-gray-600">
              <span className="h-px flex-1 bg-gray-100" /> {showManual ? 'masquer le manuel' : 'ma fiche n\'apparaît pas ? faire à la main'} <span className="h-px flex-1 bg-gray-100" />
            </button>
          </div>
        )}

        {/* Méthode manuelle : masquée par défaut quand l'autocomplétion est dispo */}
        {(!mapsKey || showManual) && (<>
        {/* Étape 1 : ouvrir sa fiche Google */}
        <div className="flex gap-3">
          <span className="grid place-items-center w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex-shrink-0">1</span>
          <div className="flex-1 space-y-2">
            <p className="text-sm text-marine font-medium">Ouvrez votre fiche Google</p>
            <a href={googleSearch} target="_blank" rel="noopener noreferrer" className="inline-flex">
              <Button type="button" className="gap-2"><ExternalLink className="w-4 h-4" /> Voir ma fiche Google</Button>
            </a>
            <p className="text-xs text-gray-400">
              {companyName.trim()
                ? <>Ouvre Google sur « {companyName.trim()} » — votre fiche s&apos;affiche directement.</>
                : <>Renseignez le nom de votre entreprise dans les réglages pour tomber pile sur votre fiche.</>}
            </p>
          </div>
        </div>

        {/* Étape 2 : copier le lien d'avis */}
        <div className="flex gap-3">
          <span className="grid place-items-center w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex-shrink-0">2</span>
          <div className="flex-1">
            <p className="text-sm text-marine font-medium">Cliquez « Demander des avis » et copiez le lien</p>
            <p className="text-xs text-gray-400 mt-0.5">Sur votre fiche : bouton <span className="font-medium">« Demander des avis »</span> (ou « Obtenir plus d&apos;avis ») → Google affiche un lien court à copier (il commence par <span className="font-mono">g.page/r/…</span>).</p>
          </div>
        </div>

        {/* Étape 3 : coller + enregistrer */}
        <div className="flex gap-3">
          <span className="grid place-items-center w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex-shrink-0">3</span>
          <div className="flex-1 space-y-2">
            <p className="text-sm text-marine font-medium">Collez le lien ici et enregistrez</p>
            <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://g.page/r/XXXXXXXX/review" />
            <div className="flex items-center gap-2">
              <Button onClick={() => save()} disabled={saving || !url.trim()}>
                {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Check className="w-4 h-4 mr-1.5" />} Enregistrer le lien
              </Button>
              {collapsible && <Button variant="ghost" size="sm" onClick={() => { setUrl(initialUrl); setOpen(false) }}>Annuler</Button>}
            </div>
          </div>
        </div>
        </>)}
      </CardContent>
    </Card>
  )
}
