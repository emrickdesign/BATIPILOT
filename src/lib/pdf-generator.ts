import PDFDocument from 'pdfkit'
import { getTemplateConfig, TemplateConfig } from './pdf-templates'

function hexToRgb(hex: string): [number, number, number] {
  const c = hex.replace(/^#/, '')
  return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)]
}

const fmt = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n || 0)
const fmtDate = (d: string | null | undefined) => d ? new Date(d).toLocaleDateString('fr-FR') : ''

// Font family resolution (pdfkit built-in fonts)
interface Fonts { reg: string; bold: string; italic: string }
function fonts(cfg: TemplateConfig): Fonts {
  return cfg.fontFamily === 'serif'
    ? { reg: 'Times-Roman', bold: 'Times-Bold', italic: 'Times-Italic' }
    : { reg: 'Helvetica', bold: 'Helvetica-Bold', italic: 'Helvetica-Oblique' }
}

// ─── BOX DRAWING ──────────────────────────────────────────────────────────────

function boxRect(doc: any, cfg: TemplateConfig, x: number, y: number, w: number, h: number) {
  return cfg.rounded ? doc.roundedRect(x, y, w, h, 8) : doc.rect(x, y, w, h)
}

function drawBox(doc: any, cfg: TemplateConfig, x: number, y: number, w: number, h: number) {
  if (cfg.boxStyle === 'dashed') {
    doc.save().dash(3, { space: 3 }); boxRect(doc, cfg, x, y, w, h).stroke('#cccccc'); doc.undash().restore()
  } else if (cfg.boxStyle === 'solid') {
    boxRect(doc, cfg, x, y, w, h).stroke('#d1d5db')
  } else if (cfg.boxStyle === 'filled') {
    boxRect(doc, cfg, x, y, w, h).fill(hexToRgb(cfg.secondaryBg))
  } else if (cfg.boxStyle === 'lines') {
    doc.moveTo(x, y).lineTo(x + w, y).strokeColor('#aaaaaa').lineWidth(0.8).stroke()
    doc.moveTo(x, y + h).lineTo(x + w, y + h).strokeColor('#aaaaaa').lineWidth(0.8).stroke()
  }
}

// ─── HEADER ────────────────────────────────────────────────────────────────────

