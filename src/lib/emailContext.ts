import type { SupabaseClient } from '@supabase/supabase-js'
import { clientDisplayName } from '@/lib/clients'

// Contexte métier d'un expéditeur d'email : sa fiche CRM + agrégats (devis en
// cours, à encaisser, chantiers). Partagé par la fiche contextuelle (UI) et par
// la rédaction IA des réponses (personnalisation factuelle).

export interface EmailClientContext {
  client: {
    id: string
    type: string
    name: string
    email: string | null
    phone: string | null
    status: string
    created_at: string
  } | null
  stats: {
    quotesPending: number
    quotesPendingAmount: number
    signedTotal: number
    unpaidAmount: number
    activeProjects: number
    lastContact: string | null
  }
  recentQuotes: { id: string; quote_number: string; status: string; total_ttc: number; valid_until: string | null }[]
  activeProjects: { id: string; title: string; status: string }[]
}

const CLOSED = ['termine', 'facture', 'paye', 'archive']
const num = (v: unknown) => Number(v) || 0

function emptyContext(): EmailClientContext {
  return {
    client: null,
    stats: { quotesPending: 0, quotesPendingAmount: 0, signedTotal: 0, unpaidAmount: 0, activeProjects: 0, lastContact: null },
    recentQuotes: [],
    activeProjects: [],
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function findClientContext(
  supabase: SupabaseClient,
  userId: string,
  email?: string | null,
  linkedClientId?: string | null,
): Promise<EmailClientContext> {
  // Résolution du client : id lié en priorité, sinon correspondance par email.
  let client: any = null
  if (linkedClientId) {
    const { data } = await supabase.from('clients').select('*').eq('id', linkedClientId).eq('user_id', userId).maybeSingle()
    client = data
  }
  if (!client && email) {
    const { data } = await supabase.from('clients').select('*').eq('user_id', userId).ilike('email', email).limit(1)
    client = data?.[0] || null
  }
  if (!client) return emptyContext()

  const [{ data: quotes }, { data: invoices }, { data: projects }] = await Promise.all([
    supabase.from('quotes').select('id, quote_number, status, total_ttc, valid_until, created_at').eq('user_id', userId).eq('client_id', client.id).order('created_at', { ascending: false }),
    supabase.from('invoices').select('status, total_ttc, amount_due, due_date, created_at').eq('user_id', userId).eq('client_id', client.id),
    supabase.from('projects').select('id, title, status, created_at').eq('user_id', userId).eq('client_id', client.id),
  ])

  const q = quotes || [], inv = invoices || [], pr = projects || []
  const pending = q.filter((x: any) => x.status === 'envoye')
  const signedTotal = q.filter((x: any) => x.status === 'accepte' || x.status === 'transforme').reduce((s: number, x: any) => s + num(x.total_ttc), 0)
  const unpaidAmount = inv
    .filter((x: any) => ['envoyee', 'en_retard', 'payee_partiellement'].includes(x.status))
    .reduce((s: number, x: any) => s + num(x.amount_due ?? x.total_ttc), 0)
  const active = pr.filter((x: any) => !CLOSED.includes(x.status))
  const dates = [...q, ...inv, ...pr].map((x: any) => x.created_at).filter(Boolean).sort() as string[]
  const lastContact = dates.length ? dates[dates.length - 1] : client.created_at

  return {
    client: {
      id: client.id, type: client.type, name: clientDisplayName(client),
      email: client.email, phone: client.phone, status: client.status, created_at: client.created_at,
    },
    stats: {
      quotesPending: pending.length,
      quotesPendingAmount: pending.reduce((s: number, x: any) => s + num(x.total_ttc), 0),
      signedTotal,
      unpaidAmount,
      activeProjects: active.length,
      lastContact,
    },
    recentQuotes: q.slice(0, 3).map((x: any) => ({ id: x.id, quote_number: x.quote_number, status: x.status, total_ttc: num(x.total_ttc), valid_until: x.valid_until })),
    activeProjects: active.slice(0, 3).map((x: any) => ({ id: x.id, title: x.title, status: x.status })),
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// Bloc de contexte injecté dans le prompt IA (données factuelles à exploiter).
export function clientContextPromptBlock(ctx: EmailClientContext): string {
  if (!ctx.client) return ''
  const c = ctx.client, s = ctx.stats
  const lines: string[] = ['CONTEXTE CLIENT (données RÉELLES de ton CRM — appuie-toi dessus précisément, mais n’invente jamais) :']
  lines.push(`- ${c.name}${c.type === 'professionnel' ? ' (professionnel)' : ''}`)
  if (s.quotesPending > 0) {
    const q = ctx.recentQuotes.find(x => x.status === 'envoye') || ctx.recentQuotes[0]
    const dateFr = q?.valid_until ? new Date(q.valid_until).toLocaleDateString('fr-FR') : null
    lines.push(`- ${s.quotesPending} devis en attente de réponse${q ? ` (ex : ${q.quote_number}, ${Math.round(q.total_ttc)} € TTC${dateFr ? `, valable jusqu’au ${dateFr}` : ''})` : ''}`)
  }
  if (s.signedTotal > 0) lines.push(`- déjà ${Math.round(s.signedTotal)} € de devis signés ensemble`)
  if (s.unpaidAmount > 0) lines.push(`- ${Math.round(s.unpaidAmount)} € de factures en attente de règlement`)
  if (s.activeProjects > 0) lines.push(`- ${s.activeProjects} chantier(s) en cours`)
  lines.push('Personnalise avec ce contexte (rappeler le devis en cours, proposer la suite) sans le réciter mécaniquement.')
  return lines.join('\n')
}
