import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireGmail, gmailErrorResponse } from '@/lib/gmail-route'
import { listLabels, createLabel, deleteLabel, renameLabel } from '@/lib/gmail-api'

/** Les libellés système ont un id en majuscules ; ceux de l'utilisateur, Label_N. */
function isSystemLabel(id: string): boolean {
  return id === id.toUpperCase() && !id.startsWith('Label_')
}

export async function GET() {
  const auth = await requireGmail()
  if (!auth.ok) return auth.response
  try {
    return NextResponse.json({ labels: await listLabels(auth.accessToken) })
  } catch (err) {
    return gmailErrorResponse(err)
  }
}

const createSchema = z.object({ name: z.string().trim().min(1).max(225) })

export async function POST(req: NextRequest) {
  const auth = await requireGmail()
  if (!auth.ok) return auth.response
  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Nom de libellé invalide' }, { status: 400 })
  try {
    return NextResponse.json({ label: await createLabel(auth.accessToken, parsed.data.name) })
  } catch (err) {
    return gmailErrorResponse(err)
  }
}

const renameSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(225),
})

export async function PATCH(req: NextRequest) {
  const auth = await requireGmail()
  if (!auth.ok) return auth.response
  const parsed = renameSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })
  if (isSystemLabel(parsed.data.id)) {
    return NextResponse.json({ error: 'Libellé système non modifiable' }, { status: 400 })
  }
  try {
    return NextResponse.json({ label: await renameLabel(auth.accessToken, parsed.data.id, parsed.data.name) })
  } catch (err) {
    return gmailErrorResponse(err)
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireGmail()
  if (!auth.ok) return auth.response
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id manquant' }, { status: 400 })
  // Gmail renverrait un 400 opaque sur un libellé système : autant le dire.
  if (isSystemLabel(id)) {
    return NextResponse.json({ error: 'Libellé système non supprimable' }, { status: 400 })
  }
  try {
    await deleteLabel(auth.accessToken, id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return gmailErrorResponse(err)
  }
}
