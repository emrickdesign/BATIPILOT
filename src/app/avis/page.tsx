import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Star, Settings, HardHat } from 'lucide-react'
import { clientDisplayName } from '@/lib/chantiers'
import AvisClient, { type AvisRow } from './AvisClient'

const DONE_STATUSES = ['termine', 'facture', 'paye']

export default async function AvisPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: company }, { data: projects }] = await Promise.all([
    supabase.from('companies').select('trade_name, google_review_url').eq('user_id', user.id).maybeSingle(),
    supabase.from('projects')
      .select('id, title, status, end_date, created_at, client_id, clients(id, type, first_name, last_name, company_name, email, phone, review_requested_at)')
      .eq('user_id', user.id).in('status', DONE_STATUSES).order('end_date', { ascending: false, nullsFirst: false }),
  ])

  const reviewUrl = (company?.google_review_url || '').trim()
  const companyName = company?.trade_name || null

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
        <Card className="border-0 shadow-[var(--shadow-sm)] ring-1 ring-amber-100">
          <CardContent className="p-5 flex items-start gap-3">
            <span className="grid place-items-center w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex-shrink-0"><Star className="w-5 h-5" /></span>
            <div className="flex-1">
              <p className="font-semibold text-marine">Ajoutez d&apos;abord votre lien d&apos;avis Google</p>
              <p className="text-sm text-gray-500 mt-1">Sans le lien de votre fiche Google, impossible d&apos;envoyer la demande. Il se colle une seule fois dans les réglages.</p>
              <Link href="/parametres/entreprise"><Button size="sm" className="mt-3"><Settings className="w-4 h-4 mr-1.5" /> Renseigner mon lien d&apos;avis</Button></Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <AvisClient companyName={companyName} reviewUrl={reviewUrl} toAsk={toAsk} done={done} />
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
