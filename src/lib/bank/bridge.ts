// Connecteur Bridge (bridgeapi.io) — agrégateur bancaire DSP2, API v3.
// Docs : https://docs.bridgeapi.io/  — auth par headers app + token utilisateur.
// Variables d'env : BRIDGE_CLIENT_ID, BRIDGE_CLIENT_SECRET.

const BASE = 'https://api.bridgeapi.io/v3'
const VERSION = '2025-01-15'

export function bankConfigured(): boolean {
  return !!(process.env.BRIDGE_CLIENT_ID && process.env.BRIDGE_CLIENT_SECRET)
}

function appHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    'Client-Id': process.env.BRIDGE_CLIENT_ID || '',
    'Client-Secret': process.env.BRIDGE_CLIENT_SECRET || '',
    'Bridge-Version': VERSION,
    'Content-Type': 'application/json',
    accept: 'application/json',
    ...(extra || {}),
  }
}

async function call<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, headers, ...rest } = init
  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    headers: appHeaders({ ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(headers as Record<string, string>) }),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Bridge ${path}: ${res.status} ${await res.text()}`)
  return res.json() as Promise<T>
}

// Crée l'utilisateur Bridge (idempotent : ignore le conflit s'il existe déjà).
export async function ensureUser(externalUserId: string): Promise<void> {
  try {
    await call('/aggregation/users', { method: 'POST', body: JSON.stringify({ external_user_id: externalUserId }) })
  } catch (e) {
    // 409 = déjà créé → on continue.
    if (!String((e as Error).message).includes(': 409')) throw e
  }
}

// Jeton utilisateur (nécessaire pour connect-session + lecture des données).
export async function getUserToken(externalUserId: string): Promise<string> {
  const json = await call<{ access_token: string }>('/aggregation/authorization/token', {
    method: 'POST', body: JSON.stringify({ external_user_id: externalUserId }),
  })
  return json.access_token
}

// Session de connexion : renvoie l'URL du tunnel Bridge (choix banque + auth).
export async function createConnectSession(token: string, opts: {
  userEmail: string; callbackUrl: string; context?: string
}): Promise<{ id: string; url: string }> {
  return call('/aggregation/connect-sessions', {
    method: 'POST', token,
    body: JSON.stringify({
      user_email: opts.userEmail,
      callback_url: opts.callbackUrl,
      country_code: 'FR',
      account_types: 'all',
      ...(opts.context ? { context: opts.context } : {}),
    }),
  })
}

export type BridgeAccount = { id: number; name?: string; iban?: string; currency_code?: string }

export async function listAccounts(token: string): Promise<BridgeAccount[]> {
  const json = await call<{ resources: BridgeAccount[] }>('/aggregation/accounts', { token })
  return json.resources || []
}

export type BridgeTx = {
  id: number
  amount: number
  date?: string
  clean_description?: string
  provider_description?: string
  currency_code?: string
  account_id?: number
}

// Liste les transactions de l'utilisateur depuis une date (pagination suivie, bornée).
export async function listTransactions(token: string, minDate?: string): Promise<BridgeTx[]> {
  const out: BridgeTx[] = []
  let path: string | null = `/aggregation/transactions?limit=500${minDate ? `&min_date=${minDate}` : ''}`
  let guard = 0
  while (path && guard < 6) {
    const json: { resources: BridgeTx[]; pagination?: { next_uri?: string | null } } = await call(path, { token })
    out.push(...(json.resources || []))
    const next = json.pagination?.next_uri || null
    path = next ? next.replace(/^.*\/v3/, '') : null
    guard++
  }
  return out
}
