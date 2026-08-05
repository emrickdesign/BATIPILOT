import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

type DbLine = { designation: string; quantity: number | null; unit: string | null; unit_price_ht: number | null }
type DocWithLines = { id: string; doc_type: string; supplier: string | null; supplier_document_lines: DbLine[] }

const n = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const round2 = (v: number) => Math.round(v * 100) / 100

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

    const body = await req.json().catch(() => null)
    const projectId = body && typeof body.project_id === 'string' ? body.project_id : null
    if (!projectId) return NextResponse.json({ error: 'Chantier manquant' }, { status: 400 })

    const { data: proj } = await supabase.from('projects').select('id').eq('id', projectId).eq('user_id', user.id).maybeSingle()
    if (!proj) return NextResponse.json({ error: 'Chantier introuvable' }, { status: 404 })

    const { data: docsRaw } = await supabase
      .from('supplier_documents')
      .select('id, doc_type, supplier, is_selected, supplier_document_lines(designation, quantity, unit, unit_price_ht)')
      .eq('user_id', user.id)
      .eq('project_id', projectId)

    const docs = (docsRaw || []) as (DocWithLines & { is_selected: boolean })[]
    const devisRef = docs.find(d => d.doc_type === 'devis' && d.is_selected)
    const factures = docs.filter(d => d.doc_type === 'facture')
    const bls = docs.filter(d => d.doc_type === 'bl')

    if (!devisRef) return NextResponse.json({ error: 'Aucun devis de référence choisi. Sélectionne d’abord le devis fournisseur retenu.' }, { status: 400 })
    if (!factures.length) return NextResponse.json({ error: 'Aucune facture fournisseur à rapprocher pour ce chantier.' }, { status: 400 })

    const tag = (arr: DbLine[]) => arr.map((l, i) => ({ i, d: l.designation, q: n(l.quantity), pu: n(l.unit_price_ht) }))
    const payload = {
      devis: tag(devisRef.supplier_document_lines || []),
      livraisons: bls.flatMap(b => (b.supplier_document_lines || [])).map((l, i) => ({ i, d: l.designation, q: n(l.quantity) })),
      facture: factures.flatMap(f => (f.supplier_document_lines || [])).map((l, i) => ({ i, d: l.designation, q: n(l.quantity), pu: n(l.unit_price_ht) })),
    }

    let message: Awaited<ReturnType<typeof anthropic.messages.create>>
    try {
      message = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages: [{ role: 'user', content: [{ type: 'text', text: buildPrompt(payload) }] }],
      })
    } catch (apiErr: unknown) {
      console.error('Anthropic API error (rapprochement):', apiErr)
      return NextResponse.json({ error: 'Analyse impossible pour le moment — réessayez.' }, { status: 502 })
    }

    const rawText = message.content[0]?.type === 'text' ? message.content[0].text : ''
    const jsonMatch = rawText.match(/```json\n?([\s\S]*?)\n?```/) || rawText.match(/(\{[\s\S]*\})/)
    let ai: { rows?: unknown[] } = {}
    try { if (jsonMatch) ai = JSON.parse(jsonMatch[1] || jsonMatch[0]) } catch { /* rien */ }

    // ── Recalcul déterministe des écarts (l'IA ne fait que l'alignement + l'écho des valeurs) ──
    type AiRow = { designation?: unknown; devis_pu?: unknown; devis_qty?: unknown; livre_qty?: unknown; facture_pu?: unknown; facture_qty?: unknown }
    const num = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : null }

    const rows = (Array.isArray(ai.rows) ? ai.rows : []).map((r0) => {
      const r = r0 as AiRow
      const devisPu = num(r.devis_pu)
      const facturePu = num(r.facture_pu)
      const factureQty = num(r.facture_qty)
      const livreQty = num(r.livre_qty)
      const devisQty = num(r.devis_qty)

      const ecartPu = devisPu !== null && facturePu !== null ? round2(facturePu - devisPu) : null
      const ecartPct = devisPu && facturePu !== null ? round2(((facturePu - devisPu) / devisPu) * 100) : null
      // Surcoût = écart de prix unitaire × quantité facturée (c'est ce qui est réellement payé en trop).
      const qtyForMoney = factureQty ?? livreQty ?? devisQty
      const ecartMontant = ecartPu !== null && qtyForMoney !== null ? round2(ecartPu * qtyForMoney) : null

      let flag: 'ok' | 'surfacture' | 'sous_facture' | 'facture_non_devise' | 'non_facture' | 'ecart_quantite' = 'ok'
      if (devisPu === null && facturePu !== null) flag = 'facture_non_devise'
      else if (facturePu === null && devisPu !== null) flag = 'non_facture'
      else if (ecartPu !== null && ecartPu > 0.001) flag = 'surfacture'
      else if (ecartPu !== null && ecartPu < -0.001) flag = 'sous_facture'
      if (flag === 'ok' && factureQty !== null && livreQty !== null && Math.abs(factureQty - livreQty) > 0.001) flag = 'ecart_quantite'

      return {
        designation: typeof r.designation === 'string' ? r.designation : '—',
        devis_pu: devisPu, devis_qty: devisQty,
        livre_qty: livreQty,
        facture_pu: facturePu, facture_qty: factureQty,
        ecart_pu: ecartPu, ecart_pct: ecartPct, ecart_montant: ecartMontant,
        flag,
      }
    })

    const totalSurcout = round2(rows.reduce((s, r) => s + (r.ecart_montant && r.ecart_montant > 0 ? r.ecart_montant : 0), 0))
    const totalEconomie = round2(rows.reduce((s, r) => s + (r.ecart_montant && r.ecart_montant < 0 ? r.ecart_montant : 0), 0))
    const anomalies = rows.filter(r => r.flag !== 'ok').length

    return NextResponse.json({
      success: true,
      supplier: devisRef.supplier,
      counts: { devis: 1, bl: bls.length, facture: factures.length },
      rows,
      summary: { total_surcout: totalSurcout, total_economie: totalEconomie, anomalies },
    })
  } catch (err: unknown) {
    console.error('Rapprochement error:', err)
    const msg = err instanceof Error ? err.message : 'Erreur serveur'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

function buildPrompt(payload: unknown): string {
  return `Tu rapproches, pour un artisan du bâtiment, les lignes de son DEVIS fournisseur de référence, de ses BONS DE LIVRAISON et de sa FACTURE fournisseur, afin de détecter les erreurs de facturation.

Les libellés ne sont JAMAIS identiques d'un document à l'autre (abréviations, marques, formats). Ton travail : regrouper les lignes qui désignent le MÊME matériau, même si le libellé diffère.

Données (q = quantité, pu = prix unitaire HT) :
${JSON.stringify(payload)}

Pour chaque matériau distinct, produis une ligne de rapprochement en RECOPIANT fidèlement les valeurs lues (n'invente aucun nombre ; mets null si absent) :
- designation : le libellé le plus clair
- devis_qty, devis_pu : depuis le devis de référence (null si le matériau n'y est pas)
- livre_qty : SOMME des quantités livrées (bons de livraison) pour ce matériau (null si aucun BL)
- facture_qty, facture_pu : depuis la facture (null si non facturé)

Inclus AUSSI les matériaux présents seulement sur la facture (facturés mais pas au devis) et ceux du devis non facturés. Ne fais AUCUN calcul d'écart : je m'en charge.

Retourne UNIQUEMENT ce JSON :
{ "rows": [ { "designation": "...", "devis_qty": nombre|null, "devis_pu": nombre|null, "livre_qty": nombre|null, "facture_qty": nombre|null, "facture_pu": nombre|null } ] }`
}
