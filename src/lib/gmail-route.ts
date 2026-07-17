import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getValidGmailToken } from '@/lib/gmail-token'
import { GmailError } from '@/lib/gmail-api'

/**
 * Résout l'utilisateur connecté + un token Gmail valide, ou renvoie la réponse
 * d'erreur à retourner tel quel. Évite de répéter ce préambule dans chaque route.
 */
export async function requireGmail(): Promise<
  | { ok: true; userId: string; accessToken: string; gmailEmail: string; supabase: Awaited<ReturnType<typeof createClient>> }
  | { ok: false; response: NextResponse }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Non connecté' }, { status: 401 }) }
  }
  const token = await getValidGmailToken(supabase, user.id)
  if (!token?.accessToken) {
    return { ok: false, response: NextResponse.json({ error: 'Gmail non connecté' }, { status: 400 }) }
  }
  return {
    ok: true,
    userId: user.id,
    accessToken: token.accessToken,
    gmailEmail: token.gmailEmail,
    supabase,
  }
}

/** Traduit une erreur Gmail en réponse HTTP sans masquer la cause. */
export function gmailErrorResponse(err: unknown): NextResponse {
  if (err instanceof GmailError) {
    // 401/403 côté Gmail = token révoqué ou scope manquant : l'UI doit inviter
    // à reconnecter plutôt qu'afficher une erreur générique.
    const status = err.status === 401 || err.status === 403 ? 401 : err.status
    return NextResponse.json(
      { error: err.message, reconnect: status === 401 },
      { status: status >= 400 && status < 600 ? status : 500 }
    )
  }
  console.error('Gmail route error:', err)
  return NextResponse.json({ error: (err as Error)?.message || 'Erreur serveur' }, { status: 500 })
}
