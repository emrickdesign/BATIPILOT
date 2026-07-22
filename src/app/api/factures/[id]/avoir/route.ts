import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100

type LineRow = {
  id: string; designation: string; description?: string; quantity: number; unit: string
  unit_price_ht: number; vat_rate: number; discount_percent?: number; total_ht: number; sort_order?: number
}

/**
 * Crée un avoir (note de crédit) pour une facture : reprend ses lignes en
 * montants négatifs. Annule tout ou partie de la facture d'origine.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

  const { data: src } = await supabase
    .from('invoices').select('*, invoice_lines(*)')
    .eq('id', id).eq('user_id', user.id).single()
  if (!src) return NextResponse.json({ error: 'Facture introuvable' }, { status: 404 })
  if (src.type === 'avoir') return NextResponse.json({ error: 'Un avoir ne peut pas être avoiré' }, { status: 400 })

  const { count } = await supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('user_id', user.id)
  const number = `AV-${new Date().getFullYear()}-${String((count || 0) + 1).padStart(3, '0')}`

  const { data: avoir, error } = await supabase.from('invoices').insert({
    user_id: user.id, client_id: src.client_id, project_id: src.project_id, quote_id: src.quote_id,
    invoice_number: number, type: 'avoir', status: 'brouillon', credited_invoice_id: src.id,
    issue_date: new Date().toISOString().split('T')[0],
    subtotal_ht: r2(-src.subtotal_ht), total_vat: r2(-src.total_vat), total_ttc: r2(-src.total_ttc),
    deposit_already_paid: 0, amount_due: r2(-src.total_ttc),
    legal_mentions: `Avoir sur facture ${src.invoice_number}.`,
  }).select().single()
  if (error || !avoir) return NextResponse.json({ error: 'Erreur création avoir' }, { status: 500 })

  const lines = ((src.invoice_lines as LineRow[]) || []).map((l, i) => ({
    invoice_id: avoir.id, designation: l.designation, description: l.description,
    quantity: l.quantity, unit: l.unit, unit_price_ht: r2(-l.unit_price_ht),
    vat_rate: l.vat_rate, discount_percent: l.discount_percent || 0,
    total_ht: r2(-l.total_ht), sort_order: i,
  }))
  if (lines.length) await supabase.from('invoice_lines').insert(lines)

  return NextResponse.json({ invoiceId: avoir.id })
}