function renderHeader(
  doc: any, cfg: TemplateConfig,
  docType: string, number: string, issueDate: string,
  secondDate: string | null, secondDateLabel: string, company: any
): number {
  const PW = doc.page.width
  const ML = cfg.margin
  const CW = PW - 2 * ML
  const P = hexToRgb(cfg.primaryColor)
  const F = fonts(cfg)
  const name = company?.trade_name || ''

  if (cfg.headerStyle === 'clean') {
    // Icon + name left (max 45% width) | ref/dates right | DEVIS below, centered
    const iconRound = cfg.rounded ? 8 : 5
    doc.roundedRect(ML, 30, 28, 28, iconRound).fill(P)
    doc.fillColor('white').fontSize(15).font(F.bold)
      .text((name || 'B')[0].toUpperCase(), ML, 35, { width: 28, align: 'center' })
    doc.fillColor('#111').fontSize(11).font(F.bold)
      .text(name.toUpperCase(), ML + 36, 34, { width: CW * 0.42, ellipsis: true })

    doc.fillColor('#111').fontSize(8.5).font(F.bold)
      .text(`Réf. ${number}`, 0, 32, { align: 'right', width: PW - ML })
    doc.fillColor('#666').fontSize(8).font(F.reg)
      .text(`Émis le ${fmtDate(issueDate)}`, 0, 45, { align: 'right', width: PW - ML })
    if (secondDate) {
      doc.fillColor(P).fontSize(8).font(F.bold)
        .text(`${secondDateLabel} ${fmtDate(secondDate)}`, 0, 57, { align: 'right', width: PW - ML })
    }
    // Title centered, lowered to clear the top row
    doc.fillColor('#111').fontSize(cfg.titleFontSize).font(F.bold)
      .text(docType, 0, 72, { align: 'center', width: PW })
    const y = 72 + cfg.titleFontSize + 10
    doc.moveTo(ML, y).lineTo(ML + CW, y).strokeColor('#e5e7eb').lineWidth(0.5).stroke()
    return y + 16

  } else if (cfg.headerStyle === 'bar') {
    const H = hexToRgb(cfg.headerBg)
    if (cfg.rounded) doc.roundedRect(ML, 24, CW, 50, 8).fill(H)
    else doc.rect(0, 0, PW, 65).fill(H)
    const ox = cfg.rounded ? ML + 14 : ML
    const oy = cfg.rounded ? 32 : 14
    doc.fillColor(cfg.headerTextColor).fontSize(14).font(F.bold).text(name, ox, oy)
    const subParts = [company?.address, company?.phone, company?.email].filter(Boolean)
    if (subParts.length) {
      doc.fontSize(7.5).font(F.reg).text(subParts.join('  ·  '), ox, oy + 17, { width: CW * 0.6 })
    }
    const rx = cfg.rounded ? ML + CW - 14 : PW - ML - 8
    doc.fontSize(cfg.titleFontSize).font(F.bold).text(docType, 0, oy - 4, { align: 'right', width: rx })
    doc.fontSize(9).font(F.reg).text(number, 0, oy + 16, { align: 'right', width: rx })
    if (secondDate) doc.fontSize(8).text(`${secondDateLabel} ${fmtDate(secondDate)}`, 0, oy + 30, { align: 'right', width: rx })
    doc.fillColor('#222')
    return (cfg.rounded ? 74 : 65) + 16

  } else if (cfg.headerStyle === 'dark') {
    const H = hexToRgb(cfg.headerBg)
    if (cfg.rounded) doc.roundedRect(ML, 22, CW, 56, 10).fill(H)
    else doc.rect(0, 0, PW, 76).fill(H)
    const baseY = cfg.rounded ? 30 : 22
    const ox = cfg.rounded ? ML + 14 : ML
    doc.roundedRect(ox, baseY, 30, 30, cfg.rounded ? 8 : 4).fill(P)
    doc.fillColor(cfg.headerBg).fontSize(15).font(F.bold)
      .text((name || 'B')[0].toUpperCase(), ox, baseY + 6, { width: 30, align: 'center' })
    doc.fillColor('white').fontSize(14).font(F.bold).text(name, ox + 40, baseY + 3)
    doc.fillColor('#999').fontSize(7.5).font(F.reg)
      .text([company?.address, company?.phone].filter(Boolean).join('  ·  '), ox + 40, baseY + 21, { width: CW * 0.45 })
    const rx = cfg.rounded ? ML + CW - 14 : PW - ML - 10
    doc.fillColor(P).fontSize(cfg.titleFontSize).font(F.bold).text(docType, 0, baseY, { align: 'right', width: rx })
    doc.fillColor('#cccccc').fontSize(8).font(F.reg).text(`Réf. ${number}`, 0, baseY + 22, { align: 'right', width: rx })
    if (secondDate) doc.fillColor(P).fontSize(7.5).text(`${secondDateLabel} ${fmtDate(secondDate)}`, 0, baseY + 33, { align: 'right', width: rx })
    doc.fillColor('#222')
    return (cfg.rounded ? 78 : 76) + 14

  } else {
    // minimal — serif title, thin rule
    doc.fillColor('#111').fontSize(11).font(F.bold).text(name.toUpperCase(), ML, 40, { characterSpacing: 1 })
    doc.fillColor('#111').fontSize(cfg.titleFontSize).font(F.bold).text(docType, 0, 34, { align: 'right', width: PW - ML })
    const meta = [`Réf. ${number}`, `Émis le ${fmtDate(issueDate)}`, secondDate ? `${secondDateLabel} ${fmtDate(secondDate)}` : ''].filter(Boolean).join('   ·   ')
    doc.fillColor('#666').fontSize(8).font(F.reg).text(meta, ML, 60)
    const y = 74
    doc.moveTo(ML, y).lineTo(ML + CW, y).strokeColor('#111').lineWidth(1).stroke()
    return y + 18
  }
}

