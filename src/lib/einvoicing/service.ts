// Facture électronique : connexion à la plateforme agréée (PA), transmission des factures
// et suivi de leur cycle de vie. SERVEUR UNIQUEMENT.
// La table einvoicing_connections n'est lisible que par le service_role : les secrets
// (chiffrés) ne transitent jamais par le navigateur.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/service'
import { decryptSecret, encryptSecret } from '@/lib/crypto/secrets'
import { generateFacturX } from '@/lib/pdf-generator'
import { loadFacturXContext, type ComplianceIssue } from '@/lib/facturx/model'
import { phasesBefore } from '@/lib/clients'
import { canSendAgain, isSettled, type EInvoiceStatus } from './status'
import type { ConnectorId } from './providers'
import { pennylaneImportInvoice, pennylaneInvoiceStatus, pennylaneRefresh, pennylaneRevoke, type PennylaneCredentials } from './pennylane'
import { afnorFlowStatus, afnorSubmitInvoice, type AfnorConfig } from './afnor'

const TABLE = 'einvoicing_connections'

export type AuthType = 'api_token' | 'oauth' | 'client_credentials'

interface ConnectionRow {
  user_id: string
  provider: ConnectorId
  auth_type: AuthType
  credentials: string
  config: Record<string, unknown>
  account_label: string | null
  auto_send: boolean
  last_error: string | null
  connected_at: string
}

/** Vue sans secret, pour l'interface. */
export interface ConnectionInfo {
  provider: ConnectorId
  authType: AuthType
  accountLabel: string | null
  autoSend: boolean
  lastError: string | null
  connectedAt: string
  flowUrl?: string
}

async function getConnectionRow(userId: string): Promise<ConnectionRow | null> {
  const { data } = await createServiceClient().from(TABLE).select('*').eq('user_id', userId).maybeSingle()
  return (data as ConnectionRow | null) ?? null
}

export async function getConnectionInfo(userId: string): Promise<ConnectionInfo | null> {
  const row = await getConnectionRow(userId)
  if (!row) return null
  return {
    provider: row.provider,
    authType: row.auth_type,
    accountLabel: row.account_label,
    autoSend: row.auto_send,
    lastError: row.last_error,
    connectedAt: row.connected_at,
    flowUrl: typeof row.config?.flowUrl === 'string' ? row.config.flowUrl : undefined,
  }
}

export async function saveConnection(userId: string, input: {
  provider: ConnectorId; authType: AuthType; credentials: unknown
  config?: Record<string, unknown>; accountLabel: string
}): Promise<void> {
  const existing = await getConnectionRow(userId)
  const now = new Date().toISOString()
  const { error } = await createServiceClient().from(TABLE).upsert({
    user_id: userId,
    provider: input.provider,
    auth_type: input.authType,
    credentials: encryptSecret(input.credentials),
    config: input.config || {},
    account_label: input.accountLabel,
    auto_send: existing?.auto_send ?? true,
    last_error: null,
    connected_at: now,
    updated_at: now,
  }, { onConflict: 'user_id' })
  if (error) throw new Error('Enregistrement de la connexion impossible.')
}

export async function setAutoSend(userId: string, autoSend: boolean): Promise<void> {
  await createServiceClient().from(TABLE).update({ auto_send: autoSend, updated_at: new Date().toISOString() }).eq('user_id', userId)
}

export async function deleteConnection(userId: string): Promise<void> {
  const row = await getConnectionRow(userId)
  if (!row) return
  if (row.provider === 'pennylane' && row.auth_type === 'oauth') {
    try { await pennylaneRevoke(decryptSecret<PennylaneCredentials & { kind: 'oauth' }>(row.credentials).refresh_token) } catch { /* best-effort */ }
  }
  await createServiceClient().from(TABLE).delete().eq('user_id', userId)
}

// ─── Accès aux plateformes ───

async function pennylaneToken(row: ConnectionRow): Promise<string> {
  const creds = decryptSecret<PennylaneCredentials>(row.credentials)
  if (creds.kind === 'api_token') return creds.token
  if (creds.expires_at > Date.now() + 60_000) return creds.access_token
  const fresh = await pennylaneRefresh(creds.refresh_token)
  await createServiceClient().from(TABLE).update({ credentials: encryptSecret(fresh), updated_at: new Date().toISOString() }).eq('user_id', row.user_id)
  return fresh.access_token
}

function afnorConfig(row: ConnectionRow): AfnorConfig {
  const { clientSecret } = decryptSecret<{ clientSecret: string }>(row.credentials)
  const c = row.config as { flowUrl?: string; tokenUrl?: string; clientId?: string }
  return { flowUrl: c.flowUrl || '', tokenUrl: c.tokenUrl || '', clientId: c.clientId || '', clientSecret }
}

async function markConnectionError(userId: string, message: string | null) {
  await createServiceClient().from(TABLE).update({ last_error: message, updated_at: new Date().toISOString() }).eq('user_id', userId)
}

