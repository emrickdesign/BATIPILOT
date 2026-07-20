import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, Tag, Upload, Sparkles } from 'lucide-react'
import SeedPrixButton from './SeedPrixButton'
import PrixList, { type PrixCategory } from './PrixList'

export default async function PrixPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: categories } = await supabase
    .from('price_categories')
    .select('*, price_items(*)')
    .eq('user_id', user.id)
    .order('sort_order')

  const isEmpty = !categories?.length

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-[26px] font-bold font-heading text-marine">Mes prix</h1>
          <p className="text-gray-500 mt-1 text-sm">Vos prix de vente — ils servent aux devis et au chiffrage des plans.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link href="/prix/importer">
            <Button variant="outline" className="h-10 gap-2"><Upload className="w-4 h-4" /> Importer un document</Button>
          </Link>
          <Link href="/prix/generer">
            <Button variant="outline" className="h-10 gap-2"><Sparkles className="w-4 h-4" /> Construire avec l&apos;IA</Button>
          </Link>
          <Link href="/prix/nouveau">
            <Button className="h-10 gap-2"><Plus className="w-4 h-4" /> Ajouter</Button>
          </Link>
        </div>
      </div>

      {isEmpty ? (
        // Trois portes d'entrée : on ne laisse personne bloqué devant une page vide
        <div className="grid md:grid-cols-3 gap-3">
          <Link href="/prix/generer">
            <Card className="h-full border-2 border-primary/40 bg-accent/30 hover:bg-accent/50 transition-colors">
              <CardContent className="p-5 space-y-2">
                <span className="grid place-items-center w-11 h-11 rounded-2xl bg-primary text-primary-foreground"><Sparkles className="w-5 h-5" /></span>
                <p className="font-semibold text-marine">Je pars de zéro</p>
                <p className="text-xs text-gray-500">Dites votre métier à la voix, l&apos;IA propose une base que vous ajustez. Elle peut partir de votre coût horaire.</p>
              </CardContent>
            </Card>
          </Link>
          <Link href="/prix/importer">
            <Card className="h-full border border-gray-200/80 hover:shadow-[var(--shadow-md)] transition-shadow">
              <CardContent className="p-5 space-y-2">
                <span className="grid place-items-center w-11 h-11 rounded-2xl bg-accent text-primary"><Upload className="w-5 h-5" /></span>
                <p className="font-semibold text-marine">J&apos;ai déjà une base</p>
                <p className="text-xs text-gray-500">PDF, Excel, Word, CSV ou une simple photo : l&apos;IA en extrait vos prestations.</p>
              </CardContent>
            </Card>
          </Link>
          <Card className="h-full border border-gray-200/80">
            <CardContent className="p-5 space-y-2">
              <span className="grid place-items-center w-11 h-11 rounded-2xl bg-gray-100 text-gray-500"><Tag className="w-5 h-5" /></span>
              <p className="font-semibold text-marine">Base type du bâtiment</p>
              <p className="text-xs text-gray-500 mb-3">Un jeu de prestations courantes pour démarrer tout de suite.</p>
              <SeedPrixButton />
            </CardContent>
          </Card>
        </div>
      ) : (
        <PrixList initialCategories={(categories as unknown as PrixCategory[]) || []} />
      )}
    </div>
  )
}
