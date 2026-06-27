export type HeaderStyle = 'clean' | 'bar' | 'dark' | 'minimal'
export type BoxStyle = 'dashed' | 'solid' | 'filled' | 'lines' | 'none'
export type TableColumnsStyle = 'simple' | 'full'
export type TotalStyle = 'darkbar' | 'coloredbox' | 'inline'
export type FontFamily = 'sans' | 'serif'
export type PartyLayout = 'two-boxes' | 'banner' | 'stacked'

export interface TemplateConfig {
  id: string
  name: string
  description: string
  domain: string
  primaryColor: string
  secondaryBg: string
  headerBg: string
  headerTextColor: string
  tableHeaderBg: string
  tableHeaderTextColor: string
  headerStyle: HeaderStyle
  boxStyle: BoxStyle
  tableColumnsStyle: TableColumnsStyle
  stripeRows: boolean
  totalStyle: TotalStyle
  fontFamily: FontFamily
  partyLayout: PartyLayout
  rounded: boolean
  baseFontSize: number
  titleFontSize: number
  margin: number
  sectionGap: number
}

export const PREDEFINED_TEMPLATES: Record<string, TemplateConfig> = {
  agence: {
    id: 'agence',
    name: 'Agence',
    description: 'Moderne et aéré, présentation premium',
    domain: 'Agences web, consultants, créatifs',
    primaryColor: '#e8571e',
    secondaryBg: '#fff5f2',
    headerBg: 'white',
    headerTextColor: '#111111',
    tableHeaderBg: '#e8571e',
    tableHeaderTextColor: 'white',
    headerStyle: 'clean',
    boxStyle: 'dashed',
    tableColumnsStyle: 'simple',
    stripeRows: false,
    totalStyle: 'darkbar',
    fontFamily: 'sans',
    partyLayout: 'two-boxes',
    rounded: false,
    baseFontSize: 9,
    titleFontSize: 32,
    margin: 40,
    sectionGap: 20,
  },
  artisan: {
    id: 'artisan',
    name: 'Artisan',
    description: 'Professionnel et détaillé, toutes colonnes',
    domain: 'BTP, plomberie, électricité, paysagisme',
    primaryColor: '#2563eb',
    secondaryBg: '#eff6ff',
    headerBg: '#2563eb',
    headerTextColor: 'white',
    tableHeaderBg: '#2563eb',
    tableHeaderTextColor: 'white',
    headerStyle: 'bar',
    boxStyle: 'solid',
    tableColumnsStyle: 'full',
    stripeRows: true,
    totalStyle: 'coloredbox',
    fontFamily: 'sans',
    partyLayout: 'two-boxes',
    rounded: false,
    baseFontSize: 9,
    titleFontSize: 15,
    margin: 40,
    sectionGap: 16,
  },
  minimaliste: {
    id: 'minimaliste',
    name: 'Minimaliste',
    description: 'Épuré et élégant, police serif raffinée',
    domain: 'Architectes, avocats, designers, libéraux',
    primaryColor: '#374151',
    secondaryBg: '#f9fafb',
    headerBg: 'white',
    headerTextColor: '#111111',
    tableHeaderBg: 'white',
    tableHeaderTextColor: '#374151',
    headerStyle: 'minimal',
    boxStyle: 'lines',
    tableColumnsStyle: 'full',
    stripeRows: false,
    totalStyle: 'inline',
    fontFamily: 'serif',
    partyLayout: 'two-boxes',
    rounded: false,
    baseFontSize: 9,
    titleFontSize: 26,
    margin: 50,
    sectionGap: 24,
  },
  premium: {
    id: 'premium',
    name: 'Premium',
    description: 'Luxueux et arrondi, serif haut de gamme',
    domain: 'Immobilier, automobile, prestige, hôtellerie',
    primaryColor: '#c9a24b',
    secondaryBg: '#faf6ec',
    headerBg: '#13131f',
    headerTextColor: 'white',
    tableHeaderBg: '#13131f',
    tableHeaderTextColor: '#c9a24b',
    headerStyle: 'dark',
    boxStyle: 'filled',
    tableColumnsStyle: 'full',
    stripeRows: false,
    totalStyle: 'darkbar',
    fontFamily: 'serif',
    partyLayout: 'banner',
    rounded: true,
    baseFontSize: 9,
    titleFontSize: 22,
    margin: 44,
    sectionGap: 18,
  },
  classique: {
    id: 'classique',
    name: 'Classique',
    description: 'Traditionnel et formel, blocs empilés serif',
    domain: 'Comptabilité, notaires, services, libéraux',
    primaryColor: '#1e3a5f',
    secondaryBg: '#eef2f7',
    headerBg: '#1e3a5f',
    headerTextColor: 'white',
    tableHeaderBg: '#1e3a5f',
    tableHeaderTextColor: 'white',
    headerStyle: 'bar',
    boxStyle: 'filled',
    tableColumnsStyle: 'full',
    stripeRows: true,
    totalStyle: 'coloredbox',
    fontFamily: 'serif',
    partyLayout: 'stacked',
    rounded: false,
    baseFontSize: 9,
    titleFontSize: 15,
    margin: 40,
    sectionGap: 14,
  },
}

export function getTemplateConfig(company: any): TemplateConfig {
  const style = company?.template_style || {}
  const id: string = style.template_id || 'agence'

  if (id === 'custom') {
    const base = PREDEFINED_TEMPLATES.artisan
    const primary = style.primary_color || base.primaryColor
    const hStyle: HeaderStyle = (style.header_style as HeaderStyle) || 'bar'
    const isColoredHeader = hStyle === 'bar' || hStyle === 'dark'
    return {
      ...base,
      id: 'custom',
      name: 'Personnalisé',
      description: 'Importé depuis votre modèle',
      primaryColor: primary,
      tableHeaderBg: hStyle === 'dark' ? '#13131f' : primary,
      headerBg: isColoredHeader ? (hStyle === 'dark' ? '#13131f' : primary) : 'white',
      headerTextColor: isColoredHeader ? 'white' : '#111111',
      headerStyle: hStyle,
      boxStyle: (style.box_style as BoxStyle) || base.boxStyle,
      tableColumnsStyle: (style.table_columns as TableColumnsStyle) || base.tableColumnsStyle,
      stripeRows: style.stripe_rows ?? base.stripeRows,
      totalStyle: (style.total_style as TotalStyle) || base.totalStyle,
      fontFamily: (style.font_family as FontFamily) || 'sans',
      partyLayout: (style.party_layout as PartyLayout) || 'two-boxes',
      rounded: style.rounded ?? false,
    }
  }

  const base = PREDEFINED_TEMPLATES[id] || PREDEFINED_TEMPLATES.agence

  const customColor = style.primary_color
  if (customColor && customColor !== base.primaryColor) {
    const isBarOrDark = base.headerStyle === 'bar'
    return {
      ...base,
      primaryColor: customColor,
      tableHeaderBg: base.headerStyle === 'dark' ? base.tableHeaderBg : customColor,
      headerBg: isBarOrDark ? customColor : base.headerBg,
    }
  }

  return base
}
