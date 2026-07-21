// Modèles de documents (devis / factures) rendus en HTML.
//
// Chaque modèle reproduit fidèlement un design fourni ; seules les données
// textuelles changent (entreprise inscrite + logo + mentions légales, client,
// lignes, totaux). Le HTML complet (avec <style>) est destiné à être affiché
// dans une iframe sur la page de signature — c'est ce que le client voit et
// signe, on n'envoie plus de PDF.

/* ─── Données normalisées ─────────────────────────────────────────────── */

export type DocLine = {
  n: number
  title: string
  description?: string
  qty: number
  unitLabel?: string
  puHt: number
  totalHt: number
}

export type DocParty = {
  name: string
  subtitle?: string          // sous-titre entreprise / "À l'attention de…" client
  addressLines: string[]
  phone?: string
  email?: string
  website?: string
  siret?: string
  vat?: string
  ape?: string
}

export type DocData = {
  docType: 'devis' | 'facture'
  title: string              // "DEVIS" / "FACTURE"
  number: string
  issueDate: string          // déjà formaté fr
  secondLabel: string        // "Validité du devis" / "Date d'échéance"
  secondDate: string
  objet?: string
  logoUrl?: string
  company: DocParty & { capital?: string; iban?: string; bic?: string; rcs?: string }
  client: DocParty
  lines: DocLine[]
  subtotalHt: number
  vatRate: number
  totalVat: number
  totalTtc: number
  vatNote?: string           // "TVA non applicable, art. 293 B du CGI."
  modalites?: string         // conditions de règlement (multi-lignes)
  cgv?: string               // note CGV du pied
}

/* ─── Helpers ─────────────────────────────────────────────────────────── */

const eurFmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })
export const fmtEur = (n: number) => eurFmt.format(Number(n) || 0)

/** Échappement HTML : toutes les données dynamiques passent par là. */
export function esc(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v)
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
/** Texte multi-lignes → <br>, échappé. */
const nl2br = (s?: string) => s ? esc(s).replace(/\n/g, '<br>') : ''

const UNIT_LABELS: Record<string, string> = {
  m2: 'm²', ml: 'ml', u: 'u', forfait: 'forfait', h: 'h', j: 'j', piece: 'pièce',
}
export const unitLabel = (u?: string) => (u ? UNIT_LABELS[u] || u : '')

/* ─── Modèle AZUR — noir & blanc, encadré, minimal ────────────────────── */

