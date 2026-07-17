/**
 * Couche d'accès à Gmail en direct.
 *
 * La table `emails` de Supabase reste le miroir enrichi par l'IA (résumé,
 * catégorie, urgence). Elle n'est PAS la source de vérité de la boîte :
 * libellés, favoris, brouillons, archivage et corbeille vivent dans Gmail.
 * Ce module parle donc à l'API Gmail, et l'UI recolle l'IA par-dessus via
 * `gmail_message_id`.
 */

const API = 'https://gmail.googleapis.com/gmail/v1/users/me'

export type GmailHeaders = Record<string, string>

export type GmailMessageMeta = {
  id: string
  threadId: string
  labelIds: string[]
  snippet: string
  historyId?: string
  internalDate: string
  from: { name: string; email: string }
  to: string
  subject: string
  date: string
  hasAttachments: boolean
}

export type GmailAttachmentMeta = {
  attachmentId: string
  filename: string
  mimeType: string
  size: number
}

export type GmailMessageFull = GmailMessageMeta & {
  bodyHtml: string
  bodyText: string
  attachments: GmailAttachmentMeta[]
  cc: string
  replyTo: string
  messageIdHeader: string
  references: string
}

export type GmailLabel = {
  id: string
  name: string
  type: 'system' | 'user'
  messagesUnread?: number
  messagesTotal?: number
  color?: { backgroundColor?: string; textColor?: string }
}

export class GmailError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

/**
 * Appel Gmail avec retry sur 429/5xx. Gmail limite à 250 unités de quota par
 * seconde et par utilisateur ; un messages.get en coûte 5. On peut donc taper
 * le mur en rafale sur une page de liste, d'où le backoff exponentiel.
 */
async function gmailFetch(
  path: string,
  accessToken: string,
  init: RequestInit = {},
  attempt = 0
): Promise<any> {
  const url = path.startsWith('http') ? path : `${API}${path}`
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.body && !(init.body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...(init.headers || {}),
    },
  })

  if (res.status === 429 || res.status >= 500) {
    if (attempt < 3) {
      await new Promise(r => setTimeout(r, 2 ** attempt * 300 + Math.random() * 200))
      return gmailFetch(path, accessToken, init, attempt + 1)
    }
  }

  if (!res.ok) {
    const text = await res.text()
    let msg = text
    try {
      msg = JSON.parse(text)?.error?.message || text
    } catch {}
    throw new GmailError(msg || `Gmail ${res.status}`, res.status)
  }

  if (res.status === 204) return null
  return res.json()
}

/** Exécute les promesses par vagues pour ne pas exploser le quota Gmail. */
async function pooled<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))))
  }
  return out
}

function decodeBody(data?: string): string {
  if (!data) return ''
  try {
    return Buffer.from(data, 'base64url').toString('utf-8')
  } catch {
    return ''
  }
}

function headersOf(payload: any): GmailHeaders {
  const out: GmailHeaders = {}
  for (const h of payload?.headers || []) out[String(h.name).toLowerCase()] = h.value
  return out
}

export function parseAddress(raw: string): { name: string; email: string } {
  const v = (raw || '').trim()
  const m = v.match(/^\s*(?:"?([^"<]*?)"?\s*)?<([^>]+)>\s*$/)
  if (m) return { name: (m[1] || '').trim(), email: (m[2] || '').trim() }
  return { name: '', email: v }
}

function collectParts(payload: any, out: any[] = []): any[] {
  if (!payload) return out
  out.push(payload)
  for (const p of payload.parts || []) collectParts(p, out)
  return out
}

