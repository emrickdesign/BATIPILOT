export function encodeSubject(s: string) {
  return /[^\x00-\x7F]/.test(s) ? `=?UTF-8?B?${Buffer.from(s).toString('base64')}?=` : s
}

function buildMultipartEmail(from: string, to: string, subject: string, htmlBody: string, pdfBuffer: Buffer, filename: string) {
  const boundary = `----BatiPilot${Date.now()}`
  const parts = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset=utf-8`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    htmlBody,
    ``,
    `--${boundary}`,
    `Content-Type: application/pdf`,
    `Content-Disposition: attachment; filename="${filename}"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    pdfBuffer.toString('base64').match(/.{1,76}/g)!.join('\r\n'),
    ``,
    `--${boundary}--`,
  ].join('\r\n')
  return Buffer.from(parts).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function sendGmailHtml(params: {
  accessToken: string
  fromEmail: string
  to: string
  subject: string
  htmlBody: string
}): Promise<{ ok: boolean; error?: string }> {
  const raw = [
    `From: ${params.fromEmail}`,
    `To: ${params.to}`,
    `Subject: ${encodeSubject(params.subject)}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=utf-8`,
    ``,
    params.htmlBody,
  ].join('\r\n')
  const encoded = Buffer.from(raw).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${params.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: encoded }),
  })

  if (!res.ok) {
    const err = await res.text()
    return { ok: false, error: err }
  }
  return { ok: true }
}

export async function sendGmailWithPdf(params: {
  accessToken: string
  fromEmail: string
  to: string
  subject: string
  htmlBody: string
  pdfBuffer: Buffer
  filename: string
}): Promise<{ ok: boolean; error?: string }> {
  const encoded = buildMultipartEmail(
    params.fromEmail, params.to, encodeSubject(params.subject), params.htmlBody, params.pdfBuffer, params.filename
  )

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${params.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: encoded }),
  })

  if (!res.ok) {
    const err = await res.text()
    return { ok: false, error: err }
  }
  return { ok: true }
}