function renderAzur(d: DocData): string {
  const c = d.company, cl = d.client
  const contact = (icon: string, txt?: string) => (txt ? `${icon} ${esc(txt)}<br>` : '')
  const companyContacts =
    (c.addressLines[0] ? `📍 ${esc(c.addressLines[0])}<br>` : '') +
    (c.addressLines[1] ? `${esc(c.addressLines[1])}<br>` : '') +
    contact('☎', c.phone) + contact('✉', c.email) + contact('🌐', c.website)

  const party = (label: string, p: DocParty, extra = '') => `
    <div class="info-card"><div class="info-label">${esc(label)}</div>
      <strong>${esc(p.name)}</strong>
      ${p.subtitle ? esc(p.subtitle) + '<br>' : ''}
      ${p.addressLines.map(esc).join('<br>')}
      ${(p.siret || p.vat) ? '<br><br>' : ''}
      ${p.siret ? `SIRET : ${esc(p.siret)}<br>` : ''}
      ${p.vat ? `TVA : ${esc(p.vat)}<br>` : ''}
      ${extra}
    </div>`

  const rows = d.lines.map(l => `
    <tr>
      <td class="col-number">${l.n}</td>
      <td class="col-description">
        <div class="item-title">${esc(l.title)}</div>
        ${l.description ? `<div class="item-desc">${esc(l.description)}</div>` : ''}
      </td>
      <td class="col-qty">${esc(l.qty)}${l.unitLabel ? ' ' + esc(l.unitLabel) : ''}</td>
      <td class="col-price">${fmtEur(l.puHt)}</td>
      <td class="col-total">${fmtEur(l.totalHt)}</td>
    </tr>`).join('')

  const footerLegal = [
    `${esc(c.name)}${c.addressLines.length ? ' — ' + esc(c.addressLines.join(', ')) : ''}`,
    [c.siret ? `SIRET : ${esc(c.siret)}` : '', c.vat ? `TVA : ${esc(c.vat)}` : '', c.rcs ? esc(c.rcs) : '']
      .filter(Boolean).join(' — '),
    d.cgv ? esc(d.cgv) : '',
  ].filter(Boolean).join('<br>')

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><style>
*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;font-family:Arial,Helvetica,sans-serif;color:#111}
.page{width:100%;max-width:210mm;margin:0 auto;padding:18mm 16mm 12mm;background:#fff}
.header{display:grid;grid-template-columns:1.2fr 1fr;gap:30px;margin-bottom:32px}
.company-top{display:flex;gap:24px;align-items:flex-start}
.logo-box{width:90px;height:90px;border:2px solid #111;display:flex;align-items:center;justify-content:center;text-align:center;font-size:18px;line-height:1.15;flex-shrink:0;overflow:hidden}
.logo-box img{max-width:100%;max-height:100%;object-fit:contain}
.logo-box strong{display:block;font-size:22px}
.company-name{font-size:23px;font-weight:800;margin-bottom:4px;text-transform:uppercase}
.company-subtitle{font-size:13px;margin-bottom:14px}
.company-details{font-size:13px;line-height:1.55}
.invoice-head{text-align:right}
.invoice-title{font-size:42px;font-weight:900;letter-spacing:1px;margin-bottom:8px;text-transform:uppercase}
.invoice-line{width:260px;height:2px;background:#111;margin:0 0 28px auto}
.invoice-meta{display:grid;grid-template-columns:auto 1fr;gap:14px 30px;font-size:14px;justify-content:end;text-align:left;max-width:330px;margin-left:auto}
.invoice-meta strong{text-transform:uppercase}
.info-row{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-bottom:22px}
.info-card{border:1.5px solid #111;min-height:150px;padding:28px 16px 16px;position:relative;font-size:13px;line-height:1.55}
.info-label{position:absolute;top:-15px;left:16px;background:#111;color:#fff;padding:7px 14px;font-size:12px;font-weight:800;text-transform:uppercase}
.info-card strong{display:block;font-size:14px;margin-bottom:4px;text-transform:uppercase}
.object-line{border:1.5px solid #111;padding:11px 14px;margin-bottom:24px;display:grid;grid-template-columns:90px 1fr;gap:12px;font-size:14px;align-items:center}
.object-line strong{text-transform:uppercase}
table{width:100%;border-collapse:collapse}
.items-table{margin-bottom:24px;font-size:13px}
.items-table th{background:#111;color:#fff;padding:12px 10px;text-align:center;font-size:13px;text-transform:uppercase;border:1px solid #111}
.items-table td{border:1px solid #555;padding:14px 10px;vertical-align:middle}
.items-table .col-number{width:7%;text-align:center}.items-table .col-description{width:49%}.items-table .col-qty{width:12%;text-align:center}
.items-table .col-price,.items-table .col-total{width:16%;text-align:right;white-space:nowrap}
.item-title{font-weight:800;margin-bottom:6px}.item-desc{font-size:12px;line-height:1.4}
.bottom-grid{display:grid;grid-template-columns:1.1fr .9fr;gap:36px;align-items:start;margin-top:10px}
.payment-block{margin-top:12px;font-size:13px;line-height:1.55}
.payment-title{display:flex;align-items:center;gap:12px;font-weight:800;text-transform:uppercase;margin-bottom:10px}
.payment-icon{width:28px;height:22px;border:2px solid #111;border-radius:3px;position:relative;flex-shrink:0}
.payment-icon::before{content:"";position:absolute;left:3px;top:6px;width:20px;height:2px;background:#111}
.legal-note{margin-top:28px;display:flex;align-items:center;gap:12px;font-size:13px}
.info-icon{width:28px;height:28px;border:2px solid #111;border-radius:50%;display:flex;justify-content:center;align-items:center;font-weight:800;font-size:16px;flex-shrink:0}
.totals-table{width:100%;font-size:14px;margin-bottom:26px}
.totals-table td{border:1px solid #111;padding:11px 14px}
.totals-table td:first-child{font-weight:800;text-transform:uppercase}
.totals-table td:last-child{text-align:right;white-space:nowrap}
.totals-table .grand-total td{background:#111;color:#fff;font-weight:900;font-size:15px}
.signature-box{border:1.5px solid #111;min-height:105px;padding:18px;text-align:center;font-size:13px}
.signature-box strong{display:block;text-transform:uppercase;font-size:15px;margin-bottom:8px}
.footer{margin-top:34px;border-top:2px solid #111;padding-top:16px;text-align:center;font-size:11px;line-height:1.6}
</style></head><body><main class="page">
<section class="header"><div class="company-top">
<div class="logo-box">${d.logoUrl ? `<img src="${esc(d.logoUrl)}" alt="">` : `<div>VOTRE<strong>LOGO</strong></div>`}</div>
<div><div class="company-name">${esc(c.name)}</div>${c.subtitle ? `<div class="company-subtitle">${esc(c.subtitle)}</div>` : ''}
<div class="company-details">${companyContacts}</div></div></div>
<div class="invoice-head"><div class="invoice-title">${esc(d.title)}</div><div class="invoice-line"></div>
<div class="invoice-meta"><strong>N° ${d.docType === 'devis' ? 'Devis' : 'Facture'} :</strong><span>${esc(d.number)}</span><strong>Date d'émission :</strong><span>${esc(d.issueDate)}</span><strong>${esc(d.secondLabel)} :</strong><span>${esc(d.secondDate)}</span></div></div></section>
<section class="info-row">
${party('Émetteur', c, (c.phone ? `<br><br>${esc(c.phone)}<br>` : '') + (c.email ? `${esc(c.email)}` : ''))}
${party('Destinataire', cl, (cl.phone ? `<br><br>${esc(cl.phone)}<br>` : '') + (cl.email ? `${esc(cl.email)}` : ''))}
</section>
${d.objet ? `<section class="object-line"><strong>Objet :</strong><span>${esc(d.objet)}</span></section>` : ''}
<table class="items-table"><thead><tr><th class="col-number">N°</th><th class="col-description">Désignation</th><th class="col-qty">Qté</th><th class="col-price">P.U. HT</th><th class="col-total">Total HT</th></tr></thead><tbody>${rows}</tbody></table>
<section class="bottom-grid"><div>
${d.modalites ? `<div class="payment-block"><div class="payment-title"><span class="payment-icon"></span><span>Modalités de règlement</span></div>${nl2br(d.modalites)}</div>` : ''}
${d.vatNote ? `<div class="legal-note"><span class="info-icon">i</span><span>${esc(d.vatNote)}</span></div>` : ''}
</div><div>
<table class="totals-table"><tr><td>Total HT</td><td>${fmtEur(d.subtotalHt)}</td></tr><tr><td>TVA (${esc(d.vatRate)} %)</td><td>${fmtEur(d.totalVat)}</td></tr><tr class="grand-total"><td>Total TTC</td><td>${fmtEur(d.totalTtc)}</td></tr></table>
<div class="signature-box"><strong>${d.docType === 'devis' ? 'Bon pour accord' : 'Merci de votre confiance'}</strong>Date, cachet et signature du client</div>
</div></section>
<footer class="footer">${footerLegal}</footer>
</main></body></html>`
}

/* ─── Modèle VIA — orange, cartes arrondies, emojis (HTML officiel) ────── */

function renderVia(d: DocData): string {
  const c = d.company, cl = d.client
  const O = '#f35b04'
  const line = (icon: string, txt?: string) => (txt ? `${icon} ${esc(txt)}<br>` : '')

  const companyBody =
    `<strong>${esc(c.name)}</strong>` +
    (c.addressLines.length ? c.addressLines.map(esc).join('<br>') + '<br><br>' : '') +
    line('☎', c.phone) + line('✉', c.email) + line('🌐', c.website) +
    (c.siret ? `SIRET : ${esc(c.siret)}<br>` : '') +
    (c.ape ? `APE : ${esc(c.ape)}` : '')

  const clientBody =
    `<strong>${esc(cl.name)}</strong>` +
    (cl.addressLines.length ? cl.addressLines.map(esc).join('<br>') + '<br><br>' : '') +
    (cl.subtitle ? `À l'attention de : ${esc(cl.subtitle)}<br><br>` : '') +
    line('✉', cl.email) + line('☎', cl.phone) +
    (cl.siret ? `SIRET : ${esc(cl.siret)}` : '')

  const metaRow = (icon: string, label: string, value: string) =>
    `<div class="meta-row"><span class="icon-circle">${icon}</span><span class="meta-label">${esc(label)}</span><span class="meta-value">${esc(value)}</span></div>`
  const metaRows =
    metaRow('📄', `N° ${d.docType === 'devis' ? 'devis' : 'facture'}`, d.number) +
    metaRow('📅', "Date d'émission", d.issueDate) +
    metaRow('📅', d.secondLabel, d.secondDate)

  const rows = d.lines.map(l => `
    <tr>
      <td class="col-number"><div class="item-number">${l.n}</div></td>
      <td class="col-desc"><div class="item-title">${esc(l.title)}</div>${l.description ? `<div class="item-desc">${esc(l.description)}</div>` : ''}</td>
      <td class="col-qty">${esc(l.qty)}${l.unitLabel ? ' ' + esc(l.unitLabel) : ''}</td>
      <td class="col-price">${fmtEur(l.puHt)}</td>
      <td class="col-total"><strong>${fmtEur(l.totalHt)}</strong></td>
    </tr>`).join('')

  // Case bas-droite : « Bon pour accord » (devis) ou « Règlement » (facture)
  const rightBox = d.docType === 'devis'
    ? `<div class="signature-box"><div><div class="small-card-title"><span class="icon-circle">✎</span>Bon pour accord</div>Date : ........................................<br><br>Nom, cachet et signature :</div><div class="signature-zone"></div></div>`
    : `<div class="signature-box"><div><div class="small-card-title"><span class="icon-circle">✎</span>Règlement</div>Merci d'indiquer le numéro de facture lors du virement.${c.iban ? `<br><br>IBAN : ${esc(c.iban)}` : ''}${c.bic ? `<br>BIC : ${esc(c.bic)}` : ''}</div><div class="signature-zone" style="display:flex;align-items:center;justify-content:center;color:#777">Cachet et signature</div></div>`

  const brand = d.logoUrl
    ? `<div class="logo-mark" style="transform:none;background:#fff;border:1.5px solid ${O};overflow:hidden"><img src="${esc(d.logoUrl)}" alt="" style="max-width:100%;max-height:100%;object-fit:contain;transform:none"></div>`
    : `<div class="logo-mark"><span>${esc((c.name || 'V')[0].toUpperCase())}</span></div>`

  const footerLegal = [
    `<strong>${esc(c.name)}</strong>`,
    c.addressLines.length ? esc(c.addressLines.join(', ')) : '',
    [c.capital ? esc(c.capital) : '', c.rcs ? esc(c.rcs) : ''].filter(Boolean).join(' — '),
    c.website ? esc(c.website) : '',
  ].filter(Boolean).join('<br>')

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><style>
*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;font-family:Arial,Helvetica,sans-serif;color:#171717}
.page{width:100%;max-width:210mm;margin:0 auto;padding:14mm;background:#fff;border:3px solid ${O};border-radius:18px;overflow:hidden}
.top{display:grid;grid-template-columns:1fr 1.1fr 1fr;gap:28px;align-items:start;margin-bottom:24px}
.brand{display:flex;gap:14px;align-items:center;margin-bottom:24px}
.logo-mark{width:58px;height:58px;background:${O};border-radius:14px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:28px;font-weight:900;transform:rotate(45deg);flex-shrink:0}
.logo-mark span{transform:rotate(-45deg)}
.brand-name{font-size:24px;font-weight:900;text-transform:uppercase}
.brand-tagline{font-size:10px;color:${O};font-weight:800;letter-spacing:2px;text-transform:uppercase}
.main-title{text-align:center;color:${O};font-size:${d.docType === 'devis' ? 56 : 52}px;line-height:1;font-weight:900;text-transform:uppercase;margin-bottom:20px}
.title-line{width:60px;height:4px;background:${O};margin:0 auto 22px;border-radius:999px}
.info-card{border:1.5px solid #ffd2b8;background:#fffaf6;border-radius:12px;padding:16px;font-size:13px;line-height:1.55}
.card-title{color:${O};font-size:13px;font-weight:900;text-transform:uppercase;margin-bottom:14px;display:flex;align-items:center;gap:8px}
.icon-circle{width:28px;height:28px;background:${O};color:#fff;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-weight:900;font-size:14px;flex-shrink:0}
.info-card strong{display:block;font-size:14px;margin-bottom:8px;text-transform:uppercase}
.devis-meta{padding-top:${d.docType === 'devis' ? 84 : 64}px}
.meta-row{display:grid;grid-template-columns:40px 1fr 1fr;gap:12px;align-items:center;padding:12px 0;border-bottom:1px dashed #ffd2b8;font-size:13px}
.meta-label{color:${O};font-weight:900;text-transform:uppercase}
.meta-value{font-weight:800;text-align:right}
.object-box{border:2px solid ${O};border-radius:10px;padding:12px 16px;margin-bottom:16px;display:grid;grid-template-columns:46px 80px 1fr;gap:14px;align-items:center;font-size:13px}
.object-label{color:${O};font-weight:900;text-transform:uppercase;border-right:2px solid ${O};padding-right:14px}
table{width:100%;border-collapse:separate;border-spacing:0}
.items-table{border:1.5px solid #ffd2b8;border-radius:10px;overflow:hidden;margin-bottom:18px}
.items-table th{background:${O};color:#fff;text-transform:uppercase;padding:13px 10px;font-size:13px;border-right:1px solid #ffb98f}
.items-table th:last-child{border-right:none}
.items-table td{padding:17px 12px;border-bottom:1px solid #ffd2b8;border-right:1px solid #ffd2b8;vertical-align:middle;font-size:13px}
.items-table tr:last-child td{border-bottom:none}
.items-table td:last-child{border-right:none}
.item-number{width:44px;height:44px;border-radius:10px;background:#fff0e6;color:${O};display:flex;align-items:center;justify-content:center;font-weight:900;font-size:18px;margin:auto}
.item-title{font-weight:900;margin-bottom:5px}.item-desc{font-size:12px;line-height:1.45}
.col-number{width:8%;text-align:center}.col-desc{width:46%}.col-qty{width:14%;text-align:center}
.col-price,.col-total{width:16%;text-align:right;white-space:nowrap}
.lower{display:grid;grid-template-columns:1fr 1fr;gap:34px;margin-top:18px}
.small-card{border:1.5px solid #ffd2b8;border-radius:12px;padding:16px;margin-bottom:14px;font-size:12px;line-height:1.6;background:#fffdfa}
.small-card-title{color:${O};font-weight:900;text-transform:uppercase;margin-bottom:8px;display:flex;align-items:center;gap:10px}
.totals{border:1.5px solid #ffd2b8;border-radius:10px;overflow:hidden;margin-bottom:16px;font-size:14px}
.totals-row{display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid #ffd2b8}
.totals-row:last-child{border-bottom:none}
.totals-row div{padding:12px 14px}.totals-row div:last-child{text-align:right;font-weight:800}
.grand-total{background:#fff0e6;color:${O};font-weight:900;font-size:22px}
.signature-box{border:2px solid ${O};border-radius:12px;padding:16px;min-height:125px;display:grid;grid-template-columns:1fr 160px;gap:18px;font-size:12px}
.signature-zone{border:1.5px dashed ${O};border-radius:10px;min-height:90px}
.foot{margin:22px -14mm -14mm;background:${O};color:#fff;padding:18px 28px;display:grid;grid-template-columns:1.2fr 1fr;gap:24px;align-items:center;font-size:12px;line-height:1.5;border-radius:28px 28px 0 0}
.foot strong{display:block;font-size:14px;text-transform:uppercase;margin-bottom:4px}
</style></head><body><main class="page">
<section class="top">
<div>
<div class="brand">${brand}<div><div class="brand-name">${esc(c.name)}</div>${c.subtitle ? `<div class="brand-tagline">${esc(c.subtitle)}</div>` : ''}</div></div>
<div class="info-card"><div class="card-title"><span class="icon-circle">👤</span>Émetteur</div>${companyBody}</div>
</div>
<div>
<div class="main-title">${esc(d.title)}</div><div class="title-line"></div>
<div class="devis-meta">${metaRows}</div>
</div>
<div>
<div class="info-card" style="margin-top:96px"><div class="card-title"><span class="icon-circle">👤</span>Destinataire</div>${clientBody}</div>
</div>
</section>
${d.objet ? `<section class="object-box"><span class="icon-circle">📄</span><span class="object-label">Objet</span><span>${esc(d.objet)}</span></section>` : ''}
<table class="items-table"><thead><tr><th class="col-number"></th><th class="col-desc">Désignation</th><th class="col-qty">Qté</th><th class="col-price">P.U. HT</th><th class="col-total">Total HT</th></tr></thead><tbody>${rows}</tbody></table>
<section class="lower">
<div>
${d.modalites ? `<div class="small-card"><div class="small-card-title"><span class="icon-circle">💳</span>Modalités de règlement</div>${nl2br(d.modalites)}</div>` : ''}
${d.vatNote ? `<div class="small-card"><div class="small-card-title"><span class="icon-circle">⚖</span>Mention légale</div>${esc(d.vatNote)}</div>` : ''}
</div>
<div>
<div class="totals"><div class="totals-row"><div>TOTAL HT</div><div>${fmtEur(d.subtotalHt)}</div></div><div class="totals-row"><div>TVA (${esc(d.vatRate)} %)</div><div>${fmtEur(d.totalVat)}</div></div><div class="totals-row grand-total"><div>TOTAL TTC</div><div>${fmtEur(d.totalTtc)}</div></div></div>
${rightBox}
</div>
</section>
<footer class="foot"><div>${footerLegal}</div><div><strong>Merci de votre confiance</strong>Ce ${d.docType} a été établi avec soin.</div></footer>
</main></body></html>`
}

/* ─── Registre ────────────────────────────────────────────────────────── */

export type TemplateMeta = {
  id: string
  name: string
  description: string
  accent: string           // couleur pour la vignette du sélecteur
  render: (d: DocData) => string
}

export const DOC_TEMPLATES: Record<string, TemplateMeta> = {
  azur: { id: 'azur', name: 'Azur', description: 'Noir & blanc, épuré et encadré', accent: '#111111', render: renderAzur },
  via: { id: 'via', name: 'Via', description: 'Orange, cartes arrondies et icônes', accent: '#e8571e', render: renderVia },
}

export const DEFAULT_TEMPLATE = 'azur'

export function renderDocument(templateId: string | undefined | null, data: DocData): string {
  const t = DOC_TEMPLATES[templateId || ''] || DOC_TEMPLATES[DEFAULT_TEMPLATE]
  return t.render(data)
}

/* ─── Construction depuis un devis / une facture ──────────────────────── */

type Row = Record<string, unknown>
const s = (v: unknown) => (v === null || v === undefined ? '' : String(v))
const toLines = (addr: unknown): string[] =>
  s(addr).split(/\n+/).map(l => l.trim()).filter(Boolean)
const fmtDateFr = (d: unknown): string => {
  const v = s(d)
  if (!v) return ''
  const dt = new Date(v)
  return isNaN(dt.getTime()) ? v : dt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}
const clientName = (c: Row): string =>
  c.type === 'professionnel'
    ? (s(c.company_name) || 'Client')
    : `${s(c.first_name)} ${s(c.last_name)}`.trim() || 'Client'

/**
 * Mappe un devis/facture + l'entreprise + le client vers DocData.
 * `company`/`client` sont des lignes Supabase (typage lâche volontaire).
 */
export function buildDocData(
  kind: 'devis' | 'facture',
  doc: Row,
  company: Row | null,
  client: Row | null,
  lines: Row[],
): DocData {
  const co = company || {}
  const cl = client || {}
  const subtotalHt = Number(doc.subtotal_ht) || 0
  const totalVat = Number(doc.total_vat) || 0
  const totalTtc = Number(doc.total_ttc) || 0
  const vatRate = subtotalHt > 0 ? Math.round((totalVat / subtotalHt) * 100) : Number(co.default_vat_rate) || 0

  return {
    docType: kind,
    title: kind === 'devis' ? 'DEVIS' : 'FACTURE',
    number: s(kind === 'devis' ? doc.quote_number : doc.invoice_number),
    issueDate: fmtDateFr(doc.issue_date),
    secondLabel: kind === 'devis' ? 'Validité du devis' : "Date d'échéance",
    secondDate: fmtDateFr(kind === 'devis' ? doc.valid_until : doc.due_date),
    objet: s(doc.title) || undefined,
    logoUrl: s(co.logo_url) || undefined,
    company: {
      name: s(co.trade_name) || 'Votre entreprise',
      subtitle: s(co.legal_name) && s(co.legal_name) !== s(co.trade_name) ? s(co.legal_name) : undefined,
      addressLines: toLines(co.address),
      phone: s(co.phone) || undefined,
      email: s(co.email) || undefined,
      website: s(co.website) || undefined,
      siret: s(co.siret) || undefined,
      vat: s(co.vat_number) || undefined,
      capital: s(co.legal_status) || undefined,
      iban: s(co.iban) || undefined,
    },
    client: {
      name: clientName(cl),
      addressLines: toLines(cl.billing_address),
      phone: s(cl.phone) || undefined,
      email: s(cl.email) || undefined,
      siret: s(cl.siret) || undefined,
      vat: s(cl.vat_number) || undefined,
    },
    lines: [...lines]
      .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0))
      .map((l, i) => ({
        n: i + 1,
        title: s(l.designation),
        description: s(l.description) || undefined,
        qty: Number(l.quantity) || 0,
        unitLabel: unitLabel(s(l.unit)),
        puHt: Number(l.unit_price_ht) || 0,
        totalHt: Number(l.total_ht) || 0,
      })),
    subtotalHt, vatRate, totalVat, totalTtc,
    vatNote: s(doc.legal_mentions) || s(co.legal_mentions) || undefined,
    modalites: s(doc.notes) || s(co.payment_terms) || undefined,
  }
}

/* ─── Données de démonstration (aperçu du sélecteur) ──────────────────── */

export function sampleDocData(docType: 'devis' | 'facture' = 'devis'): DocData {
  return {
    docType,
    title: docType === 'devis' ? 'DEVIS' : 'FACTURE',
    number: docType === 'devis' ? 'DEV-2025-014' : 'FAC-2025-032',
    issueDate: '20 mai 2025',
    secondLabel: docType === 'devis' ? 'Validité du devis' : "Date d'échéance",
    secondDate: '19 juin 2025',
    objet: 'Rénovation complète de la salle de bain — dépose, plomberie, carrelage et peinture.',
    company: {
      name: 'Rénov Pro', subtitle: 'Artisan tous corps d\'état',
      addressLines: ['12 rue des Bâtisseurs', '69003 Lyon, France'],
      phone: '04 72 00 00 00', email: 'contact@renovpro.fr', website: 'www.renovpro.fr',
      siret: '912 345 678 00019', vat: 'FR 12 912345678', ape: '4399C',
      capital: 'SAS au capital de 20 000 €', rcs: 'RCS Lyon 912 345 678',
    },
    client: {
      name: 'M. et Mme Martin', subtitle: 'M. Julien Martin',
      addressLines: ['8 avenue des Lilas', '69100 Villeurbanne'],
      phone: '06 12 34 56 78', email: 'julien.martin@email.fr',
    },
    lines: [
      { n: 1, title: 'Dépose et évacuation', description: 'Dépose de l\'ancienne salle de bain, évacuation des gravats.', qty: 1, unitLabel: 'forfait', puHt: 850, totalHt: 850 },
      { n: 2, title: 'Plomberie', description: 'Remplacement des évacuations et alimentation, pose douche et meuble vasque.', qty: 1, unitLabel: 'forfait', puHt: 2400, totalHt: 2400 },
      { n: 3, title: 'Carrelage sol et mur', description: 'Fourniture et pose, faïence jusqu\'à 2 m.', qty: 18, unitLabel: 'm²', puHt: 95, totalHt: 1710 },
    ],
    subtotalHt: 4960, vatRate: 10, totalVat: 496, totalTtc: 5456,
    vatNote: 'TVA à 10 % — travaux de rénovation (logement de plus de 2 ans).',
    modalites: '30 % à la commande\nSolde à la réception des travaux\nRèglement par virement ou chèque',
    cgv: 'Devis gratuit, valable 30 jours. Travaux réalisés selon les règles de l\'art.',
  }
}