// ─── PARTY BLOCKS ──────────────────────────────────────────────────────────────

function partyContent(doc: any, cfg: TemplateConfig, label: string, name: string, infoLines: string[], x: number, w: number, y: number) {
  const P = hexToRgb(cfg.primaryColor)
  const F = fonts(cfg)
  doc.fillColor(P).fontSize(7).font(F.bold).text(label, x, y + 10, { characterSpacing: 0.5 })
  doc.fillColor('#111').fontSize(10).font(F.bold).text(name, x, y + 22, { width: w - 8 })
  let iy = y + 36
  doc.fontSize(8).font(F.reg)
  infoLines.forEach(line => {
    doc.fillColor(line.startsWith('SIRET') ? '#aaa' : '#555').text(line, x, iy, { width: w - 8 })
    iy += doc.heightOfString(line, { width: w - 8 }) + 3
  })
}

function renderParties(doc: any, cfg: TemplateConfig, company: any, client: any, clientName: string, startY: number): number {
  const ML = cfg.margin
  const CW = doc.page.width - 2 * ML
  const F = fonts(cfg)

  const prestatLines = [
    company?.address || '',
    company?.siret ? `SIRET : ${company.siret}` : '',
    [company?.email, company?.phone].filter(Boolean).join(' · '),
  ].filter(Boolean)
  const clientLines = [
    client?.phone || '',
    client?.billing_address || '',
    client?.email || '',
    client?.siret ? `SIRET : ${client.siret}` : '',
  ].filter(Boolean)

  doc.fontSize(8).font(F.reg)

  if (cfg.partyLayout === 'stacked') {
    // Two full-width bands stacked vertically
    const measure = (lines: string[]) => {
      let h = 0; lines.forEach(l => { h += doc.heightOfString(l, { width: CW - 24 }) + 3 }); return h
    }
    const h1 = Math.max(58, measure(prestatLines) + 40)
    const h2 = Math.max(58, measure(clientLines) + 40)
    drawBox(doc, cfg, ML, startY, CW, h1)
    partyContent(doc, cfg, 'PRESTATAIRE', company?.trade_name || '', prestatLines, ML + 12, CW - 12, startY)
    const y2 = startY + h1 + 10
    drawBox(doc, cfg, ML, y2, CW, h2)
    partyContent(doc, cfg, 'CLIENT', clientName, clientLines, ML + 12, CW - 12, y2)
    return y2 + h2 + cfg.sectionGap
  }

  if (cfg.partyLayout === 'banner') {
    // Single full-width band, split in two with a divider
    const half = CW / 2
    const measure = (lines: string[]) => {
      let h = 0; lines.forEach(l => { h += doc.heightOfString(l, { width: half - 24 }) + 3 }); return h
    }
    const bh = Math.max(78, Math.max(measure(prestatLines), measure(clientLines)) + 42)
    drawBox(doc, cfg, ML, startY, CW, bh)
    partyContent(doc, cfg, 'PRESTATAIRE', company?.trade_name || '', prestatLines, ML + 16, half - 16, startY)
    // divider
    doc.moveTo(ML + half, startY + 12).lineTo(ML + half, startY + bh - 12).strokeColor('#d8cba0').lineWidth(0.7).stroke()
    partyContent(doc, cfg, 'CLIENT', clientName, clientLines, ML + half + 16, half - 24, startY)
    return startY + bh + cfg.sectionGap
  }

  // two-boxes (default)
  const bW = (CW - 12) / 2
  const measure = (lines: string[]) => {
    let h = 0; lines.forEach(l => { h += doc.heightOfString(l, { width: bW - 18 }) + 3 }); return h
  }
  const boxH = Math.max(85, Math.max(measure(prestatLines), measure(clientLines)) + 44)
  drawBox(doc, cfg, ML, startY, bW, boxH)
  drawBox(doc, cfg, ML + bW + 12, startY, bW, boxH)
  partyContent(doc, cfg, 'PRESTATAIRE', company?.trade_name || '', prestatLines, ML + 10, bW, startY)
  partyContent(doc, cfg, 'CLIENT', clientName, clientLines, ML + bW + 22, bW, startY)
  return startY + boxH + cfg.sectionGap
}

