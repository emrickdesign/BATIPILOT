// Client GoCardless Bank Account Data (ex-Nordigen) — agrégateur DSP2 lecture seule.
// Docs : https://developer.gocardless.com/bank-account-data/
// Nécessite les variables d'env GOCARDLESS_SECRET_ID et GOCARDLESS_SECRET_KEY.

const BASE = 'https://bankaccountdata.gocardless.com/api/v2'

export function gocardlessConfigured(): boolean {
  return !!(process.env.GOCARDLESS_SECRET_ID && process.env.GOCARDLESS_SECRET_KEY)
}

// Jeton d'accès (courte durée) — obtenu à chaque appel serveur (pas de cache persistant).
async function getAccessToken(): Promise<string> {
  const res = await fetch(`${BASE}/token/new/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      secret_id: process.env.GOCARDLESS_SECRET_ID,
      secret_key: process.env.GOCARDLESS_SECRET_KEY,
    }),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`GoCardless token: ${res.status} ${await res.text()}`)
  const json = await res.json()
  return json.access as string
}

async function api<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      accept: 'application/json',
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`GoCardless ${path}: ${res.status} ${await res.text()}`)
  return res.json() as Promise<T>
}

export type Institution = { id: string; name: string; bic?: string; logo?: string }

export async function listInstitutions(country = 'fr'): Promise<Institution[]> {
  const token = await getAccessToken()
  return api<Institution[]>(`/institutions/?country=${country}`, token)
}

// Crée une "requisition" = demande de connexion à une banque. Renvoie le lien
// vers lequel rediriger l'admin (il s'authentifie chez SA banque).
export async function createRequisition(opts: {
  institutionId: string; redirect: string; reference: string
}): Promise<{ id: string; link: string }> {
  const token = await getAccessToken()
  const json = await api<{ id: string; link: string }>(`/requisitions/`, token, {
    method: 'POST',
    body: JSON.stringify({
      redirect: opts.redirect,
      institution_id: opts.institutionId,
      reference: opts.reference,
      user_language: 'FR',
    }),
  })
  return { id: json.id, link: json.link }
}

export async function getRequisition(id: string): Promise<{ status: string; accounts: string[]; institution_id: string }> {
  const token = await getAccessToken()
  return api(`/requisitions/${id}/`, token)
}

export async function getAccountMeta(accountId: string): Promise<{ iban?: string; institution_id?: string; currency?: string; ownerName?: string }> {
  const token = await getAccessToken()
  return api(`/accounts/${accountId}/`, token)
}

export type BookedTx = {
  transactionId?: string
  internalTransactionId?: string
  bookingDate?: string
  valueDate?: string
  transactionAmount: { amount: string; currency: string }
  remittanceInformationUnstructured?: string
  remittanceInformationUnstructuredArray?: string[]
  debtorName?: string
  debtorAccount?: { iban?: string }
}

export async function getAccountTransactions(accountId: string): Promise<BookedTx[]> {
  const token = await getAccessToken()
  const json = await api<{ transactions: { booked: BookedTx[]; pending: BookedTx[] } }>(
    `/accounts/${accountId}/transactions/`, token,
  )
  return json.transactions?.booked || []
}
