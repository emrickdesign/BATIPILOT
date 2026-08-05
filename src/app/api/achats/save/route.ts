import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { isSupplierDocType } from '@/lib/achats'
import type { SupplierDocSource } from '@/types'

type LineIn = {
  designation?: unknown; quantity?: unknown; unit?: unknown
  unit_price_ht?: unknown; total_ht?: unknown; quality?: unknown; reference?: unknown
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s ? s : null
}
const isSource = (v: unknown): v is SupplierDocSource => v === 'admin' || v === 'terrain' || v === 'email'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })

    const docType = body.doc_type
    if (!isSupplierDocType(docType)) return NextResponse.json({ error: 'Type de document invalide' }, { status: 400 })
    const source: SupplierDocSource = isSource(body.source) ? body.source : 'admin'

    const supplier = str(body.supplier)
    const docNumber = str(body.doc_number)
    const projectId = str(body.project_id)

    // Vérifie la propriété du chantier (défense en profondeur, en plus de la RLS).
    if (projectId) {
      const { data: proj } = await supabase.from('projects').select('id').eq('id', projectId).eq('user_id', user.id).maybeSingle()
      if (!proj) return NextResponse.json({ error: 'Chantier introuvable' }, { status: 400 })
    }

    // Vérifie que le salarié (terrain) appartient bien à l'admin connecté.
    let employeeId = str(body.employee_id)
    if (employeeId) {
      const { data: emp } = await supabase.from('employees').select('id').eq('id', employeeId).eq('user_id', user.id).maybeSingle()
      if (!emp) employeeId = null
    }

    // ── Anti-doublon : même fournisseur + même numéro + même type ──
    if (supplier && docNumber) {
      const { data: existing } = await supabase
        .from('supplier_documents')
        .select('id')
        .eq('user_id', user.id)
        .eq('doc_type', docType)
        .ilike('supplier', supplier)
        .eq('doc_number', docNumber)
        .maybeSingle()
      if (existing) {
        return NextResponse.json({ success: true, duplicate: true, id: existing.id })
      }
    }

    const totalHt = num(body.total_ht)
    const totalTtc = num(body.total_ttc)
    const vatAmount = num(body.vat_amount)
    const docDate = str(body.doc_date)

    // ── Facture fournisseur → crée une dépense (la facture, c'est LA sortie d'argent) ──
    let expenseId: string | null = null
    if (docType === 'facture') {
      const ttc = totalTtc ?? (totalHt !== null && vatAmount !== null ? totalHt + vatAmount : totalHt) ?? 0
      const ht = totalHt ?? (totalTtc !== null ? totalTtc / 1.2 : 0)
      const { data: exp, error: expErr } = await supabase
        .from('expenses')
        .insert({
          user_id: user.id,
          project_id: projectId,
          supplier,
          expense_date: docDate,
          amount_ttc: ttc,
          amount_ht: ht,
          vat_amount: vatAmount ?? (ttc && ht ? ttc - ht : 0),
          category: 'Matériaux',
          ticket_number: docNumber,
          storage_path: str(body.storage_path),
          status: 'a_verifier',
          source: 'ticket',
          employee_id: employeeId,
          notes: 'Facture fournisseur (Achats)',
        })
        .select('id')
        .single()
      if (expErr) { console.error('expense insert error:', expErr); return NextResponse.json({ error: 'Enregistrement de la dépense impossible' }, { status: 500 }) }
      expenseId = exp.id
    }

    // ── Document fournisseur ──
    const { data: doc, error: docErr } = await supabase
      .from('supplier_documents')
      .insert({
        user_id: user.id,
        project_id: projectId,
        doc_type: docType,
        supplier,
        doc_number: docNumber,
        doc_date: docDate,
        total_ht: totalHt,
        total_ttc: totalTtc,
        vat_amount: vatAmount,
        storage_path: str(body.storage_path),
        consultation_label: str(body.consultation_label),
        source,
        employee_id: employeeId,
        source_email_id: str(body.source_email_id),
        expense_id: expenseId,
        status: 'a_verifier',
        notes: str(body.notes),
      })
      .select('id')
      .single()

    if (docErr) {
      // Doublon détecté par l'index unique (course entre deux enregistrements) → non bloquant.
      if (docErr.code === '23505') return NextResponse.json({ success: true, duplicate: true })
      console.error('supplier_documents insert error:', docErr)
      return NextResponse.json({ error: 'Enregistrement du document impossible' }, { status: 500 })
    }

    // ── Lignes ──
    const rawLines: LineIn[] = Array.isArray(body.lines) ? body.lines : []
    const lines = rawLines
      .map((l, i) => ({
        document_id: doc.id,
        user_id: user.id,
        designation: str(l.designation),
        quantity: num(l.quantity),
        unit: str(l.unit),
        unit_price_ht: num(l.unit_price_ht),
        total_ht: num(l.total_ht),
        quality: str(l.quality),
        reference: str(l.reference),
        sort_order: i,
      }))
      .filter(l => l.designation)
    if (lines.length) {
      const { error: linesErr } = await supabase.from('supplier_document_lines').insert(lines)
      if (linesErr) console.error('supplier_document_lines insert error:', linesErr)
    }

    return NextResponse.json({ success: true, id: doc.id, expense_id: expenseId })
  } catch (err: unknown) {
    console.error('Achats save error:', err)
    const msg = err instanceof Error ? err.message : 'Erreur serveur'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
