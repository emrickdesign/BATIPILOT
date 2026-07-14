import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, User, HardHat, Users2, Banknote, Coins } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { clientDisplayName } from '@/lib/clients'
import StatCard from '@/components/charts/StatCard'
import ClientsKanban from './ClientsKanban'
import { CLIENT_COLUMNS, type ClientCard } from './kanban-config'
import type { Client, ClientStatus } from '@/types'

const num = (v: unknown) => Number(v) || 0
const PROSPECT_OR_ARCHIVE = '(nouveau,infos_a_recuperer,devis_a_faire,devis_envoye,devis_refuse,archive)'

function waLink(phone?: string | null) {
  if (!phone) return null
  let p = phone.replace(/\D/g, '')
  if (p.startsWith('0')) p = '33' + p.slice(1)
  return p.length >= 8 ? `https://wa.me/${p}` : null
}

function cityOf(addr?: string | null): string {
  if (!addr) return ''
  const m = addr.match(/\b\d{5}\s+([A-Za-zÀ-ÿ'’\- ]+)/)
  if (m) return m[1].trim().split(/[\n,]/)[0].trim()
  const parts = addr.split(',').map(s => s.trim()).filter(Boolean)
  return parts.length ? parts[parts.length - 1] : ''
}

function lastContact(d?: string | null): string {
  if (!d) return '—'
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000)
  if (days <= 0) return "aujourd'hui"
  if (days === 1) return 'hier'
  if (days < 30) return `il y a ${days} j`
  if (days < 365) return `il y a ${Math.floor(days / 30)} mois`
  return `il y a ${Math.floor(days / 365)} an${days >= 730 ? 's' : ''}`
}

export default async function ClientsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Les prospects (leads pas encore convertis) ont leur propre onglet.
  const [{ data: clients }, { data: projects }, { data: invoices }, { data: quotes }, { data: emails }] = await Promise.all([
    supabase.from('clients').select('*').eq('user_id', user.id).not('status', 'in', PROSPECT_OR_ARCHIVE).order('created_at', { ascending: false }),
    supabase.from('projects').select('client_id, status, created_at').eq('user_id', user.id).neq('status', 'archive'),
    supabase.from('invoices').select('client_id, status, total_ttc, amount_due, created_at').eq('user_id', user.id),
    supabase.from('quotes').select('client_id, created_at').eq('user_id', user.id),
    supabase.from('emails').select('linked_client_id, received_at').eq('user_id', user.id),
  ])

  const list = (clients as Client[]) || []
  const isOpen = (s: string) => s === 'envoyee' || s === 'en_retard' || s === 'payee_partiellement'

  // Agrégats par client
  const nbChantiers = new Map<string, number>()
  const lastDate = new Map<string, string>()
  const bump = (id: string | null | undefined, d?: string | null) => {
    if (!id || !d) return
    const cur = lastDate.get(id)
    if (!cur || d > cur) lastDate.set(id, d)
  }
  for (const p of projects || []) { if (p.client_id) { nbChantiers.set(p.client_id, (nbChantiers.get(p.client_id) || 0) + 1); bump(p.client_id, p.created_at) } }
  for (const q of quotes || []) bump(q.client_id, q.created_at)
  for (const e of emails || []) bump(e.linked_client_id, e.received_at)

  const totalFacture = new Map<string, number>()
  const resteAEncaisser = new Map<string, number>()
  for (const i of invoices || []) {
    if (!i.client_id) continue
    bump(i.client_id, i.created_at)
    if (i.status !== 'brouillon') totalFacture.set(i.client_id, (totalFacture.get(i.client_id) || 0) + num(i.total_ttc))
    if (isOpen(i.status)) resteAEncaisser.set(i.client_id, (resteAEncaisser.get(i.client_id) || 0) + (num(i.amount_due) || num(i.total_ttc)))
  }

  const caTotal = [...totalFacture.values()].reduce((s, v) => s + v, 0)
  const resteTotal = [...resteAEncaisser.values()].reduce((s, v) => s + v, 0)
  const chantiersTotal = [...nbChantiers.values()].reduce((s, v) => s + v, 0)

  // Données du Kanban (sérialisables) — chaque client est rangé dans sa colonne de phase.
  const colOf = (status: string): ClientStatus | null =>
    CLIENT_COLUMNS.find(c => c.key === status || (c.extra?.includes(status as ClientStatus) ?? false))?.key ?? null
  const kanbanItems: ClientCard[] = list.flatMap(client => {
    const col = colOf(client.status)
    if (!col) return []
    const reste = resteAEncaisser.get(client.id) || 0
    return [{
      id: client.id,
      col,
      status: client.status as ClientStatus,
      isPro: client.type === 'professionnel',
      name: clientDisplayName(client),
      ville: cityOf(client.billing_address || client.site_address),
      phone: client.phone ?? null,
      email: client.email ?? null,
      waHref: waLink(client.phone),
      facture: formatCurrency(totalFacture.get(client.id) || 0),
      reste: reste > 0 ? formatCurrency(reste) : null,
      chantiers: nbChantiers.get(client.id) || 0,
      contact: lastContact(lastDate.get(client.id)),
    }]
  })

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-[26px] font-bold font-heading text-marine">Mes clients</h1>
          <p className="text-gray-500 mt-1 text-sm">
            Vos clients convertis. Les pistes sont dans <Link href="/prospects" className="text-primary hover:underline">Prospects</Link>.
          </p>
        </div>
        <Link href="/clients/nouveau">
          <Button className="h-10 gap-2 shadow-sm"><Plus className="w-4 h-4" /> Ajouter un client</Button>
        </Link>
      </div>

      {list.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Clients" value={String(list.length)} icon={Users2} tone="coral" note="clients actifs" />
          <StatCard label="Total facturé" value={formatCurrency(caTotal)} icon={Banknote} tone="green" />
          <StatCard label="Reste à encaisser" value={formatCurrency(resteTotal)} icon={Coins} tone="amber" />
          <StatCard label="Chantiers" value={String(chantiersTotal)} icon={HardHat} tone="terre" note="tous clients" />
        </div>
      )}

      {!list.length ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            <User className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="font-medium">Aucun client pour l&apos;instant</p>
            <p className="text-sm mt-1">Ajoutez votre premier client pour commencer</p>
            <Link href="/clients/nouveau" className="mt-4 inline-block"><Button>Ajouter un client</Button></Link>
          </CardContent>
        </Card>
      ) : (
        <ClientsKanban initialItems={kanbanItems} />
      )}
    </div>
  )
}
