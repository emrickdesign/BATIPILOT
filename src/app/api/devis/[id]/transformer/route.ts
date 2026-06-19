import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

  const { data: quote } = await supabase
    .from('quotes')
    .select('*, quote_lines(*)')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!quote) return NextResponse.json({ error: 'Devis introuvable' }, { status: 404 })
  if (quote.status !== 'accepte') return NextResponse.json({ error: 'Le devis doit être accepté' }, { status: 400 })

  const { count } = await supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('user_id', user.id)
  const invoiceNumber = `FAC-${new Date().getFullYear()}-${String((count || 0) + 1).padStart(3, '0')}`

  const dueDate = new Date()
  dueDate.setDate(dueDate.getDate() + 30)

  const amountDue = quote.total_ttc - (quote.deposit_amount || 0)

  const { data: invoice } = await supabase.from('invoices').insert({
    user_id: user.id,
    client_id: quote.client_id,
    project_id: quote.project_id,
    quote_id: quote.id,
    invoice_number: invoiceNumber,
    type: 'complete',
    status: 'brouillon',
    issue_date: new Date().toISOString().split('T')[0],
    due_date: dueDate.toISOString().split('T')[0],
    subtotal_ht: quote.subtotal_ht,
    total_vat: quote.total_vat,
    total_ttc: quote.total_ttc,
    deposit_already_paid: quote.deposit_amount || 0,
    amount_due: amountDue,
    legal_mentions: quote.legal_mentions,
  }).select().single()

  if (!invoice) return NextResponse.json({ error: 'Erreur création facture' }, { status: 500 })

  const lines = (quote.quote_lines as any[]).map((l: any, i: number) => ({
    invoice_id: invoice.id,
    quote_line_id: l.id,
    designation: l.designation,
    description: l.description,
    quantity: l.quantity,
    unit: l.unit,
    unit_price_ht: l.unit_price_ht,
    vat_rate: l.vat_rate,
    discount_percent: l.discount_percent,
    total_ht: l.total_ht,
    sort_order: i,
  }))

  await supabase.from('invoice_lines').insert(lines)
  await supabase.from('quotes').update({ status: 'transforme' }).eq('id', id)

  return NextResponse.json({ invoiceId: invoice.id })
}
