import { NextRequest, NextResponse } from 'next/server'
import { requireGmail, gmailErrorResponse } from '@/lib/gmail-route'
import { getAttachment } from '@/lib/gmail-api'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  const auth = await requireGmail()
  if (!auth.ok) return auth.response
  const { id, attachmentId } = await params

  const filename = req.nextUrl.searchParams.get('filename') || 'piece-jointe'
  const mimeType = req.nextUrl.searchParams.get('mimeType') || 'application/octet-stream'

  try {
    const buffer = await getAttachment(auth.accessToken, id, attachmentId)
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': mimeType,
        // Le nom vient de Gmail via l'URL : on le neutralise pour qu'il ne
        // puisse pas casser l'en-tête ni forcer un autre chemin.
        'Content-Disposition': `attachment; filename="${filename.replace(/[^\w.\- ]/g, '_')}"`,
        'Content-Length': String(buffer.length),
      },
    })
  } catch (err) {
    return gmailErrorResponse(err)
  }
}
