// Connecteur Pennylane (plateforme agréée) — API Company v2. SERVEUR UNIQUEMENT.
// Deux façons de se connecter :
//  - token API généré par l'utilisateur (Paramètres › Connectivité › Développeurs) ;
//  - OAuth 2.0 « Se connecter avec Pennylane », actif dès que PENNYLANE_CLIENT_ID /
//    PENNYLANE_CLIENT_SECRET sont renseignés (identifiants d'application partenaire Pennylane).
// Envoi : import du PDF Factur-X avec send_to_pa=true → Pennylane le dépose comme PA.

import type { EInvoiceStatus } from './status'

const API = 'https://app.pennylane.com/api/external/v2'
const OAUTH = 'https://app.pennylane.com/oauth'
export const PENNYLANE_SCOPES = 'customer_invoices:all customers:all'

export type PennylaneCredentials =
  | { kind: 'api_token'; token: string }
  | { kind: 'oauth'; access_token: string; refresh_token: string; expires_at: number }

export class PennylaneError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

function errorMessage(body: unknown, status: number): string {
  const b = (body || {}) as { error?: unknown; message?: unknown; errors?: unknown }
  const raw = typeof b.error === 'string' ? b.error : typeof b.message === 'string' ? b.message : Array.isArray(b.errors) ? b.errors.join(', ') : ''
  if (status === 401) return 'Pennylane refuse l’accès : token invalide ou expiré.'
  if (status === 403) return `Pennylane : droits insuffisants${raw ? ` (${raw})` : ''}. Le token doit avoir l’accès en écriture aux factures clients.`
  return raw ? `Pennylane : ${raw}` : `Pennylane a répondu une erreur ${status}.`
}

async function call<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(init.headers || {}) },
    cache: 'no-store',
  })
  const text = await res.text()
  let body: unknown = null
  try { body = text ? JSON.parse(text) : null } catch { body = null }
  if (!res.ok) throw new PennylaneError(res.status, errorMessage(body, res.status))
  return body as T
}

/** Vérifie le token et renvoie le nom du compte (entreprise) connecté. */
export async function pennylaneAccount(token: string): Promise<string> {
  const me = await call<Record<string, unknown>>(token, '/me')
  const company = (me?.company || {}) as { name?: string }
  const user = (me?.user || {}) as { email?: string }
  return company.name || user.email || 'Compte Pennylane'
}

/** Importe le PDF Factur-X comme facture client et demande l'envoi à la plateforme agréée. */
export async function pennylaneImportInvoice(token: string, pdf: Buffer, filename: string): Promise<{ id: number; url?: string }> {
  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(pdf)], { type: 'application/pdf' }), filename)
  form.append('send_to_pa', 'true')
  return call(token, '/customer_invoices/e_invoices/imports', { method: 'POST', body: form })
}

type PennylaneInvoice = {
  e_invoicing?: { status?: string | null; reason?: string | null } | null
  schematron_validation_status?: 'pending' | 'valid' | 'invalid' | null
}

const STATUS_MAP: Record<string, EInvoiceStatus> = {
  submitted: 'deposee', sent: 'emise', accepted: 'prise_en_charge', approved: 'approuvee',
  in_dispute: 'en_litige', refused: 'refusee', rejected: 'rejetee',
  partially_collected: 'encaissee_partiellement', collected: 'encaissee',
}

/** Statut de la facture sur la plateforme (null = pas encore déposée). */
export async function pennylaneInvoiceStatus(token: string, id: string): Promise<{ status: EInvoiceStatus; message?: string }> {
  const inv = await call<PennylaneInvoice>(token, `/customer_invoices/${encodeURIComponent(id)}`)
  const raw = inv.e_invoicing?.status
  if (raw && STATUS_MAP[raw]) return { status: STATUS_MAP[raw], message: inv.e_invoicing?.reason || undefined }
  if (inv.schematron_validation_status === 'invalid') {
    return { status: 'rejetee', message: 'Pennylane juge les données de la facture invalides : vérifiez-la dans Pennylane.' }
  }
  return { status: 'en_cours' }
}

// ─── OAuth (application partenaire) ───

export const pennylaneOAuthConfigured = () => !!(process.env.PENNYLANE_CLIENT_ID && process.env.PENNYLANE_CLIENT_SECRET)

export function pennylaneAuthorizeUrl(state: string, redirectUri: string): string {
  const q = new URLSearchParams({
    client_id: process.env.PENNYLANE_CLIENT_ID || '',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: PENNYLANE_SCOPES,
    state,
  })
  return `${OAUTH}/authorize?${q}`
}

async function tokenRequest(params: Record<string, string>): Promise<PennylaneCredentials & { kind: 'oauth' }> {
  const res = await fetch(`${OAUTH}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      ...params,
      client_id: process.env.PENNYLANE_CLIENT_ID || '',
      client_secret: process.env.PENNYLANE_CLIENT_SECRET || '',
    }),
    cache: 'no-store',
  })
  const body = await res.json().catch(() => ({})) as { access_token?: string; refresh_token?: string; expires_in?: number; error_description?: string }
  if (!res.ok || !body.access_token) throw new PennylaneError(res.status, body.error_description || 'Connexion Pennylane refusée.')
  return {
    kind: 'oauth',
    access_token: body.access_token,
    refresh_token: body.refresh_token || params.refresh_token || '',
    expires_at: Date.now() + (body.expires_in || 86400) * 1000,
  }
}

export const pennylaneExchangeCode = (code: string, redirectUri: string) =>
  tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri })

export const pennylaneRefresh = (refreshToken: string) =>
  tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken })

export async function pennylaneRevoke(token: string): Promise<void> {
  if (!pennylaneOAuthConfigured()) return
  await fetch(`${OAUTH}/revoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token, client_id: process.env.PENNYLANE_CLIENT_ID || '', client_secret: process.env.PENNYLANE_CLIENT_SECRET || '' }),
  }).catch(() => undefined)
}
