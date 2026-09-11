import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { getConnectionInfo } from '@/lib/einvoicing/service'
import { pennylaneOAuthConfigured } from '@/lib/einvoicing/pennylane'
import EInvoicingSettings, { type CompanyTaxInfo } from './EInvoicingSettings'

export const dynamic = 'force-dynamic'

export default async function FacturationElectroniquePage({ searchParams }: { searchParams: Promise<{ connected?: string; error?: string }> }) {
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: company }, connection, { count }] = await Promise.all([
    supabase.from('companies')
      .select('id, siret, vat_number, address, iban, vat_regime, vat_on_debits, operation_category')
      .eq('user_id', user.id).maybeSingle(),
    getConnectionInfo(user.id),
    supabase.from('invoices').select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).not('einvoice_status', 'is', null).neq('einvoice_status', 'erreur'),
  ])

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/parametres"><Button variant="ghost" size="sm" className="gap-1"><ArrowLeft className="w-4 h-4" /> Retour</Button></Link>
        <div>
          <h1 className="text-2xl font-bold font-heading text-marine">Facturation électronique</h1>
          <p className="text-sm text-gray-500">Factures au format Factur-X et connexion à votre plateforme agréée.</p>
        </div>
      </div>

      <EInvoicingSettings
        company={company as CompanyTaxInfo | null}
        connection={connection}
        oauthReady={pennylaneOAuthConfigured()}
        transmittedCount={count ?? 0}
        flash={{ connected: sp.connected ?? null, error: sp.error ?? null }}
      />
    </div>
  )
}
