'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Star, ExternalLink, Check, Loader2, Pencil } from 'lucide-react'

// Recherche Google du terme littéral « mon entreprise » : connecté à son compte,
// l'artisan voit sa fiche et peut copier son lien d'avis en un clic.
const GOOGLE_SEARCH = `https://www.google.com/search?q=${encodeURIComponent('mon entreprise')}`

export default function ReviewLinkGuide({ initialUrl, collapsible = false }: { initialUrl: string; collapsible?: boolean }) {
  const router = useRouter()
  const [url, setUrl] = useState(initialUrl)
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(!collapsible)

  async function save() {
    const value = url.trim()
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
          Récupérez votre lien d&apos;avis Google — une seule fois. Ensuite, vos clients de chantiers terminés apparaissent ci-dessous, prêts à être sollicités en un clic.
        </p>

        {/* Étape 1 : ouvrir sa fiche Google */}
        <div className="flex gap-3">
          <span className="grid place-items-center w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex-shrink-0">1</span>
          <div className="flex-1 space-y-2">
            <p className="text-sm text-marine font-medium">Ouvrez votre fiche Google</p>
            <a href={GOOGLE_SEARCH} target="_blank" rel="noopener noreferrer" className="inline-flex">
              <Button type="button" className="gap-2"><ExternalLink className="w-4 h-4" /> Ouvrir ma fiche Google</Button>
            </a>
            <p className="text-xs text-gray-400">Connecté à votre compte Google, votre établissement s&apos;affiche directement (recherche « mon entreprise »).</p>
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
              <Button onClick={save} disabled={saving || !url.trim()}>
                {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Check className="w-4 h-4 mr-1.5" />} Enregistrer le lien
              </Button>
              {collapsible && <Button variant="ghost" size="sm" onClick={() => { setUrl(initialUrl); setOpen(false) }}>Annuler</Button>}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
