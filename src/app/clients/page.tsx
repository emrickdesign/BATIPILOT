import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, User, Building2, MapPin, HardHat, Users2, Banknote, Coins } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { clientDisplayName } from '@/lib/clients'
import StatCard from '@/components/charts/StatCard'
import ClientPhaseSelect from './ClientPhaseSelect'
import type { Client, ClientStatus } from '@/types'

// Colonnes du Kanban Clients (phase chantier → facturation)
const CLIENT_COLUMNS: { key: ClientStatus; label: string; extra?: ClientStatus[]; dot: string }[] = [
  { key: 'chantier_a_planifier', label: 'À planifier', extra: ['devis_accepte'], dot: '#C77D0E' },
  { key: 'chantier_en_cours', label: 'En cours', dot: '#E0674C' },
  { key: 'facture_a_envoyer', label: 'À facturer', dot: '#8A4B24' },
  { key: 'facture_envoyee', label: 'Facturé', dot: '#2F7DE0' },
  { key: 'paye', label: 'Payé / terminé', extra: ['termine'], dot: '#3F7A2E' },
]

const num = (v: unknown) => Number(v) || 0
const PROSPECT_OR_ARCHIVE = '(nouveau,infos_a_recuperer,devis_a_faire,devis_envoye,devis_refuse,archive)'

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
        <>
          {/* Kanban par phase — grille responsive (s'adapte au repli de la sidebar) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
            {CLIENT_COLUMNS.map(col => {
              const items = list.filter(c => c.status === col.key || (col.extra?.includes(c.status as ClientStatus) ?? false))
              return (
                <div key={col.key} className="flex flex-col min-w-0">
                  <div className="flex items-center justify-between px-1 mb-2">
                    <span className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: col.dot }} />
                      {col.label}
                    </span>
                    <span className="text-xs font-medium text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">{items.length}</span>
                  </div>
                  <div className="space-y-2.5 rounded-2xl bg-gray-50/60 p-2 min-h-[80px] flex-1">
                    {items.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-6">—</p>
                    ) : (
                      items.map(client => {
                        const ville = cityOf(client.billing_address || client.site_address)
                        const facture = totalFacture.get(client.id) || 0
                        const reste = resteAEncaisser.get(client.id) || 0
                        return (
                          <Card key={client.id} className="card-interactive border-0 shadow-[var(--shadow-sm)] overflow-hidden" style={{ backgroundColor: `${col.dot}0A` }}>
                            <div className="h-[3px]" style={{ backgroundColor: col.dot }} />
                            <CardContent className="p-3">
                              <div className="flex items-center gap-2.5">
                                <div className="w-9 h-9 rounded-full bg-white grid place-items-center flex-shrink-0" style={{ boxShadow: `0 0 0 2px ${col.dot}55` }}>
                                  {client.type === 'professionnel' ? <Building2 className="w-4 h-4" style={{ color: col.dot }} /> : <User className="w-4 h-4" style={{ color: col.dot }} />}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <Link href={`/clients/${client.id}`} className="font-semibold text-sm text-gray-900 hover:text-primary truncate block leading-tight">
                                    {clientDisplayName(client)}
                                  </Link>
                                  {ville && <div className="text-[11px] text-gray-400 truncate flex items-center gap-1"><MapPin className="w-3 h-3 flex-shrink-0" />{ville}</div>}
                                </div>
                              </div>

                              <div className="mt-2.5 flex items-center justify-between gap-2 text-xs">
                                <span className="text-gray-500">Facturé <b className="text-marine tabular-nums">{formatCurrency(facture)}</b></span>
                                {reste > 0 && <span className="text-[#8A5A08] font-medium tabular-nums flex-shrink-0">Reste {formatCurrency(reste)}</span>}
                              </div>

                              <div className="mt-2.5 flex items-center gap-2 text-[11px] text-gray-400">
                                <span className="flex items-center gap-1"><HardHat className="w-3 h-3" />{nbChantiers.get(client.id) || 0}</span>
                                <span className="text-gray-300">·</span>
                                <span className="truncate">{lastContact(lastDate.get(client.id))}</span>
                              </div>

                              <div className="mt-2.5">
                                <ClientPhaseSelect clientId={client.id} current={client.status as ClientStatus} />
                              </div>
                            </CardContent>
                          </Card>
                        )
                      })
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <p className="text-[11px] text-gray-400">Astuce : changez le statut sur une carte pour la déplacer de colonne.</p>
        </>
      )}
    </div>
  )
}
