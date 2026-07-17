import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireGmail, gmailErrorResponse } from '@/lib/gmail-route'
import { modifyMessages, trashMessage, untrashMessage } from '@/lib/gmail-api'

/**
 * Toutes les actions de boîte passent par ici. Gmail n'a pas de notion
 * d'« archiver » ou de « lu » : ce sont des labels qu'on ajoute/retire.
 */
type LabelPatch = { addLabelIds?: string[]; removeLabelIds?: string[] }

const ACTIONS: Record<string, LabelPatch> = {
  archive: { removeLabelIds: ['INBOX'] },
  unarchive: { addLabelIds: ['INBOX'] },
  star: { addLabelIds: ['STARRED'] },
  unstar: { removeLabelIds: ['STARRED'] },
  read: { removeLabelIds: ['UNREAD'] },
  unread: { addLabelIds: ['UNREAD'] },
  spam: { addLabelIds: ['SPAM'], removeLabelIds: ['INBOX'] },
  unspam: { removeLabelIds: ['SPAM'], addLabelIds: ['INBOX'] },
  important: { addLabelIds: ['IMPORTANT'] },
  unimportant: { removeLabelIds: ['IMPORTANT'] },
}

const schema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
  action: z.enum([
    'archive', 'unarchive', 'star', 'unstar', 'read', 'unread',
    'spam', 'unspam', 'important', 'unimportant',
    'trash', 'untrash', 'label',
  ]),
  addLabelIds: z.array(z.string()).optional(),
  removeLabelIds: z.array(z.string()).optional(),
})

export async function POST(req: NextRequest) {
  const auth = await requireGmail()
  if (!auth.ok) return auth.response

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })
  const { ids, action, addLabelIds, removeLabelIds } = parsed.data

  try {
    if (action === 'trash' || action === 'untrash') {
      // Pas d'équivalent batch pour trash : Gmail impose un appel par message.
      const fn = action === 'trash' ? trashMessage : untrashMessage
      for (const id of ids) await fn(auth.accessToken, id)
      if (action === 'trash') {
        await auth.supabase
          .from('emails')
          .update({ status: 'supprime' })
          .eq('user_id', auth.userId)
          .in('gmail_message_id', ids)
      }
      return NextResponse.json({ ok: true })
    }

    const patch =
      action === 'label'
        ? { addLabelIds: addLabelIds || [], removeLabelIds: removeLabelIds || [] }
        : ACTIONS[action]

    await modifyMessages({ accessToken: auth.accessToken, ids, ...patch })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return gmailErrorResponse(err)
  }
}
