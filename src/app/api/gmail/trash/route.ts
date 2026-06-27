import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getValidGmailToken } from '@/lib/gmail-token'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

    const { emailId, gmailMessageId } = await req.json()

    const gmailToken = await getValidGmailToken(supabase, user.id)
    if (!gmailToken) return NextResponse.json({ error: 'Gmail non connecté' }, { status: 400 })

    if (gmailMessageId) {
      const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${gmailMessageId}/trash`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${gmailToken.accessToken}` },
      })
      if (!res.ok) {
        console.error('Gmail trash error:', await res.text())
        return NextResponse.json({ error: 'Erreur suppression Gmail' }, { status: 502 })
      }
    }

    if (emailId) {
      await supabase.from('emails').update({ status: 'supprime' }).eq('id', emailId)
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Erreur serveur' }, { status: 500 })
  }
}
