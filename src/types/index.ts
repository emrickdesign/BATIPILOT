export type ClientType = 'particulier' | 'professionnel'

export type ClientStatus =
  | 'nouveau' | 'infos_a_recuperer' | 'devis_a_faire' | 'devis_envoye'
  | 'devis_accepte' | 'devis_refuse' | 'chantier_a_planifier'
  | 'chantier_en_cours' | 'facture_a_envoyer' | 'facture_envoyee'
  | 'paye' | 'termine' | 'archive'

export type QuoteStatus =
  | 'brouillon' | 'pret' | 'envoye' | 'accepte' | 'refuse' | 'expire' | 'transforme'

export type InvoiceStatus =
  | 'brouillon' | 'envoyee' | 'payee_partiellement' | 'payee' | 'en_retard' | 'annulee'

export type InvoiceType = 'complete' | 'acompte' | 'intermediaire' | 'solde'

export type EmailCategory =
  | 'demande_devis' | 'client_a_repondre' | 'relance_client' | 'fournisseur'
  | 'facture_recue' | 'document_admin' | 'chantier_en_cours'
  | 'pub_newsletter' | 'spam' | 'personnel' | 'a_verifier'

export type EmailImportance = 'urgent' | 'important' | 'normal' | 'faible' | 'ignorer'

export type Unit = 'm2' | 'ml' | 'u' | 'forfait' | 'h' | 'j' | 'piece'

export interface Company {
  id: string
  user_id: string
  trade_name: string
  legal_name?: string
  siret?: string
  vat_number?: string
  legal_status?: string
  address?: string
  phone?: string
  email?: string
  website?: string
  logo_url?: string
  insurance_decennale?: string
  insurance_rc?: string
  iban?: string
  payment_terms: string
  quote_validity_days: number
  default_deposit_percent: number
  default_vat_rate: number
  legal_mentions?: string
  created_at: string
}

export interface Client {
  id: string
  user_id: string
  type: ClientType
  first_name?: string
  last_name?: string
  company_name?: string
  email?: string
  phone?: string
  billing_address?: string
  site_address?: string
  siret?: string
  notes?: string
  status: ClientStatus
  created_at: string
}

export interface PriceCategory {
  id: string
  user_id: string
  name: string
  sort_order: number
  created_at: string
}

export interface PriceItem {
  id: string
  user_id: string
  category_id?: string
  name: string
  description?: string
  unit: Unit
  unit_price_ht: number
  vat_rate: number
  supply_included: boolean
  labor_included: boolean
  notes?: string
  is_active: boolean
  created_at: string
  price_categories?: PriceCategory
}

export interface QuoteLine {
  id: string
  quote_id: string
  price_item_id?: string
  category?: string
  designation: string
  description?: string
  quantity: number
  unit: Unit
  unit_price_ht: number
  vat_rate: number
  discount_percent: number
  total_ht: number
  sort_order: number
  needs_verification: boolean
}

export interface Quote {
  id: string
  user_id: string
  client_id?: string
  project_id?: string
  quote_number: string
  title?: string
  description?: string
  status: QuoteStatus
  issue_date: string
  valid_until?: string
  subtotal_ht: number
  total_vat: number
  total_ttc: number
  deposit_percent?: number
  deposit_amount?: number
  notes?: string
  internal_notes?: string
  legal_mentions?: string
  pdf_url?: string
  from_plan_analysis: boolean
  created_at: string
  updated_at: string
  clients?: Client
  quote_lines?: QuoteLine[]
}

export interface Invoice {
  id: string
  user_id: string
  client_id?: string
  project_id?: string
  quote_id?: string
  invoice_number: string
  type: InvoiceType
  status: InvoiceStatus
  issue_date: string
  due_date?: string
  subtotal_ht: number
  total_vat: number
  total_ttc: number
  deposit_already_paid: number
  amount_due: number
  legal_mentions?: string
  pdf_url?: string
  created_at: string
  clients?: Client
}

export interface Email {
  id: string
  user_id: string
  gmail_message_id: string
  thread_id?: string
  from_email?: string
  from_name?: string
  subject?: string
  body_text?: string
  received_at?: string
  category?: EmailCategory
  importance?: EmailImportance
  ai_summary?: string
  ai_recommended_action?: string
  ai_explanation?: string
  status: string
  linked_client_id?: string
  linked_quote_id?: string
  created_at: string
}
