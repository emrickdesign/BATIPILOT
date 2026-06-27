import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getValidGmailToken } from '@/lib/gmail-token'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

    const { emailId, body, subject, to } = await req.json()
    if (!body || !to) return NextResponse.json({ error: 'Destinataire et corps requis' }, { status: 400 })

    const gmailToken = await getValidGmailToken(supabase, user.id)
    if (!gmailToken) return NextResponse.json({ error: 'Gmail non connecté' }, { status: 400 })

    const { data: email } = emailId
      ? await supabase.from('emails').select('*').eq('id', emailId).single()
      : { data: null }

    const fromEmail = gmailToken.gmailEmail
    const replySubject = subject || (email?.subject ? `Re: ${email.subject}` : 'Réponse')
    const threadId = email?.thread_id || null

    // Construire l'email RFC 2822
    const rawEmail = [
      `From: ${fromEmail}`,
      `To: ${to}`,
      `Subject: ${replySubject}`,
      `Content-Type: text/plain; charset=utf-8`,
      `MIME-Version: 1.0`,
      ``,
      body,
    ].join('\r\n')

    const encoded = Buffer.from(rawEmail).toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

    const payload: any = { raw: encoded }
    if (threadId) payload.threadId = threadId

    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${gmailToken.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('Gmail send error:', err)
      return NextResponse.json({ error: 'Erreur envoi Gmail' }, { status: 502 })
    }

    // Marquer l'email comme traité
    if (emailId) {
      await supabase.from('emails').update({ status: 'traite' }).eq('id', emailId)
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Send error:', err)
    return NextResponse.json({ error: err?.message || 'Erreur serveur' }, { status: 500 })
  }
}
