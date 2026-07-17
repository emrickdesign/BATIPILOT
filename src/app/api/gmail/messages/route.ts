import { NextRequest, NextResponse } from 'next/server'
import { requireGmail, gmailErrorResponse } from '@/lib/gmail-route'
import { listMessages } from '@/lib/gmail-api'

export async function GET(req: NextRequest) {
  const auth = await requireGmail()
  if (!auth.ok) return auth.response

  const sp = req.nextUrl.searchParams
  const labelIds = sp.getAll('labelIds').filter(Boolean)
  const q = sp.get('q') || undefined
  const pageToken = sp.get('pageToken') || undefined
  const maxResults = Math.min(Number(sp.get('maxResults')) || 30, 50)

  try {
    const result = await listMessages({
      accessToken: auth.accessToken,
      labelIds: labelIds.length ? labelIds : undefined,
      q,
      pageToken,
      maxResults,
    })

    // Surcouche IA : on recolle résumé/catégorie/urgence du miroir Supabase
    // sur les messages affichés, sans que le miroir pilote la liste.
    const ids = result.messages.map(m => m.id)
    let aiById: Record<string, any> = {}
    if (ids.length) {
      const { data } = await auth.supabase
        .from('emails')
        .select('id, gmail_message_id, category, importance, ai_summary, ai_recommended_action, linked_client_id')
        .eq('user_id', auth.userId)
        .in('gmail_message_id', ids)
      for (const row of data || []) aiById[row.gmail_message_id] = row
    }

    return NextResponse.json({
      messages: result.messages.map(m => ({ ...m, ai: aiById[m.id] || null })),
      nextPageToken: result.nextPageToken || null,
      resultSizeEstimate: result.resultSizeEstimate,
    })
  } catch (err) {
    return gmailErrorResponse(err)
  }
}
