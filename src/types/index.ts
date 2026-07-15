export type ClientType = 'particulier' | 'professionnel'

export type ClientStatus =
  | 'nouveau' | 'infos_a_recuperer' | 'devis_a_faire' | 'devis_envoye'
  | 'devis_accepte' | 'devis_refuse' | 'chantier_a_planifier'
  | 'chantier_en_cours' | 'facture_a_envoyer' | 'facture_envoyee'
  | 'paye' | 'termine' | 'archive'

export type ProjectStatus =
  | 'demande_recue' | 'visite_a_prevoir' | 'devis_a_faire' | 'devis_envoye'
  | 'devis_accepte' | 'a_planifier' | 'planifie' | 'en_cours' | 'en_pause'
  | 'termine' | 'a_facturer' | 'facture' | 'paye' | 'archive'

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

export interface Project {
  id: string
  user_id: string
  client_id?: string
  title: string
  description?: string
  address?: string
  project_type?: string
  status: ProjectStatus
  start_date?: string
  end_date?: string
  notes?: string
  created_at: string
  clients?: Client
}

export interface Employee {
  id: string
  user_id: string
  full_name: string
  role?: string
  skills: string[]
  phone?: string
  email?: string
  hourly_cost?: number
  color: string
  active: boolean
  notes?: string
  created_at: string
}

export interface Assignment {
  id: string
  user_id: string
  employee_id: string
  project_id: string
  date: string
  start_hour: number
  end_hour: number
  note?: string
  created_at: string
}

export interface TimeEntry {
  id: string
  user_id: string
  employee_id: string
  project_id?: string
  date: string
  hours: number
  note?: string
  status: 'declare' | 'valide' | 'refuse'
  created_at: string
}

export interface Vehicle {
  id: string
  user_id: string
  name: string
  plate?: string | null
  driver_employee_id?: string | null
  active: boolean
  notes?: string | null
  created_at: string
}

export interface VehicleLog {
  id: string
  user_id: string
  vehicle_id: string
  project_id?: string | null
  date: string
  hours_present: number
  km?: number | null
  note?: string | null
  created_at: string
}

export type BankTxStatus = 'a_rapprocher' | 'rapproche' | 'ignore'

export interface BankTransaction {
  id: string
  user_id: string
  tx_date?: string | null
  label?: string | null
  amount: number
  status: BankTxStatus
  matched_invoice_id?: string | null
  matched_client_id?: string | null
  imported_at: string
  created_at: string
}

export type PresenceType = 'arrivee' | 'depart' | 'pause' | 'reprise' | 'photo'

export interface PresenceEvent {
  id: string
  user_id: string
  employee_id?: string | null
  project_id?: string | null
  type: PresenceType
  photo_path?: string | null
  note?: string | null
  occurred_at: string
  created_at: string
}

export type ExpenseStatus = 'a_verifier' | 'valide' | 'envoye_comptable' | 'archive'
export type ExpenseSource = 'ticket' | 'banque' | 'manuel'

export interface Expense {
  id: string
  user_id: string
  project_id?: string
  supplier?: string
  expense_date?: string
  amount_ttc: number
  amount_ht: number
  vat_amount: number
  vat_rate?: number
  category?: string
  payment_method?: string
  ticket_number?: string
  storage_path?: string
  notes?: string
  status: ExpenseStatus
  source: ExpenseSource
  reconciled: boolean
  created_at: string
  projects?: Project
}

export interface Document {
  id: string
  user_id: string
  client_id?: string
  project_id?: string
  name: string
  category?: string
  storage_path: string
  file_type?: string
  file_size?: number
  notes?: string
  created_at: string
  clients?: Client
  projects?: Project
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
  reminded_at?: string | null
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

export type DocumentSignatureStatus = 'en_attente' | 'signee' | 'expiree' | 'annulee'

export interface DocumentSignature {
  id: string
  user_id: string
  quote_id?: string | null
  invoice_id?: string | null
  status: DocumentSignatureStatus
  signer_name?: string | null
  signer_email?: string | null
  signature_image?: string | null
  document_hash?: string | null
  signed_at?: string | null
  signer_ip?: string | null
  signer_user_agent?: string | null
  sent_at: string
  expires_at: string
  created_at: string
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

export type ConversationType = 'direct' | 'group'

export interface Conversation {
  id: string
  user_id: string
  type: ConversationType
  name?: string
  created_at: string
}

export interface ConversationParticipant {
  id: string
  conversation_id: string
  user_id: string
  employee_id: string
  created_at: string
  employees?: Employee
}

export type MessageSenderType = 'admin' | 'employee'

export interface Message {
  id: string
  conversation_id: string
  user_id: string
  sender_type: MessageSenderType
  sender_employee_id?: string
  body: string
  created_at: string
  audio_path?: string | null
  audio_mime?: string | null
  duration_sec?: number | null
  /** URL signée générée côté serveur à la lecture, jamais stockée en base. */
  audio_url?: string | null
}

// ── Sous-traitants ─────────────────────────────────────────────────────────
export type SubcontractorStatus = 'actif' | 'inactif' | 'liste_noire'

export type SubDocType =
  | 'attestation_vigilance' | 'urssaf' | 'kbis' | 'assurance_decennale' | 'rc_pro'
  | 'liste_salaries' | 'rib' | 'contrat' | 'devis' | 'autre'

export type SubContractStatus =
  | 'en_preparation' | 'signe' | 'en_cours' | 'termine' | 'annule'

export type SubInvoiceStatus = 'a_valider' | 'validee' | 'payee' | 'litige'

export interface Subcontractor {
  id: string
  user_id: string
  company_name: string
  trade?: string | null
  contact_name?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
  siret?: string | null
  vat_number?: string | null
  iban?: string | null
  insurance_decennale?: string | null
  insurance_expiry?: string | null
  hourly_rate?: number | null
  crew_size?: number | null
  rating?: number | null
  notes?: string | null
  status: SubcontractorStatus
  created_at: string
}

export interface SubcontractorDocument {
  id: string
  user_id: string
  subcontractor_id: string
  type: SubDocType
  name: string
  storage_path?: string | null
  expiry_date?: string | null
  created_at: string
}

export interface SubcontractorContract {
  id: string
  user_id: string
  subcontractor_id: string
  project_id?: string | null
  title: string
  description?: string | null
  amount_ht?: number | null
  sale_price_ht?: number | null
  retention_pct: number
  start_date?: string | null
  end_date?: string | null
  progress: number
  status: SubContractStatus
  created_at: string
}

export interface SubcontractorInvoice {
  id: string
  user_id: string
  subcontractor_id: string
  contract_id?: string | null
  project_id?: string | null
  number?: string | null
  amount_ht?: number | null
  amount_ttc?: number | null
  issue_date?: string | null
  due_date?: string | null
  storage_path?: string | null
  status: SubInvoiceStatus
  paid_at?: string | null
  created_at: string
}

export interface SubcontractorMessage {
  id: string
  user_id: string
  subcontractor_id: string
  body: string
  direction: 'sortant' | 'entrant'
  created_at: string
}
