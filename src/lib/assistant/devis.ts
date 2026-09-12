// Composition et enregistrement d'un devis/facture DEPUIS l'assistant.
// L'assistant construit un brouillon éditable (lignes), l'utilisateur ajuste à la
// main ou demande à l'IA, puis enregistre (et envoie) sans quitter l'assistant.
//
// - composeLines : génère OU modifie la liste de lignes (IA), ancrée sur le métier
//   et la base de prix réelle de l'artisan.
// - saveDevisDraft : persiste le devis (quotes/quote_lines) ou la facture
//   (invoices/invoice_lines), fait avancer la fiche client, renvoie l'URL.

import type { SupabaseClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { tradeLabel } from '@/lib/trades'
import { nextInvoiceNumber } from '@/lib/invoice-number'
import { phasesBefore } from '@/lib/clients'
import { UNITS, draftTotals, lineTotalHT, normalizeLines, type DraftKind, type DraftLine, type Unit, type DevisDraft } from '@/lib/assistant/devis-shared'

// Re-export des primitives isomorphes pour les appelants serveur (tools.ts, routes).
export { UNITS, draftTotals, lineTotalHT, normalizeLines }
export type { DraftKind, DraftLine, Unit, DevisDraft }

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── Résolution client ──────────────────────────────────────────────────────
export async function findClientsByName(supabase: SupabaseClient, userId: string, name: string) {
  const like = `%${name.trim()}%`
  const { data } = await supabase.from('clients')
    .select('id, first_name, last_name, company_name, type')
    .eq('user_id', userId)
    .or(`company_name.ilike.${like},last_name.ilike.${like},first_name.ilike.${like}`)
    .limit(6)
  return (data || []).map(c => ({ id: c.id as string, name: clientLabel(c) }))
}
export function clientLabel(c: { company_name?: string | null; first_name?: string | null; last_name?: string | null }) {
  return c.company_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Client'
}

// ─── Contexte entreprise (métier + base de prix) ────────────────────────────
async function companyContext(supabase: SupabaseClient, userId: string) {
  const { data: company } = await supabase.from('companies')
    .select('trade, secondary_trades, default_vat_rate, legal_mentions')
    .eq('user_id', userId).maybeSingle()
  const metiers = [company?.trade, ...(Array.isArray(company?.secondary_trades) ? company!.secondary_trades : [])]
    .map(t => tradeLabel(t)).filter(Boolean)
  const metierLabel = metiers.length ? metiers.join(', ') : 'artisan du bâtiment (tous corps d’état)'
  const vat = Number(company?.default_vat_rate) || 10

  const { data: cats } = await supabase.from('price_categories')
    .select('name, price_items(name, unit, unit_price_ht, is_active)').eq('user_id', userId)
  const priceLines: string[] = []
  for (const c of cats || []) {
    const items = (c.price_items as { name: string; unit: string; unit_price_ht: number; is_active: boolean }[]) || []
    for (const it of items.filter(i => i.is_active)) priceLines.push(`${c.name} > ${it.name} | ${it.unit} | ${it.unit_price_ht}€ HT`)
  }
  const baseDePrix = priceLines.length ? priceLines.slice(0, 400).join('\n') : '(aucune base de prix — estime des prix de marché réalistes)'
  return { metierLabel, vat, baseDePrix, legalMentions: (company?.legal_mentions as string) || null }
}

// ─── Génération / modification des lignes par l'IA ──────────────────────────
export async function composeLines(
  supabase: SupabaseClient, userId: string,
  opts: { kind: DraftKind; instruction: string; lines?: DraftLine[] },
): Promise<{ title: string; lines: DraftLine[] }> {
  const instruction = opts.instruction.trim()
  const { metierLabel, vat, baseDePrix } = await companyContext(supabase, userId)
  const docLabel = opts.kind === 'facture' ? 'une facture' : 'un devis'
  const editing = Array.isArray(opts.lines) && opts.lines.length > 0

  const prompt = editing
    ? `Tu es un métreur-chiffreur expert du bâtiment (métier : ${metierLabel}). Tu maintiens ${docLabel} pour un artisan.

LIGNES ACTUELLES (JSON) :
${JSON.stringify(opts.lines, null, 0)}

BASE DE PRIX DE L'ARTISAN (prioritaire) :
${baseDePrix}

DEMANDE DE MODIFICATION (dictée ou tapée) :
"${instruction}"

Applique la demande (ajouter, supprimer, modifier des lignes, ajuster quantités/prix). Renvoie la liste COMPLÈTE et à jour des lignes (pas seulement les changements). Garde les lignes non concernées telles quelles.

Retourne UNIQUEMENT ce JSON (sans texte autour) :
\`\`\`json
{ "title": "Objet court", "lignes": [ { "category": "", "designation": "", "description": "", "quantity": 0, "unit": "m2", "unit_price_ht": 0, "vat_rate": ${vat} } ] }
\`\`\`
RÈGLES : "unit" ∈ {m2, ml, u, forfait, h, j, piece} ; "vat_rate" ∈ {5.5, 10, 20} ; nombres purs (pas de €). N'invente pas de dimensions : quantité inconnue = 1.`
    : `Tu es un métreur-chiffreur expert du bâtiment qui prépare ${docLabel} pour un artisan dont le métier est : ${metierLabel}.

DEMANDE DE L'ARTISAN (dictée ou tapée, peut être approximative) :
"${instruction}"

BASE DE PRIX DE L'ARTISAN (utilise EN PRIORITÉ ces prix ; sinon estime un prix de marché réaliste) :
${baseDePrix}

Découpe les travaux en prestations concrètes et vendables, avec des quantités réalistes (calcule les métrés si des dimensions sont données, +~10% de perte au m²) et un prix unitaire HT par ligne. Reste dans le périmètre du métier.

Retourne UNIQUEMENT ce JSON (sans texte autour) :
\`\`\`json
{ "title": "Objet court (ex: Rénovation salle de bain)", "lignes": [ { "category": "Carrelage", "designation": "Pose carrelage sol", "description": "", "quantity": 0, "unit": "m2", "unit_price_ht": 0, "vat_rate": ${vat} } ] }
\`\`\`
RÈGLES : "unit" ∈ {m2, ml, u, forfait, h, j, piece} ; "vat_rate" ∈ {5.5, 10, 20} ; nombres purs (pas de €). N'invente pas de dimensions : quantité inconnue = 1.`

  const message = await anthropic.messages.create({
    // Sonnet 4.6 : pas de bloc « thinking » en tête (contrairement à Sonnet 5), et
    // modèle déjà éprouvé par /api/devis/generer pour ce chiffrage. Plus rapide ici.
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
  })
  // On concatène TOUS les blocs texte (robuste si un bloc thinking précède le texte).
  const rawText = message.content.map(b => (b.type === 'text' ? b.text : '')).join('\n')
  const jsonMatch = rawText.match(/```json\n?([\s\S]*?)\n?```/) || rawText.match(/(\{[\s\S]*\})/)
  if (!jsonMatch) throw new Error('Réponse IA illisible')
  let parsed: { title?: unknown; lignes?: unknown }
  try { parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]) } catch { throw new Error('Réponse IA invalide') }

  const lines = normalizeLines(parsed?.lignes, vat)
  if (!lines.length) throw new Error('Aucune prestation générée')
  const title = typeof parsed?.title === 'string' ? parsed.title.slice(0, 140) : ''
  return { title, lines }
}

