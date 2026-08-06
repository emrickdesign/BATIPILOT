import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getRequisition, getAccountMeta } from '@/lib/bank/gocardless'

export const dynamic = 'force-dynamic'

// Retour après consentement bancaire : GoCardless redirige ici avec ?ref=<reference>.
// On finalise la connexion : récupère les comptes liés + leur IBAN.
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const base = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin
  const fail = (reason: string) => NextResponse.redirect(`${base}/parametres/banque?error=${reason}`)

  if (!user) return NextResponse.redirect(`${base}/login`)
  const reference = req.nextUrl.searchParams.get('ref')
  if (!reference) return fail('no_ref')

  const { data: conn } = await supabase.from('bank_connections')
    .select('id, requisition_id, user_id').eq('reference', reference).eq('user_id', user.id).maybeSingle()
  if (!conn?.requisition_id) return fail('unknown')

  try {
    const req2 = await getRequisition(conn.requisition_id)
    if (!req2.accounts?.length) return fail('no_account')

    for (const accId of req2.accounts) {
      let iban: string | null = null, currency: string | null = null
      try { const meta = await getAccountMeta(accId); iban = meta.iban || null; currency = meta.currency || null } catch { /* méta optionnelle */ }
      await supabase.from('bank_accounts').upsert({
        user_id: user.id,
        connection_id: conn.id,
        account_id: accId,
        iban,
        currency,
      }, { onConflict: 'account_id' })
    }

    // Consentement DSP2 valable ~180 jours → date de re-vérification.
    const expires = new Date(Date.now() + 180 * 86400000).toISOString()
    await supabase.from('bank_connections').update({
      status: 'linked', linked_at: new Date().toISOString(), expires_at: expires,
    }).eq('id', conn.id).eq('user_id', user.id)

    return NextResponse.redirect(`${base}/parametres/banque?connected=1`)
  } catch (e) {
    return fail(encodeURIComponent((e as Error).message).slice(0, 80))
  }
}
