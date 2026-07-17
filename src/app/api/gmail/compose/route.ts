import { NextRequest, NextResponse } from 'next/server'
import { requireGmail, gmailErrorResponse } from '@/lib/gmail-route'
import { buildMime, sendMessage, createDraft, type OutgoingAttachment } from '@/lib/gmail-api'

// Vercel plafonne le corps d'une requête serverless à 4,5 Mo. La limite Gmail
// (25 Mo) n'est donc jamais l'obstacle : c'est celle-ci qu'on annonce.
const MAX_TOTAL_BYTES = 4 * 1024 * 1024

function isValidEmailList(v: string): boolean {
  return v
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .every(s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.replace(/^.*<|>$/g, '')))
}

export async function POST(req: NextRequest) {
  const auth = await requireGmail()
  if (!auth.ok) return auth.response

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })
  }

  const to = String(form.get('to') || '').trim()
  const cc = String(form.get('cc') || '').trim()
  const bcc = String(form.get('bcc') || '').trim()
  const subject = String(form.get('subject') || '').trim()
  const html = String(form.get('html') || '')
  const threadId = String(form.get('threadId') || '').trim() || undefined
  const inReplyTo = String(form.get('inReplyTo') || '').trim() || undefined
  const references = String(form.get('references') || '').trim() || undefined
  const asDraft = form.get('draft') === 'true'

  if (!to) return NextResponse.json({ error: 'Destinataire manquant' }, { status: 400 })
  for (const [label, v] of [['Destinataire', to], ['Cc', cc], ['Cci', bcc]] as const) {
    if (v && !isValidEmailList(v)) {
      return NextResponse.json({ error: `${label} : adresse invalide` }, { status: 400 })
    }
  }

  const attachments: OutgoingAttachment[] = []
  let total = 0
  for (const file of form.getAll('attachments')) {
    if (!(file instanceof File)) continue
    total += file.size
    if (total > MAX_TOTAL_BYTES) {
      return NextResponse.json(
        { error: 'Pièces jointes trop lourdes (4 Mo maximum au total)' },
        { status: 413 }
      )
    }
    attachments.push({
      filename: file.name,
      mimeType: file.type || 'application/octet-stream',
      content: Buffer.from(await file.arrayBuffer()),
    })
  }

  try {
    const raw = buildMime({
      from: auth.gmailEmail,
      to,
      cc: cc || undefined,
      bcc: bcc || undefined,
      subject: subject || '(sans objet)',
      html,
      attachments,
      inReplyTo,
      references,
    })

    const result = asDraft
      ? await createDraft({ accessToken: auth.accessToken, raw, threadId })
      : await sendMessage({ accessToken: auth.accessToken, raw, threadId })

    // Un message auquel on a répondu est traité : le miroir IA doit suivre.
    if (!asDraft && threadId) {
      await auth.supabase
        .from('emails')
        .update({ status: 'traite' })
        .eq('user_id', auth.userId)
        .eq('thread_id', threadId)
    }

    return NextResponse.json({ ok: true, result })
  } catch (err) {
    return gmailErrorResponse(err)
  }
}
