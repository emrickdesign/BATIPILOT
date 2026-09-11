import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { deleteConnection, getConnectionInfo, saveConnection, setAutoSend } from '@/lib/einvoicing/service'
import { pennylaneAccount } from '@/lib/einvoicing/pennylane'
import { afnorCheck, isPublicHttpsUrl } from '@/lib/einvoicing/afnor'

// Connexion de l'entreprise à sa plateforme agréée (facture électronique).
// POST = vérifier les accès puis enregistrer · PATCH = envoi automatique · DELETE = déconnecter.

const connectSchema = z.discriminatedUnion('provider', [
  z.object({
    provider: z.literal('pennylane'),
    token: z.string().trim().min(20).max(4000),
  }),
  z.object({
    provider: z.literal('afnor'),
    name: z.string().trim().min(2).max(80),
    flowUrl: z.string().trim().max(500),
    tokenUrl: z.string().trim().max(500),
    clientId: z.string().trim().min(1).max(500),
    clientSecret: z.string().trim().min(1).max(4000),
  }),
])

async function currentUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function GET() {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })
  return NextResponse.json({ connection: await getConnectionInfo(user.id) })
}

export async function POST(req: NextRequest) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

  const parsed = connectSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Informations de connexion incomplètes.' }, { status: 400 })
  const input = parsed.data

  try {
    if (input.provider === 'pennylane') {
      const accountLabel = await pennylaneAccount(input.token)
      await saveConnection(user.id, {
        provider: 'pennylane', authType: 'api_token', accountLabel,
        credentials: { kind: 'api_token', token: input.token },
      })
      return NextResponse.json({ ok: true, accountLabel })
    }

    if (!isPublicHttpsUrl(input.flowUrl) || !isPublicHttpsUrl(input.tokenUrl)) {
      return NextResponse.json({ error: 'Les deux adresses doivent être des URL publiques en https://.' }, { status: 400 })
    }
    const config = { flowUrl: input.flowUrl, tokenUrl: input.tokenUrl, clientId: input.clientId }
    await afnorCheck({ ...config, clientSecret: input.clientSecret })
    await saveConnection(user.id, {
      provider: 'afnor', authType: 'client_credentials', accountLabel: input.name,
      credentials: { clientSecret: input.clientSecret }, config,
    })
    return NextResponse.json({ ok: true, accountLabel: input.name })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Connexion impossible.' }, { status: 400 })
  }
}

export async function PATCH(req: NextRequest) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })
  const body = await req.json().catch(() => null) as { autoSend?: unknown } | null
  if (typeof body?.autoSend !== 'boolean') return NextResponse.json({ error: 'Paramètre invalide' }, { status: 400 })
  await setAutoSend(user.id, body.autoSend)
  return NextResponse.json({ ok: true })
}

export async function DELETE() {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })
  await deleteConnection(user.id)
  return NextResponse.json({ ok: true })
}
