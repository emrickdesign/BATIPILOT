import { NextRequest, NextResponse } from 'next/server'
import { requireGmail, gmailErrorResponse } from '@/lib/gmail-route'
import { getMessage } from '@/lib/gmail-api'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireGmail()
  if (!auth.ok) return auth.response
  const { id } = await params

  try {
    const message = await getMessage(auth.accessToken, id)

    const { data: ai } = await auth.supabase
      .from('emails')
      .select('id, category, importance, ai_summary, ai_recommended_action, linked_client_id')
      .eq('user_id', auth.userId)
      .eq('gmail_message_id', id)
      .maybeSingle()

    return NextResponse.json({ message, ai: ai || null })
  } catch (err) {
    return gmailErrorResponse(err)
  }
}
