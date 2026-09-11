import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { refreshInvoiceStatus } from '@/lib/einvoicing/service'

// Actualise le statut de la facture électronique auprès de la plateforme agréée.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

  try {
    return NextResponse.json(await refreshInvoiceStatus(supabase, user.id, id))
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Plateforme injoignable' }, { status: 502 })
  }
}
