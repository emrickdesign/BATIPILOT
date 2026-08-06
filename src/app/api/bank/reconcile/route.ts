import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { applyReconciliation } from '@/lib/bank/reconcile'

export const dynamic = 'force-dynamic'

// Rapprochement manuel d'un virement à une facture (validation admin depuis /banque).
// Met à jour la facture (partiel/soldé) et apprend l'IBAN du payeur.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { txId, invoiceId, clientId } = await req.json().catch(() => ({}))
  if (!txId || !invoiceId) return NextResponse.json({ error: 'txId et invoiceId requis' }, { status: 400 })

  // Récupère l'IBAN payeur de la transaction (pour l'apprentissage), en s'assurant qu'elle appartient à l'utilisateur.
  const { data: tx } = await supabase.from('bank_transactions')
    .select('counterparty_iban').eq('id', txId).eq('user_id', user.id).maybeSingle()
  if (!tx) return NextResponse.json({ error: 'Transaction introuvable' }, { status: 404 })

  try {
    await applyReconciliation(supabase, user.id, {
      txId, invoiceId, clientId: clientId || null, method: 'manuel', counterpartyIban: tx.counterparty_iban,
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
