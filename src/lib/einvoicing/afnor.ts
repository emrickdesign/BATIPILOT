// Connecteur générique « API AFNOR » (norme XP Z12-013, service Flux) : l'API standard
// que les plateformes agréées exposent aux logiciels. Un seul connecteur pour toute PA
// compatible : l'utilisateur colle l'URL du service Flux, l'URL du jeton OAuth et ses
// identifiants client. SERVEUR UNIQUEMENT.

import { createHash } from 'crypto'
import type { EInvoiceStatus } from './status'

export interface AfnorConfig {
  flowUrl: string   // ex. https://api.ma-plateforme.fr/flow-service
  tokenUrl: string  // ex. https://auth.ma-plateforme.fr/oauth/token
  clientId: string
  clientSecret: string
}

export class AfnorError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

const base = (cfg: AfnorConfig) => cfg.flowUrl.replace(/\/+$/, '')

/** Adresse saisie par l'utilisateur : https public uniquement (pas de réseau interne). */
export function isPublicHttpsUrl(value: string): boolean {
  let url: URL
  try { url = new URL(value) } catch { return false }
  if (url.protocol !== 'https:') return false
  const host = url.hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) return false
  if (/^\[?[0-9a-f:]+\]?$/.test(host) && host.includes(':')) return false // IPv6 littérale
  const ip = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host)
  if (ip) {
    const [a, b] = [Number(ip[1]), Number(ip[2])]
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) return false
  }
  return true
}

/** Jeton OAuth2 « client credentials » (Basic, puis identifiants dans le corps si refusé). */
async function accessToken(cfg: AfnorConfig): Promise<string> {
  const attempt = async (basic: boolean) => {
    const body = new URLSearchParams({ grant_type: 'client_credentials' })
    const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }
    if (basic) headers.Authorization = `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64')}`
    else { body.set('client_id', cfg.clientId); body.set('client_secret', cfg.clientSecret) }
    return fetch(cfg.tokenUrl, { method: 'POST', headers, body, cache: 'no-store' })
  }
  let res = await attempt(true)
  if (res.status === 400 || res.status === 401) res = await attempt(false)
  const json = await res.json().catch(() => ({})) as { access_token?: string; error_description?: string; error?: string }
  if (!res.ok || !json.access_token) {
    throw new AfnorError(res.status, `Identifiants refusés par la plateforme${json.error_description || json.error ? ` (${json.error_description || json.error})` : ''}.`)
  }
  return json.access_token
}

async function call<T>(cfg: AfnorConfig, path: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken(cfg)
  const res = await fetch(`${base(cfg)}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Request-Id': crypto.randomUUID(), ...(init.headers || {}) },
    cache: 'no-store',
  })
  const text = await res.text()
  let body: unknown = null
  try { body = text ? JSON.parse(text) : null } catch { body = null }
  if (!res.ok) {
    const b = (body || {}) as { errorMessage?: string; message?: string; detail?: string }
    throw new AfnorError(res.status, `Plateforme : ${b.errorMessage || b.message || b.detail || `erreur ${res.status}`}`)
  }
  return body as T
}

/** Teste les identifiants (jeton) et la disponibilité du service Flux. */
export async function afnorCheck(cfg: AfnorConfig): Promise<void> {
  await call(cfg, '/v1/healthcheck')
}

/** Dépose la facture Factur-X (flux B2B). Renvoie l'identifiant du flux. */
export async function afnorSubmitInvoice(cfg: AfnorConfig, pdf: Buffer, filename: string, trackingId: string): Promise<{ flowId: string }> {
  const flowInfo = {
    trackingId,
    name: filename,
    processingRule: 'B2B',
    flowSyntax: 'Factur-X',
    flowProfile: 'CIUS',
    sha256: createHash('sha256').update(pdf).digest('hex'),
  }
  const form = new FormData()
  form.append('flowInfo', new Blob([JSON.stringify(flowInfo)], { type: 'application/json' }))
  form.append('file', new Blob([new Uint8Array(pdf)], { type: 'application/pdf' }), filename)
  const res = await call<{ flowId?: string }>(cfg, '/v1/flows', { method: 'POST', body: form })
  if (!res?.flowId) throw new AfnorError(502, 'La plateforme n’a pas renvoyé d’identifiant de dépôt.')
  return { flowId: res.flowId }
}

type Flow = { acknowledgement?: { status?: 'Pending' | 'Ok' | 'Error'; details?: { reasonMessage?: string; reasonCode?: string }[] } }

/** Accusé de dépôt du flux : en attente / déposé / rejeté (avec motif). */
export async function afnorFlowStatus(cfg: AfnorConfig, flowId: string): Promise<{ status: EInvoiceStatus; message?: string }> {
  const flow = await call<Flow>(cfg, `/v1/flows/${encodeURIComponent(flowId)}?docType=Metadata`)
  const ack = flow.acknowledgement
  if (ack?.status === 'Ok') return { status: 'deposee' }
  if (ack?.status === 'Error') {
    const reasons = (ack.details || []).map(d => d.reasonMessage || d.reasonCode).filter(Boolean).join(' · ')
    return { status: 'rejetee', message: reasons || 'Rejet de la plateforme.' }
  }
  return { status: 'en_cours' }
}
