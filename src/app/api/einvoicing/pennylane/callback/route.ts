import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { pennylaneAccount, pennylaneExchangeCode } from '@/lib/einvoicing/pennylane'
import { saveConnection } from '@/lib/einvoicing/service'

// Retour de l'autorisation Pennylane : vérifie l'anti-CSRF, échange le code contre les
// jetons (chiffrés en base) puis revient sur Paramètres › Facturation électronique.

const SETTINGS = '/parametres/facturation-electronique'
const STATE_COOKIE = 'tp_pennylane_state'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))

  const back = (query: string) => {
    const res = NextResponse.redirect(new URL(`${SETTINGS}?${query}`, req.url))
    res.cookies.delete({ name: STATE_COOKIE, path: '/api/einvoicing/pennylane' })
    return res
  }
  const sp = req.nextUrl.searchParams
  if (sp.get('error')) return back(`error=${encodeURIComponent('Connexion Pennylane annulée.')}`)
  const code = sp.get('code')
  const state = sp.get('state')
  if (!code || !state || state !== req.cookies.get(STATE_COOKIE)?.value) {
    return back(`error=${encodeURIComponent('Lien de connexion expiré : recommencez.')}`)
  }

  try {
    const credentials = await pennylaneExchangeCode(code, `${req.nextUrl.origin}/api/einvoicing/pennylane/callback`)
    const accountLabel = await pennylaneAccount(credentials.access_token)
    await saveConnection(user.id, { provider: 'pennylane', authType: 'oauth', credentials, accountLabel })
    return back('connected=pennylane')
  } catch (err) {
    return back(`error=${encodeURIComponent(err instanceof Error ? err.message : 'Connexion Pennylane impossible.')}`)
  }
}