// ─── PRESTATION TABLE ──────────────────────────────────────────────────────────

function renderTable(doc: any, cfg: TemplateConfig, lines: any[], startY: number): number {
  const ML = cfg.margin
  const CW = doc.page.width - 2 * ML
  const P = hexToRgb(cfg.primaryColor)
  const TH = hexToRgb(cfg.tableHeaderBg)
  const F = fonts(cfg)
  let y = startY

  if (cfg.tableColumnsStyle === 'simple') {
    if (cfg.rounded) doc.roundedRect(ML, y, CW, 22, 6).fill(TH)
    else doc.rect(ML, y, CW, 22).fill(TH)
    doc.fillColor(cfg.tableHeaderTextColor).fontSize(8).font(F.bold)
      .text('PRESTATION', ML + 10, y + 7).text('PRIX', ML, y + 7, { align: 'right', width: CW - 10 })
    y += 22
    const desigW = Math.floor(CW * 0.65)
    lines.forEach((l, i) => {
      if (i > 0) doc.moveTo(ML, y).lineTo(ML + CW, y).strokeColor('#e5e7eb').lineWidth(0.5).stroke()
      doc.fontSize(10).font(F.bold)
      const dH = doc.heightOfString(l.designation || '', { width: desigW })
      doc.fontSize(8).font(F.reg)
      const descH = l.description ? doc.heightOfString(l.description, { width: desigW }) + 4 : 0
      const rowH = Math.max(44, dH + descH + 22)
      doc.fillColor('#111').fontSize(10).font(F.bold).text(l.designation || '', ML + 10, y + 10, { width: desigW })
      if (l.description) doc.fillColor('#888').fontSize(8).font(F.reg).text(l.description, ML + 10, y + 10 + dH + 4, { width: desigW })
      const total = l.total_ht ?? (l.quantity * l.unit_price_ht)
      doc.fillColor(P).fontSize(11).font(F.bold).text(fmt(total), ML, y + 10, { align: 'right', width: CW - 10 })
      y += rowH
    })
    return y
  }

  // Full columns
  const c = {
    desig: ML + 4,
    qty: ML + Math.floor(CW * 0.46),
    pu: ML + Math.floor(CW * 0.56),
    tva: ML + Math.floor(CW * 0.73),
  }
  const whiteHeader = cfg.tableHeaderBg === 'white' || cfg.tableHeaderBg === '#ffffff'
  if (whiteHeader) {
    doc.moveTo(ML, y).lineTo(ML + CW, y).strokeColor('#111').lineWidth(0.8).stroke()
    doc.fillColor(cfg.tableHeaderTextColor).fontSize(7.5).font(F.bold)
      .text('DÉSIGNATION', c.desig, y + 5).text('QTÉ', c.qty, y + 5).text('P.U. HT', c.pu, y + 5).text('TVA', c.tva, y + 5)
    doc.text('TOTAL HT', ML, y + 5, { align: 'right', width: CW - 4 })
    y += 19
    doc.moveTo(ML, y).lineTo(ML + CW, y).strokeColor('#111').lineWidth(0.8).stroke()
    y += 2
  } else {
    if (cfg.rounded) doc.roundedRect(ML, y, CW, 22, 6).fill(TH)
    else doc.rect(ML, y, CW, 22).fill(TH)
    doc.fillColor(cfg.tableHeaderTextColor).fontSize(7.5).font(F.bold)
      .text('DÉSIGNATION', c.desig, y + 7).text('QTÉ', c.qty, y + 7).text('P.U. HT', c.pu, y + 7).text('TVA', c.tva, y + 7)
    doc.text('TOTAL HT', ML, y + 7, { align: 'right', width: CW - 4 })
    y += 22
  }

  const desigW = c.qty - c.desig - 8
  lines.forEach((l, i) => {
    const isStripe = cfg.stripeRows && i % 2 === 1
    doc.fontSize(9).font(F.bold)
    const dH = doc.heightOfString(l.designation || '', { width: desigW })
    doc.fontSize(8).font(F.reg)
    const descH = l.description ? doc.heightOfString(l.description, { width: desigW }) + 3 : 0
    const rowH = Math.max(28, dH + descH + 16)
    if (isStripe) doc.rect(ML, y, CW, rowH).fill(hexToRgb(cfg.secondaryBg))
    else if (i > 0) doc.moveTo(ML, y).lineTo(ML + CW, y).strokeColor('#e9ecef').lineWidth(0.3).stroke()
    doc.fillColor('#111').fontSize(9).font(F.bold).text(l.designation || '', c.desig, y + 7, { width: desigW })
    if (l.description) doc.fillColor('#888').fontSize(7.5).font(F.reg).text(l.description, c.desig, y + 7 + dH + 2, { width: desigW })
    doc.fillColor('#333').fontSize(8.5).font(F.reg)
      .text(String(l.quantity || 0), c.qty, y + 7).text(fmt(l.unit_price_ht || 0), c.pu, y + 7).text(`${l.vat_rate || 0}%`, c.tva, y + 7)
    doc.fillColor('#111').font(F.bold).text(fmt(l.total_ht ?? (l.quantity * l.unit_price_ht)), ML, y + 7, { align: 'right', width: CW - 4 })
    y += rowH
  })
  return y
}

