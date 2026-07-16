import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import JSZip from 'jszip'
import { z } from 'zod'
import { getValidGmailToken } from '@/lib/gmail-token'
import { sendGmailWithAttachment } from '@/lib/gmail-send'
import { loadMonths } from '@/app/comptable/data'
import { depensesCsv, facturesCsv, tvaCsv, tvaTotals, piecesOf } from '@/app/comptable/shared'

const bodySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  email: z.string().trim().email().optional(),
})

const MAX_ATTACHMENT = 20 * 1024 * 1024 // Gmail plafonne à 25 Mo, on garde de la marge
const fmt = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n || 0)

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

    const parsed = bodySchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })
    const { month } = parsed.data

    const [{ data: company }, gmailToken] = await Promise.all([
      supabase.from('companies').select('trade_name, accountant_email').eq('user_id', user.id).maybeSingle(),
      getValidGmailToken(supabase, user.id),
    ])

    // Destinataire : celui fourni (et mémorisé), sinon celui des réglages
    const to = parsed.data.email || company?.accountant_email || ''
    if (!to) return NextResponse.json({ error: "Renseignez l'email de votre comptable" }, { status: 400 })
    if (!gmailToken) return NextResponse.json({ error: 'Gmail non connecté (Paramètres → Gmail)' }, { status: 400 })
    if (parsed.data.email && parsed.data.email !== company?.accountant_email) {
      await supabase.from('companies').update({ accountant_email: parsed.data.email }).eq('user_id', user.id)
    }

    const months = await loadMonths(supabase, user.id)
    const m = months.find(x => x.key === month)
    if (!m) return NextResponse.json({ error: 'Aucune donnée pour ce mois' }, { status: 404 })

    // Le dossier : les 3 tableurs + tous les justificatifs
    const zip = new JSZip()
    zip.file(`depenses-${month}.csv`, '﻿' + depensesCsv(m.expenses, m.subInvoices))
    zip.file(`factures-${month}.csv`, '﻿' + facturesCsv(m.invoices))
    zip.file(`recap-tva-${month}.csv`, '﻿' + tvaCsv(m.expenses, m.invoices, m.subInvoices))

    const pieces = piecesOf(month, m.expenses, m.subInvoices)
    let nbFiles = 0
    if (pieces.length) {
      const folder = zip.folder('justificatifs')!
      for (const p of pieces) {
        const { data: file } = await supabase.storage.from('documents').download(p.path)
        if (!file) continue
        folder.file(p.name, Buffer.from(await file.arrayBuffer()))
        nbFiles++
      }
    }

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
    if (zipBuffer.length > MAX_ATTACHMENT) {
      return NextResponse.json({
        error: `Dossier trop lourd pour un email (${(zipBuffer.length / 1024 / 1024).toFixed(1)} Mo). Téléchargez-le et envoyez-le via un lien.`,
      }, { status: 413 })
    }

    const { collectee, deductible, solde } = tvaTotals(m.expenses, m.invoices, m.subInvoices)
    const totalDepenses = m.expenses.reduce((t, e) => t + (Number(e.amount_ttc) || 0), 0)
      + m.subInvoices.reduce((t, i) => t + (Number(i.amount_ttc) || 0), 0)
    const manquants = m.expenses.filter(e => !e.storage_path).length + m.subInvoices.filter(i => !i.storage_path).length

    const htmlBody = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;font-size:14px;color:#222">
<p>Bonjour,</p>
<p>Voici le dossier comptable de <strong>${m.label}</strong> pour <strong>${company?.trade_name || ''}</strong>.</p>
<ul>
  <li><strong>${m.expenses.length + m.subInvoices.length}</strong> pièce(s) d'achat — total ${fmt(totalDepenses)} TTC</li>
  <li><strong>${m.invoices.length}</strong> facture(s) de vente</li>
  <li><strong>${nbFiles}</strong> justificatif(s) joint(s)</li>
</ul>
<p><strong>TVA :</strong> collectée ${fmt(collectee)} − déductible ${fmt(deductible)} = <strong>${solde >= 0 ? `${fmt(solde)} à payer` : `${fmt(Math.abs(solde))} de crédit`}</strong></p>
${manquants > 0 ? `<p style="color:#b45309">⚠ ${manquants} pièce(s) sans justificatif ce mois-ci.</p>` : ''}
<p>Le ZIP joint contient les tableurs (dépenses, factures, récap TVA) et le dossier des justificatifs.</p>
<p>Bien à vous,<br><strong>${company?.trade_name || ''}</strong></p>
</body></html>`

    const sent = await sendGmailWithAttachment({
      accessToken: gmailToken.accessToken,
      fromEmail: gmailToken.gmailEmail,
      to,
      subject: `Dossier comptable ${m.label} — ${company?.trade_name || ''}`,
      htmlBody,
      fileBuffer: zipBuffer,
      filename: `compta-${month}.zip`,
      mimeType: 'application/zip',
    })
    if (!sent.ok) {
      console.error('Gmail send error (compta):', sent.error)
      return NextResponse.json({ error: `Envoi Gmail refusé : ${(sent.error || '').slice(0, 200)}` }, { status: 502 })
    }

    // Marque les dépenses du mois comme transmises + trace l'envoi
    const ids = m.expenses.filter(e => e.status !== 'envoye_comptable').map(e => e.id)
    if (ids.length) await supabase.from('expenses').update({ status: 'envoye_comptable' }).in('id', ids)
    await supabase.from('accounting_sends').insert({
      user_id: user.id, month_key: month, to_email: to,
      nb_expenses: m.expenses.length + m.subInvoices.length, nb_invoices: m.invoices.length, nb_files: nbFiles,
    })

    return NextResponse.json({ success: true, to, nbFiles })
  } catch (err) {
    console.error('Envoi compta error:', err)
    return NextResponse.json({ error: (err as Error)?.message || 'Erreur serveur' }, { status: 500 })
  }
}
