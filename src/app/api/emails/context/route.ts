import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { findClientContext } from '@/lib/emailContext'

// Contexte CRM d'un expéditeur (fiche client contextuelle du module mail).
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

  const email = req.nextUrl.searchParams.get('email')
  const clientId = req.nextUrl.searchParams.get('clientId')
  const ctx = await findClientContext(supabase, user.id, email, clientId)
  return NextResponse.json(ctx)
}