// ─── TOTALS ────────────────────────────────────────────────────────────────────

function renderTotals(doc: any, cfg: TemplateConfig, subtotalHt: number, totalVat: number, totalTtc: number, totalLabel: string, startY: number): number {
  const ML = cfg.margin
  const CW = doc.page.width - 2 * ML
  const P = hexToRgb(cfg.primaryColor)
  const F = fonts(cfg)
  let y = startY + 8

  if (cfg.totalStyle === 'darkbar') {
    if (totalVat > 0) {
      const tx = ML + CW - 200
      doc.fillColor('#555').fontSize(8.5).font(F.reg).text('Total HT', tx, y).text(fmt(subtotalHt), ML, y, { align: 'right', width: CW - 4 })
      y += 14
      doc.text('TVA', tx, y).text(fmt(totalVat), ML, y, { align: 'right', width: CW - 4 }); y += 10
    }
    if (cfg.rounded) doc.roundedRect(ML, y, CW, 36, 8).fill([19, 19, 31])
    else doc.rect(ML, y, CW, 36).fill([26, 26, 26])
    doc.fillColor('white').fontSize(10).font(F.bold).text(totalLabel, ML + 12, y + 11)
    doc.fillColor(P).fontSize(13).font(F.bold).text(fmt(totalTtc), ML, y + 11, { align: 'right', width: CW - 12 })
    return y + 36 + cfg.sectionGap
  }

  if (cfg.totalStyle === 'coloredbox') {
    const tw = 220, tx = ML + CW - tw
    doc.fillColor('#555').fontSize(8.5).font(F.reg).text('Total HT', tx, y).text(fmt(subtotalHt), ML, y, { align: 'right', width: CW - 4 })
    y += 14
    if (totalVat > 0) { doc.text('TVA', tx, y).text(fmt(totalVat), ML, y, { align: 'right', width: CW - 4 }); y += 10 }
    if (cfg.rounded) doc.roundedRect(tx - 10, y, tw + 10, 32, 6).fill(P)
    else doc.rect(tx - 10, y, tw + 10, 32).fill(P)
    doc.fillColor('white').fontSize(10).font(F.bold).text(totalLabel, tx - 4, y + 9)
    doc.fontSize(12).text(fmt(totalTtc), ML, y + 9, { align: 'right', width: CW - 6 })
    return y + 32 + cfg.sectionGap
  }

  // inline
  const tx = ML + CW - 200
  doc.fillColor('#555').fontSize(8.5).font(F.reg).text('Total HT', tx, y).text(fmt(subtotalHt), ML, y, { align: 'right', width: CW - 4 })
  y += 14
  if (totalVat > 0) { doc.text('TVA', tx, y).text(fmt(totalVat), ML, y, { align: 'right', width: CW - 4 }); y += 10 }
  doc.moveTo(tx, y).lineTo(ML + CW, y).strokeColor(P).lineWidth(1.5).stroke()
  y += 5
  doc.fillColor(P).fontSize(11).font(F.bold).text(totalLabel, tx, y).text(fmt(totalTtc), ML, y, { align: 'right', width: CW - 4 })
  doc.fillColor('#222')
  return y + 20 + cfg.sectionGap
}