async function recordStatus(
  supabase: SupabaseClient, userId: string, invoiceId: string, provider: ConnectorId,
  status: EInvoiceStatus, message: string | null, externalId?: string | null, sent = false,
) {
  const now = new Date().toISOString()
  const patch: Record<string, unknown> = {
    einvoice_status: status, einvoice_provider: provider, einvoice_message: message, einvoice_updated_at: now,
  }
  if (externalId !== undefined) patch.einvoice_external_id = externalId
  if (sent) patch.einvoice_sent_at = now
  await supabase.from('invoices').update(patch).eq('id', invoiceId).eq('user_id', userId)
  await supabase.from('einvoice_events').insert({ user_id: userId, invoice_id: invoiceId, provider, status, message })
}

// ─── Transmission ───

export type TransmitResult =
  | { ok: true; status: EInvoiceStatus; provider: ConnectorId }
  | { ok: false; skipped?: boolean; error: string; issues?: ComplianceIssue[] }

/**
 * Génère la facture Factur-X et la dépose sur la plateforme agréée de l'utilisateur.
 * `auto` : appel déclenché par l'envoi de la facture (respecte le réglage « envoi automatique »,
 * et ne fait rien pour un client particulier ou une facture déjà transmise).
 */
export async function transmitInvoice(supabase: SupabaseClient, userId: string, invoiceId: string, opts: { auto?: boolean } = {}): Promise<TransmitResult> {
  const row = await getConnectionRow(userId)
  if (!row) return { ok: false, skipped: true, error: 'Aucune plateforme agréée connectée.' }
  if (opts.auto && !row.auto_send) return { ok: false, skipped: true, error: 'Envoi automatique désactivé.' }

  const [{ data: invoice }, { data: company }] = await Promise.all([
    supabase.from('invoices').select('*, clients(*), invoice_lines(*)').eq('id', invoiceId).eq('user_id', userId).single(),
    supabase.from('companies').select('*').eq('user_id', userId).single(),
  ])
  if (!invoice) return { ok: false, error: 'Facture introuvable.' }
  if (invoice.status === 'annulee') return { ok: false, error: 'Facture annulée : rien à transmettre.' }
  if (!canSendAgain(invoice.einvoice_status)) return { ok: false, skipped: opts.auto, error: 'Cette facture a déjà été transmise à la plateforme.' }

  const fx = await generateFacturX(invoice, company, undefined, await loadFacturXContext(supabase, invoice))
  if (fx.b2c) return { ok: false, skipped: true, error: 'Client particulier : la facture électronique ne concerne que les clients professionnels.' }
  const blocking = fx.issues.filter(i => i.level === 'error')
  if (blocking.length) return { ok: false, error: 'Des informations obligatoires manquent pour transmettre cette facture.', issues: blocking }

  const filename = `${invoice.invoice_number}.pdf`.replace(/[^\w.-]+/g, '_')
  let externalId: string
  try {
    if (row.provider === 'pennylane') {
      externalId = String((await pennylaneImportInvoice(await pennylaneToken(row), fx.pdf, filename)).id)
    } else {
      externalId = (await afnorSubmitInvoice(afnorConfig(row), fx.pdf, filename, invoice.id)).flowId
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Envoi impossible.'
    await recordStatus(supabase, userId, invoice.id, row.provider, 'erreur', message, null)
    await markConnectionError(userId, message)
    return { ok: false, error: message }
  }

  await recordStatus(supabase, userId, invoice.id, row.provider, 'en_cours', null, externalId, true)
  if (row.last_error) await markConnectionError(userId, null)
  // Déposée sur la plateforme = émise vers le client : la facture passe « envoyée ».
  if (invoice.status === 'brouillon') {
    await supabase.from('invoices').update({ status: 'envoyee' }).eq('id', invoice.id)
    if (invoice.client_id) {
      await supabase.from('clients').update({ status: 'facture_envoyee' })
        .eq('id', invoice.client_id).in('status', phasesBefore('facture_envoyee'))
    }
  }
  return { ok: true, status: 'en_cours', provider: row.provider }
}

/** Interroge la plateforme et enregistre le nouveau statut s'il a changé. */
export async function refreshInvoiceStatus(supabase: SupabaseClient, userId: string, invoiceId: string): Promise<{ status: string | null; message: string | null; changed: boolean }> {
  const { data: inv } = await supabase.from('invoices')
    .select('einvoice_status, einvoice_provider, einvoice_external_id, einvoice_message')
    .eq('id', invoiceId).eq('user_id', userId).single()
  const unchanged = { status: inv?.einvoice_status ?? null, message: inv?.einvoice_message ?? null, changed: false }
  if (!inv?.einvoice_external_id || isSettled(inv.einvoice_status)) return unchanged
  const row = await getConnectionRow(userId)
  if (!row || row.provider !== inv.einvoice_provider) return unchanged

  const next = row.provider === 'pennylane'
    ? await pennylaneInvoiceStatus(await pennylaneToken(row), inv.einvoice_external_id)
    : await afnorFlowStatus(afnorConfig(row), inv.einvoice_external_id)
  const message = next.message ?? null
  if (next.status === inv.einvoice_status && message === inv.einvoice_message) return unchanged
  await recordStatus(supabase, userId, invoiceId, row.provider, next.status, message)
  return { status: next.status, message, changed: true }
}
