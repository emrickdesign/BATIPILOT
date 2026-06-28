// Parsing d'un relevé bancaire CSV (formats FR courants) → transactions normalisées.
// Pas d'agrégateur externe : l'utilisateur exporte son relevé et l'importe.

export type ParsedTx = { tx_date: string | null; label: string; amount: number }

function detectDelimiter(line: string): string {
  const counts: Record<string, number> = { ';': 0, ',': 0, '\t': 0 }
  for (const ch of line) if (ch in counts) counts[ch]++
  return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0]) || ';'
}

function splitCsvLine(line: string, delim: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++ } else inQuotes = !inQuotes
    } else if (c === delim && !inQuotes) { out.push(cur); cur = '' } else cur += c
  }
  out.push(cur)
  return out.map(s => s.trim())
}

// "1 234,56" / "1234.56" / "-45,00" / "(45,00)" / "45,00 €" → number
function parseAmount(raw: string): number | null {
  if (!raw) return null
  let s = raw.replace(/ /g, '').replace(/\s/g, '').replace(/€|EUR/gi, '')
  let neg = false
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1) }
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.')
  else s = s.replace(',', '.')
  const n = parseFloat(s)
  if (isNaN(n)) return null
  return neg ? -Math.abs(n) : n
}

// dd/mm/yyyy, dd-mm-yyyy, yyyy-mm-dd → ISO yyyy-mm-dd
function parseDate(raw: string): string | null {
  if (!raw) return null
  const s = raw.trim()
  let m = s.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/)
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  return null
}

const has = (h: string, ...keys: string[]) => keys.some(k => h.includes(k))

export function parseBankCsv(text: string): ParsedTx[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0)
  if (lines.length === 0) return []
  const delim = detectDelimiter(lines[0])

  // Trouver la ligne d'en-tête (celle qui contient "date")
  let headerIdx = 0
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    if (/date/i.test(lines[i])) { headerIdx = i; break }
  }
  const header = splitCsvLine(lines[headerIdx], delim).map(h => h.toLowerCase())
  const dateIdx = header.findIndex(h => has(h, 'date'))
  const labelIdx = header.findIndex(h => has(h, 'libell', 'label', 'descript', 'nature', 'motif', 'opérat', 'operat'))
  const amountIdx = header.findIndex(h => has(h, 'montant', 'amount'))
  const debitIdx = header.findIndex(h => has(h, 'débit', 'debit'))
  const creditIdx = header.findIndex(h => has(h, 'crédit', 'credit'))

  const rows: ParsedTx[] = []
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i], delim)
    if (cols.length < 2) continue
    const tx_date = dateIdx >= 0 ? parseDate(cols[dateIdx] || '') : null
    const label = (labelIdx >= 0 ? cols[labelIdx] : cols.find((c, idx) => idx !== dateIdx && c) || '') || ''
    let amount: number | null = null
    if (amountIdx >= 0) amount = parseAmount(cols[amountIdx] || '')
    else {
      const credit = creditIdx >= 0 ? parseAmount(cols[creditIdx] || '') : null
      const debit = debitIdx >= 0 ? parseAmount(cols[debitIdx] || '') : null
      if (credit !== null || debit !== null) amount = (credit || 0) - Math.abs(debit || 0)
    }
    if (amount === null) continue
    rows.push({ tx_date, label: label.slice(0, 200), amount })
  }
  return rows
}

export const bankTxStatusLabels: Record<string, string> = {
  a_rapprocher: 'À rapprocher',
  rapproche: 'Rapproché',
  ignore: 'Ignoré',
}