// ─── NOTES ─────────────────────────────────────────────────────────────────────

function renderNotes(doc: any, cfg: TemplateConfig, notes: string, startY: number): number {
  if (!notes) return startY
  const ML = cfg.margin
  const CW = doc.page.width - 2 * ML
  const P = hexToRgb(cfg.primaryColor)
  const F = fonts(cfg)
  const noteLines = notes.split('\n').filter(s => s.trim())
  let y = startY
  doc.fontSize(8.5).font(F.reg)
  let condH = 28
  noteLines.forEach(l => { condH += doc.heightOfString(l, { width: CW - 36 }) + 8 })
  condH += 8
  drawBox(doc, cfg, ML, y, CW, condH)
  doc.fillColor(P).fontSize(7).font(F.bold).text('CONDITIONS DE PAIEMENT', ML + 12, y + 10, { characterSpacing: 0.5 })
  let nY = y + 24
  noteLines.forEach(line => {
    doc.save().circle(ML + 16, nY + 6, 2.5).fill(P).restore()
    doc.fillColor('#333').fontSize(8.5).font(F.reg).text(line, ML + 26, nY, { width: CW - 38 })
    nY += doc.heightOfString(line, { width: CW - 38 }) + 8
  })
  return y + condH + cfg.sectionGap
}

// ─── SIGNATURES ────────────────────────────────────────────────────────────────

function renderSignatures(doc: any, cfg: TemplateConfig, company: any, issueDate: string, startY: number, leftLabel: string): number {
  const ML = cfg.margin
  const CW = doc.page.width - 2 * ML
  const P = hexToRgb(cfg.primaryColor)
  const F = fonts(cfg)
  const sigH = 80
  const sigW = (CW - 12) / 2
  const y = startY
  drawBox(doc, cfg, ML, y, sigW, sigH)
  drawBox(doc, cfg, ML + sigW + 12, y, sigW, sigH)
  doc.fillColor(P).fontSize(7).font(F.bold).text(leftLabel, ML + 12, y + 10, { characterSpacing: 0.5 })
  doc.fillColor('#aaa').fontSize(8.5).font(F.reg).text('Date : ___________________', ML + 12, y + 26).text('Signature :', ML + 12, y + 44)
  const rx = ML + sigW + 24
  doc.fillColor(P).fontSize(7).font(F.bold).text(`${(company?.trade_name || 'Prestataire').toUpperCase()} — ÉMETTEUR`, rx, y + 10, { width: sigW - 24 })
  doc.fillColor('#555').fontSize(8.5).font(F.reg).text(company?.trade_name || '', rx, y + 26).text(`Date : ${fmtDate(issueDate)}`, rx, y + 42)
  return y + sigH + 16
}

function renderFooter(doc: any, cfg: TemplateConfig, company: any, footerNote: string, startY: number) {
  const ML = cfg.margin
  const CW = doc.page.width - 2 * ML
  const F = fonts(cfg)
  let y = startY
  doc.moveTo(ML, y).lineTo(ML + CW, y).strokeColor('#e5e7eb').lineWidth(0.5).stroke()
  y += 8
  const parts = [company?.siret ? `SIRET : ${company.siret}` : '', footerNote].filter(Boolean)
  doc.fontSize(7).font(F.reg).fillColor('#aaa').text(parts.join('  ·  '), ML, y, { width: CW, align: 'center' })
}

// ─── PUBLIC API ────────────────────────────────────────────────────────────────

