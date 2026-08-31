import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserToken, listAccounts } from '@/lib/bank/bridge'

export const dynamic = 'force-dynamic'

// Retour du tunnel Bridge : on récupère les comptes connectés + leur IBAN et on
// marque la connexion comme active. L'utilisateur est identifié par sa session.
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const base = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin
  const fail = (reason: string) => NextResponse.redirect(`${base}/parametres/banque?error=${reason}`)

  if (!user) return NextResponse.redirect(`${base}/login`)

  try {
    const token = await getUserToken(user.id)
    const accounts = await listAccounts(token)
    if (!accounts.length) return fail('no_account')

    // Récupère l'id de connexion en attente (pour rattacher les comptes).
    const { data: pend } = await supabase.from('bank_connections')
      .select('id').eq('user_id', user.id).eq('status', 'pending')
      .order('created_at', { ascending: false }).limit(1).maybeSingle()

    const now = new Date().toISOString()
    for (const a of accounts) {
      await supabase.from('bank_accounts').upsert({
        user_id: user.id,
        connection_id: pend?.id || null,
        account_id: String(a.id),
        iban: a.iban || null,
        name: a.name || null,
        currency: a.currency_code || null,
        balance: typeof a.balance === 'number' ? a.balance : null,
        account_type: a.type || null,
        balance_updated_at: now,
      }, { onConflict: 'account_id' })
    }

    const expires = new Date(Date.now() + 180 * 86400000).toISOString()
    if (pend) {
      await supabase.from('bank_connections').update({ status: 'linked', linked_at: new Date().toISOString(), expires_at: expires })
        .eq('id', pend.id).eq('user_id', user.id)
    } else {
      await supabase.from('bank_connections').insert({
        user_id: user.id, provider: 'bridge', reference: `${user.id}.${Date.now()}`,
        status: 'linked', linked_at: new Date().toISOString(), expires_at: expires,
      })
    }

    return NextResponse.redirect(`${base}/parametres/banque?connected=1`)
  } catch (e) {
    return fail(encodeURIComponent((e as Error).message).slice(0, 80))
  }
}
