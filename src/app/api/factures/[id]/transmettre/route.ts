import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { transmitInvoice } from '@/lib/einvoicing/service'

// Dépose la facture (Factur-X) sur la plateforme agréée de l'entreprise.
// ?auto=1 : déclenché par l'envoi de la facture → respecte le réglage « envoi automatique ».
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

  try {
    const result = await transmitInvoice(supabase, user.id, id, { auto: req.nextUrl.searchParams.get('auto') === '1' })
    return NextResponse.json(result, { status: result.ok || result.skipped ? 200 : 400 })
  } catch (err) {
    console.error('Transmission facture électronique :', err)
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : 'Erreur serveur' }, { status: 500 })
  }
}