export async function generateQuotePDF(quote: any, company: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const cfg = getTemplateConfig(company)
    const doc = new PDFDocument({ margin: cfg.margin, size: 'A4' })
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const client = quote.clients
    const lines = [...(quote.quote_lines || [])].sort((a: any, b: any) => a.sort_order - b.sort_order)
    const clientName = client?.type === 'professionnel'
      ? (client.company_name || 'Client')
      : `${client?.first_name || ''} ${client?.last_name || ''}`.trim() || 'Client'
    const F = fonts(cfg)

    let y = renderHeader(doc, cfg, 'DEVIS', quote.quote_number, quote.issue_date, quote.valid_until, "Valable jusqu'au", company)
    y = renderParties(doc, cfg, company, client, clientName, y)
    y = renderTable(doc, cfg, lines, y)
    y = renderTotals(doc, cfg, quote.subtotal_ht, quote.total_vat, quote.total_ttc, 'Total estimé', y)

    if (quote.deposit_amount > 0) {
      const ML = cfg.margin, CW = doc.page.width - 2 * ML
      doc.fillColor('#2563eb').fontSize(9).font(F.reg)
        .text(`Acompte demandé (${quote.deposit_percent}%)`, ML + 4, y + 4)
        .text(fmt(quote.deposit_amount), ML, y + 4, { align: 'right', width: CW - 4 })
      y += 22
    }

    y = renderNotes(doc, cfg, quote.notes || '', y)
    y = renderSignatures(doc, cfg, company, quote.issue_date, y, 'BON POUR ACCORD — CLIENT')
    renderFooter(doc, cfg, company, 'TVA non applicable — art. 293B CGI (micro-entreprise)', y)
    doc.end()
  })
}

export async function generateInvoicePDF(invoice: any, company: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const cfg = getTemplateConfig(company)
    const doc = new PDFDocument({ margin: cfg.margin, size: 'A4' })
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const client = invoice.clients
    const lines = [...(invoice.invoice_lines || [])].sort((a: any, b: any) => a.sort_order - b.sort_order)
    const clientName = client?.type === 'professionnel'
      ? (client.company_name || 'Client')
      : `${client?.first_name || ''} ${client?.last_name || ''}`.trim() || 'Client'
    const F = fonts(cfg)
    const ML = cfg.margin, CW = doc.page.width - 2 * ML
    const P = hexToRgb(cfg.primaryColor)

    let y = renderHeader(doc, cfg, 'FACTURE', invoice.invoice_number, invoice.issue_date, invoice.due_date, 'Échéance :', company)
    y = renderParties(doc, cfg, company, client, clientName, y)
    y = renderTable(doc, cfg, lines, y)
    y = renderTotals(doc, cfg, invoice.subtotal_ht, invoice.total_vat, invoice.total_ttc, 'Total TTC', y)

    if (invoice.deposit_already_paid > 0) {
      doc.fillColor('#555').fontSize(8.5).font(F.reg)
        .text('Acompte versé', ML + 4, y + 4).text(`- ${fmt(invoice.deposit_already_paid)}`, ML, y + 4, { align: 'right', width: CW - 4 })
      y += 22
    }
    const tw = 220, tx = ML + CW - tw
    doc.moveTo(tx, y).lineTo(ML + CW, y).strokeColor('#e5e7eb').lineWidth(0.5).stroke()
    y += 6
    doc.fillColor('#dc2626').fontSize(11).font(F.bold).text('Reste à payer', tx, y).text(fmt(invoice.amount_due), ML, y, { align: 'right', width: CW - 4 })
    y += 26

    if (company?.iban) {
      drawBox(doc, cfg, ML, y, CW, 38)
      doc.fillColor(P).fontSize(7).font(F.bold).text('COORDONNÉES BANCAIRES', ML + 12, y + 10)
      doc.fillColor('#333').fontSize(8.5).font(F.reg).text(`IBAN : ${company.iban}`, ML + 12, y + 22)
      y += 38 + cfg.sectionGap
    }

    y = renderSignatures(doc, cfg, company, invoice.issue_date, y, 'ACQUIT DE PAIEMENT — CLIENT')
    renderFooter(doc, cfg, company, 'En cas de retard : pénalités 3× taux légal + indemnité forfaitaire 40 €', y)
    doc.end()
  })
}
