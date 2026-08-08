import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { HardHat } from 'lucide-react'
import { clientDisplayName } from '@/lib/chantiers'
import { geocodeAddress } from '@/lib/meteo'
import Link from 'next/link'
import { Star, Send } from 'lucide-react'
import GoogleG from '@/components/icons/GoogleG'
import AvisClient, { type AvisRow } from './AvisClient'
import ReviewLinkGuide from './ReviewLinkGuide'
import ReviewsReport from './ReviewsReport'
import GoogleBusinessReviews from './GoogleBusinessReviews'

const DONE_STATUSES = ['termine', 'facture', 'paye']

// place_id extrait du lien d'avis enregistré (format autocomplétion : ?placeid=XXX).
// Les liens g.page manuels n'en contiennent pas → rapport d'avis indisponible pour eux.
function placeIdFromUrl(u: string): string | null {
  const m = u.match(/place_?id=([^&]+)/i)
  return m ? decodeURIComponent(m[1]) : null
}

export default async function AvisPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: company }, { data: projects }, { data: gbp }] = await Promise.all([
    supabase.from('companies').select('trade_name, google_review_url, address').eq('user_id', user.id).maybeSingle(),
    supabase.from('projects')
      .select('id, title, status, end_date, created_at, client_id, clients(id, type, first_name, last_name, company_name, email, phone, review_requested_at)')
      .eq('user_id', user.id).in('status', DONE_STATUSES).order('end_date', { ascending: false, nullsFirst: false }),
    supabase.from('google_business_connections').select('user_id').eq('user_id', user.id).maybeSingle(),
  ])
  const gbpConnected = !!gbp

  const reviewUrl = (company?.google_review_url || '').trim()
  const companyName = company?.trade_name || null
  const companyAddress = company?.address || ''
  const mapsKey = process.env.GOOGLE_MAPS_BROWSER_KEY || ''
  // Biais géographique pour l'autocomplétion : la fiche proche de l'artisan remonte.
  const bias = mapsKey && companyAddress ? await geocodeAddress(companyAddress) : null

  type Cli = { id: string; type: string; first_name: string | null; last_name: string | null; company_name: string | null; email: string | null; phone: string | null; review_requested_at: string | null }
  type Proj = { id: string; title: string; status: string; end_date: string | null; created_at: string; client_id: string | null; clients: Cli | null }

  // Un client = une demande. On garde le chantier terminé le plus récent comme contexte.
  const seen = new Set<string>()
  const toAsk: AvisRow[] = []
  const done: AvisRow[] = []
  for (const pr of ((projects || []) as unknown as Proj[])) {
    const c = pr.clients
    if (!c || seen.has(c.id)) continue
    seen.add(c.id)
    const hasContact = !!(c.email || c.phone)
    const row: AvisRow = {
      clientId: c.id,
      clientName: clientDisplayName(c),
      email: c.email,
      phone: c.phone,
      projectTitle: pr.title,
      requestedAt: c.review_requested_at,
    }
    if (c.review_requested_at) done.push(row)
    else if (hasContact) toAsk.push(row)
  }

  return (
    <div className="space-y-5 animate-fade-up">
      <div>
        <h1 className="text-2xl md:text-[26px] font-bold font-heading text-marine">Avis clients</h1>
        <p className="text-gray-500 mt-1 text-sm">Demandez un avis Google à vos clients satisfaits — le meilleur moteur de nouveaux chantiers.</p>
      </div>

      {!reviewUrl ? (
        <ReviewLinkGuide initialUrl="" companyName={companyName || ''} companyAddress={companyAddress} mapsKey={mapsKey} biasLat={bias?.lat} biasLng={bias?.lon} />
      ) : (
        <div className="grid lg:grid-cols-2 gap-5 items-start">
          {/* Colonne gauche — demander des avis à ses clients */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="grid place-items-center w-6 h-6 rounded-md bg-primary/10 text-primary flex-shrink-0"><Send className="w-3.5 h-3.5" /></span>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Demander des avis à mes clients</h2>
            </div>
            <AvisClient companyName={companyName} reviewUrl={reviewUrl} toAsk={toAsk} done={done} />
          </div>

          {/* Colonne droite — ma fiche Google (avis reçus + connexion) */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="grid place-items-center w-6 h-6 rounded-md bg-white border border-gray-200 flex-shrink-0"><GoogleG className="w-3.5 h-3.5" /></span>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Ma fiche Google {gbpConnected ? '· connectée' : ''}</h2>
            </div>
            {gbpConnected ? (
              <GoogleBusinessReviews />
            ) : (
              <>
                <ReviewsReport placeId={placeIdFromUrl(reviewUrl)} mapsKey={mapsKey} />
                <Link href="/api/auth/gbp/initiate"
                  className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/[0.04] p-4 hover:bg-primary/[0.07] transition-colors">
                  <span className="grid place-items-center w-10 h-10 rounded-xl bg-primary/15 text-primary flex-shrink-0"><Star className="w-5 h-5" /></span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-marine">Connecter Google Business</p>
                    <p className="text-xs text-gray-500">Voir TOUS vos avis et y répondre directement depuis l&apos;app.</p>
                  </div>
                </Link>
              </>
            )}
            <ReviewLinkGuide initialUrl={reviewUrl} collapsible companyName={companyName || ''} companyAddress={companyAddress} mapsKey={mapsKey} biasLat={bias?.lat} biasLng={bias?.lon} />
          </div>
        </div>
      )}

      {reviewUrl && toAsk.length === 0 && done.length === 0 && (
        <Card className="border-0 shadow-[var(--shadow-sm)]">
          <CardContent className="py-14 text-center text-gray-500">
            <HardHat className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="font-medium text-marine">Aucun chantier terminé pour l&apos;instant</p>
            <p className="text-sm mt-1">Dès qu&apos;un chantier passe en « terminé », son client apparaît ici pour une demande d&apos;avis en un clic.</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
