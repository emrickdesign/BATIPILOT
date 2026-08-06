import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ArrowLeft, Phone, Mail, MapPin, HardHat, FolderOpen, Edit, Hash, CalendarDays,
  FileText, ReceiptText, ChevronDown, Banknote, Wallet, PiggyBank, Camera, StickyNote,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { projectStatusLabels, projectStatusColors } from '@/lib/chantiers'
import { clientDisplayName, clientStatusLabels, clientStatusColors, isProspect } from '@/lib/clients'
import type { ProjectStatus, ClientStatus } from '@/types'

const num = (v: unknown) => Number(v) || 0

function cityOf(addr?: string | null): string {
  if (!addr) return ''
  const m = addr.match(/\b\d{5}\s+([A-Za-zÀ-ÿ'’\- ]+)/)
  if (m) return m[1].trim().split(/[\n,]/)[0].trim()
  const parts = addr.split(',').map(s => s.trim()).filter(Boolean)
  return parts.length ? parts[parts.length - 1] : ''
}

function periode(start?: string | null, end?: string | null): string {
  const f = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })
  if (start && end) return `${f(start)} → ${f(end)}`
  if (start) return `dès ${f(start)}`
  if (end) return `jusqu'au ${f(end)}`
  return ''
}

// Fiche unique (même ligne DB) rendue sous /clients/[id] OU /prospects/[id].
// `base` = la section d'où on vient : garde l'URL alignée sur le stade pour que
// la barre latérale surligne le bon onglet (Prospects vs Clients).
export default async function ClientFiche({ id, base }: { id: string; base: '/clients' | '/prospects' }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: client } = await supabase
    .from('clients').select('*').eq('id', id).eq('user_id', user.id).single()
  if (!client) return notFound()

  // Redirige vers la bonne section si l'URL ne correspond pas au stade (chemin cohérent).
  const isProspectStage = isProspect(client.status as ClientStatus)
  if (isProspectStage && base === '/clients') redirect(`/prospects/${id}`)
  if (!isProspectStage && base === '/prospects') redirect(`/clients/${id}`)

  const [{ data: projects }, { data: quotes }, { data: invoices }, { data: documents }, { data: visits }] = await Promise.all([
    supabase.from('projects').select('id,title,status,project_type,address,start_date,end_date').eq('client_id', id).neq('status', 'archive').order('created_at', { ascending: false }),
    supabase.from('quotes').select('id,quote_number,status,total_ttc,issue_date').eq('client_id', id).order('created_at', { ascending: false }),
    supabase.from('invoices').select('id,invoice_number,status,total_ttc,amount_due,issue_date').eq('client_id', id).order('created_at', { ascending: false }),
    supabase.from('documents').select('id,name,category').eq('client_id', id).order('created_at', { ascending: false }),
    supabase.from('site_visits').select('id,title,address,status,transcript,created_at').eq('client_id', id).neq('status', 'archive').order('created_at', { ascending: false }),
  ])

  // Miniature (1re photo) + compteur photos par visite de repérage.
  const visitList = (visits || []) as { id: string; title: string; address: string | null; status: string; transcript: string | null; created_at: string }[]
  const photoCount = new Map<string, number>()
  const firstPhoto = new Map<string, string>()
  if (visitList.length) {
    const { data: ph } = await supabase.from('site_visit_photos')
      .select('visit_id, storage_path, sort_order').eq('user_id', user.id).in('visit_id', visitList.map(v => v.id)).order('sort_order')
    for (const p of ph || []) {
      const vid = p.visit_id as string
      photoCount.set(vid, (photoCount.get(vid) || 0) + 1)
      if (!firstPhoto.has(vid)) firstPhoto.set(vid, p.storage_path as string)
    }
  }
  const thumbPaths = [...firstPhoto.values()]
  const thumbUrl = new Map<string, string>()
  if (thumbPaths.length) {
    const { data: signed } = await supabase.storage.from('documents').createSignedUrls(thumbPaths, 3600)
    thumbPaths.forEach((p, i) => thumbUrl.set(p, signed?.[i]?.signedUrl || ''))
  }
  const thumbOf = (vid: string) => { const p = firstPhoto.get(vid); return p ? thumbUrl.get(p) || null : null }

  const isPaid = (s: string) => s === 'payee' || s === 'paye'
  const isOpen = (s: string) => s === 'envoyee' || s === 'en_retard' || s === 'payee_partiellement'
  const inv = invoices || []
  const totalFacture = inv.filter(i => i.status !== 'brouillon').reduce((s, i) => s + num(i.total_ttc), 0)
  const encaisse = inv.filter(i => isPaid(i.status)).reduce((s, i) => s + num(i.total_ttc), 0)
  const reste = inv.filter(i => isOpen(i.status)).reduce((s, i) => s + (num(i.amount_due) || num(i.total_ttc)), 0)

  const clientName = clientDisplayName(client)
  // La fiche s'adapte : prospect (avant devis signé) vs client converti.
  const prospect = isProspectStage
  const backHref = base
  // Chemin de retour vers CETTE fiche (pour le bouton Retour d'un devis ouvert d'ici).
  const selfPath = `${base}/${id}`

  return (
    <div className="space-y-4 max-w-3xl">
      {/* En-tête — titre adaptatif selon le stade (prospect / client) */}
      <div className="flex items-center gap-3">
        <Link href={backHref}>
          <Button variant="ghost" size="sm" className="gap-1"><ArrowLeft className="w-4 h-4" /> Retour</Button>
        </Link>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${prospect ? 'bg-[#EAF1FC] text-[#1F5FAE]' : 'bg-[#E9F2DB] text-[#3F7A2E]'}`}>
              {prospect ? 'Fiche prospect' : 'Fiche client'}
            </span>
            <Badge className={`${clientStatusColors[client.status as ClientStatus] || 'bg-gray-100 text-gray-700'} border-0 flex-shrink-0 text-xs`}>
              {clientStatusLabels[client.status as ClientStatus] || client.status}
            </Badge>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 truncate mt-0.5">{clientName}</h1>
        </div>
      </div>

      {/* Actions — adaptées au stade */}
      <div className="flex flex-wrap gap-2">
        {prospect ? (
          <>
            <Link href={`/devis/nouveau?client=${id}`}><Button size="sm" className="gap-1"><FileText className="w-4 h-4" /> Créer un devis</Button></Link>
            <Link href={`/visites/nouveau?client=${id}`}><Button variant="outline" size="sm" className="gap-1"><Camera className="w-4 h-4" /> Nouvelle visite</Button></Link>
          </>
        ) : (
          !projects?.length && (
            <Link href={`/chantiers/nouveau?client=${id}`}><Button size="sm" className="gap-1"><HardHat className="w-4 h-4" /> Créer un chantier</Button></Link>
          )
        )}
        {client.email && (
          <Link href={`/emails?compose=1&to=${encodeURIComponent(client.email)}`}>
            <Button variant="info" size="sm" className="gap-1"><Mail className="w-4 h-4" /> Email</Button>
          </Link>
        )}
        <Link href={`/clients/${id}/modifier`}><Button variant="outline" size="sm" className="gap-1"><Edit className="w-4 h-4" /> Modifier</Button></Link>
      </div>

      {/* Résumé financier — seulement pour un client converti (un prospect n'a rien facturé) */}
      {!prospect && (
        <div className="grid grid-cols-3 gap-3">
          <Card className="border border-[#CFDDF6] bg-[#EAF1FC]"><CardContent className="p-4">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#3E5C8A]"><Banknote className="w-3.5 h-3.5" /> Total facturé</div>
            <div className="inline-block text-xl font-bold text-[#1F5FAE] tabular-nums mt-2 rounded-lg bg-white/70 px-2 py-0.5 border border-[#CFDDF6]">{formatCurrency(totalFacture)}</div>
          </CardContent></Card>
          <Card className="border border-[#DDE9C9] bg-[#EEF6E4]"><CardContent className="p-4">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#4C6F35]"><Wallet className="w-3.5 h-3.5" /> Encaissé</div>
            <div className="inline-block text-xl font-bold text-[#3F7A2E] tabular-nums mt-2 rounded-lg bg-white/70 px-2 py-0.5 border border-[#DDE9C9]">{formatCurrency(encaisse)}</div>
          </CardContent></Card>
          <Link href="/banque">
            <Card className="border border-[#F0E1C0] bg-[#FBF1D8] card-interactive h-full"><CardContent className="p-4">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#8A6D2E]"><PiggyBank className="w-3.5 h-3.5" /> Reste à encaisser</div>
              <div className={`inline-block text-xl font-bold tabular-nums mt-2 rounded-lg px-2 py-0.5 border ${reste > 0 ? 'text-[#8A5A08] bg-white/70 border-[#F0E1C0]' : 'text-gray-400 bg-white/50 border-gray-200'}`}>{formatCurrency(reste)}</div>
            </CardContent></Card>
          </Link>
        </div>
      )}

      {/* Prospect : bandeau explicite — devient client quand le devis est signé */}
      {prospect && (
        <div className="rounded-xl border border-[#CFDDF6] bg-[#EAF1FC] px-4 py-3 text-sm text-[#1F5FAE] flex items-center gap-2">
          <span className="text-lg">👋</span>
          <span>Prospect en cours. Les infos (visite, photos, notes, devis) sont stockées ici. Il devient <strong>client</strong> dès que le devis est signé.</span>
        </div>
      )}

      {/* Coordonnées */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <Badge variant="outline" className="w-fit">{client.type === 'professionnel' ? '🏢 Professionnel' : '👤 Particulier'}</Badge>
          <div className="flex flex-wrap gap-2">
            {client.phone && (
              <a href={`tel:${client.phone}`} className="inline-flex items-center gap-2 text-sm rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 hover:border-primary/40 transition-colors">
                <span className="grid place-items-center w-6 h-6 rounded-md bg-[#EAF1FC] text-[#1F5FAE]"><Phone className="w-3.5 h-3.5" /></span>
                <span className="font-medium text-gray-700">{client.phone}</span>
              </a>
            )}
            {client.email && (
              <a href={`/emails?compose=1&to=${encodeURIComponent(client.email)}`} className="inline-flex items-center gap-2 text-sm rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 hover:border-primary/40 transition-colors min-w-0">
                <span className="grid place-items-center w-6 h-6 rounded-md bg-[#FFF1E9] text-[#E8571E] flex-shrink-0"><Mail className="w-3.5 h-3.5" /></span>
                <span className="font-medium text-gray-700 truncate">{client.email}</span>
              </a>
            )}
            {client.type === 'professionnel' && client.siret && (
              <span className="inline-flex items-center gap-2 text-sm rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5">
                <span className="grid place-items-center w-6 h-6 rounded-md bg-[#F3EEFB] text-[#6D4AAE]"><Hash className="w-3.5 h-3.5" /></span>
                <span className="font-medium text-gray-700">SIRET {client.siret}</span>
              </span>
            )}
          </div>
          {client.billing_address && (
            <div className="flex items-start gap-2 text-sm"><MapPin className="w-4 h-4 text-[#1F5FAE] mt-0.5 flex-shrink-0" /><span className="text-gray-700 whitespace-pre-line"><span className="text-[11px] font-semibold text-[#1F5FAE] block uppercase tracking-wide">Facturation</span>{client.billing_address}</span></div>
          )}
          {client.site_address && (
            <div className="flex items-start gap-2 text-sm"><MapPin className="w-4 h-4 text-[#E8571E] mt-0.5 flex-shrink-0" /><span className="text-gray-700 whitespace-pre-line"><span className="text-[11px] font-semibold text-[#E8571E] block uppercase tracking-wide">Chantier</span>{client.site_address}</span></div>
          )}
          {client.notes && (
            <div className="pt-2 border-t border-gray-100"><p className="text-sm text-gray-500 italic whitespace-pre-line">{client.notes}</p></div>
          )}
        </CardContent>
      </Card>

      {/* Repérage / Visite — photos + notes du lieu, stockées AVANT le devis signé */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><Camera className="w-4 h-4 text-[#C14E33]" /> Repérage ({visitList.length})</CardTitle>
          <Link href={`/visites/nouveau?client=${id}`}><Button variant="outline" size="sm" className="h-7 text-xs">+ Visite</Button></Link>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {!visitList.length ? (
            <p className="text-sm text-gray-400 py-2">Aucune visite de repérage. Ajoute photos et notes du lieu avant de faire le devis.</p>
          ) : (
            <div className="space-y-2">
              {visitList.map(v => {
                const thumb = thumbOf(v.id)
                const nb = photoCount.get(v.id) || 0
                return (
                  <Link key={v.id} href={`/visites/${v.id}`} className="group block">
                    <div className="flex items-stretch gap-3 rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm transition-all group-hover:border-primary/40 group-hover:shadow-md">
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumb} alt="" className="w-20 object-cover flex-shrink-0" />
                      ) : (
                        <span className="grid place-items-center w-20 flex-shrink-0 bg-[#FCE7DE] text-[#C14E33]"><Camera className="w-5 h-5" /></span>
                      )}
                      <div className="min-w-0 flex-1 py-2.5 pr-3">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-gray-800 truncate">{v.title || 'Visite'}</p>
                          <Badge className="bg-[#EAF1FC] text-[#1F5FAE] border-0 text-[10px] flex-shrink-0">{nb} photo{nb > 1 ? 's' : ''}</Badge>
                        </div>
                        {v.transcript && (
                          <p className="text-xs text-gray-500 mt-1 line-clamp-2 flex gap-1"><StickyNote className="w-3 h-3 mt-0.5 flex-shrink-0 text-gray-400" />{v.transcript}</p>
                        )}
                        <p className="text-[11px] text-gray-400 mt-1">{formatDate(v.created_at)}</p>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Chantiers */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-base">Chantiers ({projects?.length || 0})</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {!projects?.length ? <p className="text-sm text-gray-400 py-2">Aucun chantier</p> : (
            <div className="grid sm:grid-cols-2 gap-3">
              {projects.map(pr => {
                const ville = cityOf(pr.address)
                const dates = periode(pr.start_date, pr.end_date)
                return (
                  <Link key={pr.id} href={`/chantiers/${pr.id}`} className="group">
                    <div className="h-full rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm transition-all group-hover:border-primary/40 group-hover:shadow-md">
                      <div className="flex items-start gap-2.5">
                        <span className="grid place-items-center w-9 h-9 rounded-lg bg-[#FFF1E9] text-[#E8571E] flex-shrink-0">
                          <HardHat className="w-4.5 h-4.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-gray-800 truncate leading-tight">{pr.title}</p>
                          <Badge className={`${projectStatusColors[pr.status as ProjectStatus] || 'bg-gray-100 text-gray-700'} border-0 text-[11px] mt-1`}>
                            {projectStatusLabels[pr.status as ProjectStatus] || pr.status}
                          </Badge>
                        </div>
                      </div>
                      <div className="mt-3 space-y-1.5 text-xs text-gray-500">
                        {pr.project_type && (
                          <div className="flex items-center gap-1.5"><HardHat className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" /><span className="truncate">{pr.project_type}</span></div>
                        )}
                        {ville && (
                          <div className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" /><span className="truncate">{ville}</span></div>
                        )}
                        {dates && (
                          <div className="flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" /><span className="truncate">{dates}</span></div>
                        )}
                        {!pr.project_type && !ville && !dates && (
                          <span className="text-gray-300">Détails à compléter</span>
                        )}
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Devis · Factures · Documents — 3 tuiles compactes, dépliables au clic (pas de scroll inutile) */}
      <div className="grid grid-cols-3 gap-3">
        {/* Devis */}
        <details className="group col-span-1 open:col-span-3 rounded-2xl border border-[#CFDDF6] bg-[#EAF1FC] open:bg-white open:shadow-md transition-shadow overflow-hidden">
          <summary className="list-none cursor-pointer select-none p-3 flex flex-col items-center text-center gap-0.5">
            <span className="grid place-items-center w-11 h-11 rounded-xl bg-white text-[#1F5FAE] shadow-sm mb-1"><FileText className="w-5 h-5" /></span>
            <span className="text-2xl font-bold text-[#1F5FAE] tabular-nums leading-none">{quotes?.length || 0}</span>
            <span className="text-[11px] font-semibold text-[#3E5C8A] flex items-center gap-1">Devis <ChevronDown className="w-3 h-3 transition-transform group-open:rotate-180" /></span>
          </summary>
          <div className="px-3 pb-3 pt-1 text-left">
            {!quotes?.length ? <p className="text-sm text-gray-400 py-1">Aucun devis</p> : (
              <div className="divide-y divide-gray-100">
                {quotes.map(q => (
                  <Link key={q.id} href={`/devis/${q.id}?from=${encodeURIComponent(selfPath)}`}>
                    <div className="flex items-center justify-between py-2.5 hover:bg-gray-50 rounded-lg px-2 -mx-2">
                      <div className="flex items-center gap-2"><span className="font-mono text-[11px] text-[#1F5FAE] bg-[#EAF1FC] rounded px-1.5 py-0.5">{q.quote_number}</span><span className="text-sm text-gray-500">{formatDate(q.issue_date)}</span></div>
                      <span className="text-sm font-bold text-gray-800 tabular-nums">{formatCurrency(q.total_ttc)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </details>

        {/* Factures */}
        <details className="group col-span-1 open:col-span-3 rounded-2xl border border-[#DDE9C9] bg-[#EEF6E4] open:bg-white open:shadow-md transition-shadow overflow-hidden">
          <summary className="list-none cursor-pointer select-none p-3 flex flex-col items-center text-center gap-0.5">
            <span className="grid place-items-center w-11 h-11 rounded-xl bg-white text-[#3F7A2E] shadow-sm mb-1"><ReceiptText className="w-5 h-5" /></span>
            <span className="text-2xl font-bold text-[#3F7A2E] tabular-nums leading-none">{inv.length}</span>
            <span className="text-[11px] font-semibold text-[#4C6F35] flex items-center gap-1">Factures <ChevronDown className="w-3 h-3 transition-transform group-open:rotate-180" /></span>
          </summary>
          <div className="px-3 pb-3 pt-1 text-left">
            {!inv.length ? <p className="text-sm text-gray-400 py-1">Aucune facture</p> : (
              <div className="divide-y divide-gray-100">
                {inv.map(i => (
                  <Link key={i.id} href={`/factures/${i.id}`}>
                    <div className="flex items-center justify-between py-2.5 hover:bg-gray-50 rounded-lg px-2 -mx-2">
                      <span className="font-mono text-[11px] text-[#3F7A2E] bg-[#EEF6E4] rounded px-1.5 py-0.5">{i.invoice_number}</span>
                      <span className="text-sm font-bold text-gray-800 tabular-nums">{formatCurrency(num(i.amount_due) || num(i.total_ttc))}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </details>

        {/* Documents */}
        <details className="group col-span-1 open:col-span-3 rounded-2xl border border-[#E4D8F3] bg-[#F3EEFB] open:bg-white open:shadow-md transition-shadow overflow-hidden">
          <summary className="list-none cursor-pointer select-none p-3 flex flex-col items-center text-center gap-0.5">
            <span className="grid place-items-center w-11 h-11 rounded-xl bg-white text-[#6D4AAE] shadow-sm mb-1"><FolderOpen className="w-5 h-5" /></span>
            <span className="text-2xl font-bold text-[#6D4AAE] tabular-nums leading-none">{documents?.length || 0}</span>
            <span className="text-[11px] font-semibold text-[#5B3E93] flex items-center gap-1">Documents <ChevronDown className="w-3 h-3 transition-transform group-open:rotate-180" /></span>
          </summary>
          <div className="px-3 pb-3 pt-1 text-left">
            <div className="flex justify-end mb-1">
              <Link href={`/documents?client=${id}`}><Button variant="outline" size="sm" className="h-7 text-xs">+ Ajouter</Button></Link>
            </div>
            {!documents?.length ? <p className="text-sm text-gray-400 py-1">Aucun document</p> : (
              <div className="divide-y divide-gray-100">
                {documents.map(doc => (
                  <Link key={doc.id} href={`/documents?client=${id}`}>
                    <div className="flex items-center justify-between py-2.5 hover:bg-gray-50 rounded-lg px-2 -mx-2">
                      <div className="flex items-center gap-2 min-w-0"><FolderOpen className="w-4 h-4 text-[#6D4AAE] flex-shrink-0" /><span className="text-sm text-gray-700 truncate">{doc.name}</span></div>
                      {doc.category && <Badge variant="outline" className="text-xs flex-shrink-0">{doc.category}</Badge>}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </details>
      </div>
    </div>
  )
}