function toMeta(msg: any): GmailMessageMeta {
  const h = headersOf(msg.payload)
  const parts = collectParts(msg.payload)
  return {
    id: msg.id,
    threadId: msg.threadId,
    labelIds: msg.labelIds || [],
    snippet: decodeEntities(msg.snippet || ''),
    internalDate: msg.internalDate,
    from: parseAddress(h.from || ''),
    to: h.to || '',
    subject: h.subject || '(sans objet)',
    date: h.date || '',
    hasAttachments: parts.some(p => p.filename && p.body?.attachmentId),
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

/* ---------------------------------- Liste --------------------------------- */

export async function listMessages(params: {
  accessToken: string
  labelIds?: string[]
  q?: string
  pageToken?: string
  maxResults?: number
}): Promise<{ messages: GmailMessageMeta[]; nextPageToken?: string; resultSizeEstimate: number }> {
  const qs = new URLSearchParams()
  qs.set('maxResults', String(params.maxResults ?? 30))
  for (const l of params.labelIds || []) qs.append('labelIds', l)
  if (params.q) qs.set('q', params.q)
  if (params.pageToken) qs.set('pageToken', params.pageToken)

  const list = await gmailFetch(`/messages?${qs}`, params.accessToken)
  const ids: { id: string }[] = list?.messages || []
  if (!ids.length) {
    return { messages: [], nextPageToken: list?.nextPageToken, resultSizeEstimate: list?.resultSizeEstimate || 0 }
  }

  // format=metadata coûte 5 unités par message : 10 en parallèle = 50 unités
  // par vague, loin des 250/s autorisées.
  const details = await pooled(ids, 10, async ({ id }) => {
    try {
      return await gmailFetch(
        `/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
        params.accessToken
      )
    } catch {
      return null
    }
  })

  return {
    messages: details.filter(Boolean).map(toMeta),
    nextPageToken: list?.nextPageToken,
    resultSizeEstimate: list?.resultSizeEstimate || 0,
  }
}

/* -------------------------------- Message ---------------------------------- */

export async function getMessage(accessToken: string, id: string): Promise<GmailMessageFull> {
  const msg = await gmailFetch(`/messages/${id}?format=full`, accessToken)
  const meta = toMeta(msg)
  const h = headersOf(msg.payload)
  const parts = collectParts(msg.payload)

  const htmlPart = parts.find(p => p.mimeType === 'text/html' && p.body?.data && !p.filename)
  const textPart = parts.find(p => p.mimeType === 'text/plain' && p.body?.data && !p.filename)

  const attachments: GmailAttachmentMeta[] = parts
    .filter(p => p.filename && p.body?.attachmentId)
    .map(p => ({
      attachmentId: p.body.attachmentId,
      filename: p.filename,
      mimeType: p.mimeType || 'application/octet-stream',
      size: p.body.size || 0,
    }))

  return {
    ...meta,
    bodyHtml: decodeBody(htmlPart?.body?.data),
    bodyText: decodeBody(textPart?.body?.data) || decodeBody(msg.payload?.body?.data),
    attachments,
    cc: h.cc || '',
    replyTo: h['reply-to'] || '',
    messageIdHeader: h['message-id'] || '',
    references: h.references || '',
  }
}

export async function getAttachment(
  accessToken: string,
  messageId: string,
  attachmentId: string
): Promise<Buffer> {
  const res = await gmailFetch(`/messages/${messageId}/attachments/${attachmentId}`, accessToken)
  return Buffer.from(res.data, 'base64url')
}

/* --------------------------------- Labels ---------------------------------- */

export async function listLabels(accessToken: string): Promise<GmailLabel[]> {
  const res = await gmailFetch('/labels', accessToken)
  const labels: GmailLabel[] = res?.labels || []
  // Le compteur d'un label n'est pas dans /labels : il faut un get par label.
  // On ne le fait que pour ceux qu'on affiche avec une pastille non-lus.
  const wanted = new Set(['INBOX', 'STARRED', 'DRAFT', 'SPAM', 'SNOOZED'])
  const needsCount = labels.filter(l => l.type === 'user' || wanted.has(l.id))
  const counts = await pooled(needsCount, 10, async l => {
    try {
      return await gmailFetch(`/labels/${l.id}`, accessToken)
    } catch {
      return null
    }
  })
  const byId = new Map(counts.filter(Boolean).map((c: any) => [c.id, c]))
  return labels.map(l => {
    const c = byId.get(l.id)
    return c ? { ...l, messagesUnread: c.messagesUnread, messagesTotal: c.messagesTotal } : l
  })
}

export async function createLabel(accessToken: string, name: string): Promise<GmailLabel> {
  return gmailFetch('/labels', accessToken, {
    method: 'POST',
    body: JSON.stringify({
      name,
      labelListVisibility: 'labelShow',
      messageListVisibility: 'show',
    }),
  })
}

export async function deleteLabel(accessToken: string, id: string): Promise<void> {
  await gmailFetch(`/labels/${id}`, accessToken, { method: 'DELETE' })
}

/* -------------------------------- Actions ---------------------------------- */

export async function modifyMessages(params: {
  accessToken: string
  ids: string[]
  addLabelIds?: string[]
  removeLabelIds?: string[]
}): Promise<void> {
  if (!params.ids.length) return
  // batchModify accepte 1000 ids et ne coûte que 50 unités, contre 5 par
  // messages.modify individuel : c'est le bon appel pour les actions de masse.
  await gmailFetch('/messages/batchModify', params.accessToken, {
    method: 'POST',
    body: JSON.stringify({
      ids: params.ids,
      addLabelIds: params.addLabelIds || [],
      removeLabelIds: params.removeLabelIds || [],
    }),
  })
}

export async function trashMessage(accessToken: string, id: string): Promise<void> {
  await gmailFetch(`/messages/${id}/trash`, accessToken, { method: 'POST' })
}

export async function untrashMessage(accessToken: string, id: string): Promise<void> {
  await gmailFetch(`/messages/${id}/untrash`, accessToken, { method: 'POST' })
}

/* --------------------------------- Envoi ----------------------------------- */

export type OutgoingAttachment = { filename: string; mimeType: string; content: Buffer }

function encodeHeaderValue(s: string): string {
  return /[^\x00-\x7F]/.test(s) ? `=?UTF-8?B?${Buffer.from(s).toString('base64')}?=` : s
}

/** Construit un message RFC 2822 : alternative texte/html + pièces jointes. */
export function buildMime(params: {
  from: string
  to: string
  cc?: string
  bcc?: string
  subject: string
  html: string
  text?: string
  attachments?: OutgoingAttachment[]
  inReplyTo?: string
  references?: string
}): string {
  const mixed = `mixed_${Date.now()}_${Math.random().toString(36).slice(2)}`
  const alt = `alt_${Date.now()}_${Math.random().toString(36).slice(2)}`
  const atts = params.attachments || []

  const lines: string[] = [
    `From: ${params.from}`,
    `To: ${params.to}`,
  ]
  if (params.cc) lines.push(`Cc: ${params.cc}`)
  if (params.bcc) lines.push(`Bcc: ${params.bcc}`)
  lines.push(`Subject: ${encodeHeaderValue(params.subject)}`)
  if (params.inReplyTo) {
    lines.push(`In-Reply-To: ${params.inReplyTo}`)
    lines.push(`References: ${params.references ? `${params.references} ` : ''}${params.inReplyTo}`)
  }
  lines.push('MIME-Version: 1.0')

  const bodyBlock = [
    `Content-Type: multipart/alternative; boundary="${alt}"`,
    '',
    `--${alt}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(params.text || stripHtml(params.html)).toString('base64').match(/.{1,76}/g)?.join('\r\n') || '',
    '',
    `--${alt}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(params.html).toString('base64').match(/.{1,76}/g)?.join('\r\n') || '',
    '',
    `--${alt}--`,
  ]

  if (!atts.length) {
    lines.push(...bodyBlock)
  } else {
    lines.push(`Content-Type: multipart/mixed; boundary="${mixed}"`, '', `--${mixed}`, ...bodyBlock, '')
    for (const a of atts) {
      lines.push(
        `--${mixed}`,
        `Content-Type: ${a.mimeType}; name="${a.filename}"`,
        `Content-Disposition: attachment; filename="${encodeHeaderValue(a.filename)}"`,
        'Content-Transfer-Encoding: base64',
        '',
        a.content.toString('base64').match(/.{1,76}/g)?.join('\r\n') || '',
        ''
      )
    }
    lines.push(`--${mixed}--`)
  }

  return Buffer.from(lines.join('\r\n'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export async function sendMessage(params: {
  accessToken: string
  raw: string
  threadId?: string
}): Promise<{ id: string; threadId: string }> {
  return gmailFetch('/messages/send', params.accessToken, {
    method: 'POST',
    body: JSON.stringify({ raw: params.raw, ...(params.threadId ? { threadId: params.threadId } : {}) }),
  })
}

export async function createDraft(params: {
  accessToken: string
  raw: string
  threadId?: string
}): Promise<{ id: string; message: { id: string; threadId: string } }> {
  return gmailFetch('/drafts', params.accessToken, {
    method: 'POST',
    body: JSON.stringify({
      message: { raw: params.raw, ...(params.threadId ? { threadId: params.threadId } : {}) },
    }),
  })
}
