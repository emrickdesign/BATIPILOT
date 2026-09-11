import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Prochain numéro d'une série « PRÉFIXE-ANNÉE-NNN » (ex. FAC-2026-045) = plus grand numéro
 * de la série + 1 : numérotation unique et continue par série et par année (obligation
 * légale, et une plateforme agréée refuse un numéro déjà utilisé).
 */
export async function nextInvoiceNumber(supabase: SupabaseClient, userId: string, prefix: 'FAC' | 'AV', date = new Date()): Promise<string> {
  const base = `${prefix}-${date.getFullYear()}-`
  const { data } = await supabase.from('invoices').select('invoice_number').eq('user_id', userId).like('invoice_number', `${base}%`)
  let max = 0
  for (const row of (data as { invoice_number: string }[] | null) || []) {
    const n = Number(row.invoice_number.slice(base.length))
    if (Number.isInteger(n) && n > max) max = n
  }
  return `${base}${String(max + 1).padStart(3, '0')}`
}

/**
 * Crée la facture avec le prochain numéro libre. L'index unique (user_id, invoice_number)
 * bloque les doublons : si deux créations se croisent, on reprend le numéro suivant.
 */
export async function insertWithNextNumber<R extends { error: { code?: string } | null }>(
  supabase: SupabaseClient, userId: string, prefix: 'FAC' | 'AV',
  insert: (invoiceNumber: string) => PromiseLike<R>,
): Promise<R> {
  let result = await insert(await nextInvoiceNumber(supabase, userId, prefix))
  for (let attempt = 1; attempt < 4 && result.error?.code === '23505'; attempt++) {
    result = await insert(await nextInvoiceNumber(supabase, userId, prefix))
  }
  return result
}
