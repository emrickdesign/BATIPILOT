import { NextResponse } from 'next/server'
import { requireGmail, gmailErrorResponse } from '@/lib/gmail-route'
import { getProfile } from '@/lib/gmail-api'

/**
 * Sonde bon marché : `historyId` change dès que la boîte bouge (message reçu,
 * lu, archivé, supprimé…). Coût : 1 unité de quota, contre ~170 pour recharger
 * une page de liste. Le client s'en sert pour ne recharger que si utile.
 */
export async function GET() {
  const auth = await requireGmail()
  if (!auth.ok) return auth.response
  try {
    const profile = await getProfile(auth.accessToken)
    return NextResponse.json({
      historyId: profile.historyId,
      messagesTotal: profile.messagesTotal,
    })
  } catch (err) {
    return gmailErrorResponse(err)
  }
}