// ─── Numéro de devis « DEV-ANNÉE-NNN » (plus grand + 1) ─────────────────────
async function nextQuoteNumber(supabase: SupabaseClient, userId: string, date = new Date()): Promise<string> {
  const base = `DEV-${date.getFullYear()}-`
  const { data } = await supabase.from('quotes').select('quote_number').eq('user_id', userId).like('quote_number', `${base}%`)
  let max = 0
  for (const row of (data as { quote_number: string }[] | null) || []) {
    const n = Number(row.quote_number.slice(base.length))
    if (Number.isInteger(n) && n > max) max = n
  }
  return `${base}${String(max + 1).padStart(3, '0')}`
}

// ─── Enregistrement ─────────────────────────────────────────────────────────
export async function saveDevisDraft(
  supabase: SupabaseClient, userId: string,
  draft: { kind: DraftKind; clientId: string; title: string; lines: DraftLine[]; validDays?: number; dueDays?: number; depositPercent?: number | null },
): Promise<{ id: string; number: string; href: string }> {
  const lines = draft.lines.filter(l => l.designation.trim())
  if (!draft.clientId) throw new Error('Client manquant')
  if (!lines.length) throw new Error('Aucune prestation')
  const { subtotalHT, totalVAT, totalTTC } = draftTotals(lines)
  const { legalMentions } = await companyContext(supabase, userId)
  const defaultMentions = legalMentions || 'TVA à taux réduit — Article 279-0 bis du CGI (travaux de rénovation)'

  if (draft.kind === 'facture') {
    const dueDate = new Date(); dueDate.setDate(dueDate.getDate() + (draft.dueDays || 30))
    let inv: { id: string; invoice_number: string } | null = null
    let lastErr: { code?: string } | null = null
    for (let attempt = 0; attempt < 4; attempt++) {
      const number = await nextInvoiceNumber(supabase, userId, 'FAC')
      const { data, error } = await supabase.from('invoices').insert({
        user_id: userId, client_id: draft.clientId, invoice_number: number, type: 'complete', status: 'brouillon',
        issue_date: new Date().toISOString().split('T')[0], due_date: dueDate.toISOString().split('T')[0],
        subtotal_ht: subtotalHT, total_vat: totalVAT, total_ttc: totalTTC,
        deposit_already_paid: 0, amount_due: totalTTC, legal_mentions: defaultMentions,
      }).select('id, invoice_number').single()
      if (!error && data) { inv = data as { id: string; invoice_number: string }; break }
      lastErr = error
      if (error?.code !== '23505') break
    }
    if (!inv) throw new Error(lastErr?.code === '23505' ? 'Numéro de facture déjà utilisé' : 'Erreur création facture')
    await supabase.from('invoice_lines').insert(lines.map((l, i) => ({
      invoice_id: inv!.id, designation: l.designation, description: l.description || null, quantity: l.quantity,
      unit: l.unit, unit_price_ht: l.unit_price_ht, vat_rate: l.vat_rate, discount_percent: l.discount_percent || 0,
      total_ht: lineTotalHT(l), sort_order: i,
    })))
    await supabase.from('clients').update({ status: 'facture_a_envoyer' }).eq('id', draft.clientId).in('status', phasesBefore('facture_a_envoyer'))
    return { id: inv.id, number: inv.invoice_number, href: `/factures/${inv.id}` }
  }

  // Devis
  const vd = draft.validDays || 30
  const validUntil = new Date(); validUntil.setDate(validUntil.getDate() + vd)
  const depositAmount = draft.depositPercent ? totalTTC * draft.depositPercent / 100 : null
  const number = await nextQuoteNumber(supabase, userId)
  const { data: quote, error } = await supabase.from('quotes').insert({
    user_id: userId, quote_number: number, client_id: draft.clientId, title: draft.title || '', description: '',
    status: 'pret', valid_until: validUntil.toISOString().split('T')[0],
    subtotal_ht: subtotalHT, total_vat: totalVAT, total_ttc: totalTTC,
    deposit_percent: draft.depositPercent ?? null, deposit_amount: depositAmount,
    notes: '', internal_notes: '', legal_mentions: defaultMentions,
  }).select('id, quote_number').single()
  if (error || !quote) throw new Error('Erreur création devis')
  await supabase.from('quote_lines').insert(lines.map((l, i) => ({
    quote_id: quote.id, category: l.category || null, designation: l.designation, description: l.description || null,
    quantity: l.quantity, unit: l.unit, unit_price_ht: l.unit_price_ht, vat_rate: l.vat_rate,
    discount_percent: l.discount_percent || 0, total_ht: lineTotalHT(l), sort_order: i, needs_verification: true, is_option: l.is_option || false,
  })))
  await supabase.from('clients').update({ status: 'devis_a_faire' }).eq('id', draft.clientId).in('status', ['nouveau', 'infos_a_recuperer'])
  return { id: quote.id as string, number: quote.quote_number as string, href: `/devis/${quote.id}` }
}
