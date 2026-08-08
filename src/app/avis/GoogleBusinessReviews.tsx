'use client'
/* eslint-disable @next/next/no-img-element */
// Rapport d'avis complet via l'API Google Business Profile (tous les avis + réponses).
// Actif une fois la fiche connectée ET l'accès API accordé par Google.

import { useCallback, useEffect, useState } from 'react'
import { CardContent } from '@/components/ui/card'
import DottedCard from '@/components/charts/DottedCard'
import { Button } from '@/components/ui/button'
import { Star, RefreshCw, MessageSquareQuote, Send, Info, Clock, CornerDownRight, Loader2, RefreshCcwDot } from 'lucide-react'
import { toast } from 'sonner'

type Review = { name: string; author: string; photo: string | null; rating: number; text: string; when: string; reply: string | null }
type Loc = { name: string; title: string; address: string }
type Data = { ok?: boolean; error?: string; needsSelection?: boolean; locations?: Loc[]; selected?: string; title?: string | null; rating?: number; total?: number; reviews?: Review[] }

function Stars({ n }: { n: number }) {
  return (
    <span className="inline-flex" aria-label={`${n}/5`}>
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} className="w-3.5 h-3.5" fill={i <= Math.round(n) ? '#F5A623' : 'none'} stroke={i <= Math.round(n) ? '#F5A623' : '#D6D3CD'} />
      ))}
    </span>
  )
}

const fmtDate = (iso: string) => iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : ''

export default function GoogleBusinessReviews() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [replyOpen, setReplyOpen] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/avis/google/reviews', { cache: 'no-store' })
      setData(await r.json())
    } catch {
      setData({ error: 'fetch-failed' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function choose(loc: Loc) {
    setLoading(true)
    await fetch('/api/avis/google/select', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ location: loc.name, title: loc.title }),
    })
    await load()
  }

  async function sendReply(review: Review) {
    if (!replyText.trim()) return
    setSending(true)
    const r = await fetch('/api/avis/google/reply', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewName: review.name, comment: replyText.trim() }),
    })
    setSending(false)
    if (!r.ok) { toast.error('Réponse non publiée'); return }
    toast.success('Réponse publiée sur Google')
    setData(d => d ? { ...d, reviews: d.reviews?.map(rv => rv.name === review.name ? { ...rv, reply: replyText.trim() } : rv) } : d)
    setReplyOpen(null); setReplyText('')
  }

  const header = (
    <div className="flex items-start justify-between gap-2">
      <div className="flex items-center gap-2">
        <span className="grid place-items-center w-8 h-8 rounded-lg bg-amber-50 text-amber-500 flex-shrink-0"><MessageSquareQuote className="w-4 h-4" /></span>
        <div>
          <h2 className="text-base font-bold font-heading text-marine leading-tight">Rapport d&apos;avis</h2>
          <p className="text-[11px] text-emerald-600 font-medium">Google Business — avis complets</p>
        </div>
      </div>
      <Button variant="ghost" size="sm" className="text-gray-400 hover:text-gray-700" disabled={loading} onClick={load} title="Actualiser">
        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
      </Button>
    </div>
  )

  return (
    <DottedCard>
      <CardContent className="p-4 space-y-4">
        {header}

        {/* Sélecteur de fiche (compte gérant plusieurs fiches) */}
        {!data?.needsSelection && data?.locations && data.locations.length > 1 && (
          <select
            value={data.selected || ''}
            onChange={e => { const l = data.locations!.find(x => x.name === e.target.value); if (l) choose(l) }}
            className="w-full h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm text-marine focus:outline-none focus:ring-2 focus:ring-primary/30">
            {data.locations.map(l => (
              <option key={l.name} value={l.name}>{l.title}{l.address ? ` — ${l.address}` : ''}</option>
            ))}
          </select>
        )}

        {loading && !data ? (
          <div className="py-10 text-center text-sm text-gray-400">Chargement des avis…</div>
        ) : data?.needsSelection ? (
          <div className="space-y-2">
            <p className="text-sm text-gray-500">Ce compte gère plusieurs fiches. Choisissez celle à afficher :</p>
            {(data.locations || []).map(l => (
              <button key={l.name} onClick={() => choose(l)} disabled={loading}
                className="w-full text-left rounded-xl border border-gray-200 p-3 hover:border-primary/40 hover:bg-primary/[0.03] transition-colors">
                <p className="text-sm font-semibold text-marine">{l.title}</p>
                {l.address && <p className="text-xs text-gray-400">{l.address}</p>}
              </button>
            ))}
          </div>
        ) : data?.error === 'no-access' ? (
          <div className="rounded-xl bg-amber-50/70 border border-amber-100 p-3 text-xs text-amber-800 flex gap-2">
            <Clock className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>Fiche connectée ✓. En attente de la <span className="font-medium">validation de l&apos;accès API par Google</span> (quota). Le rapport complet s&apos;affichera automatiquement une fois l&apos;accès accordé.</span>
          </div>
        ) : data?.error === 'no-location' ? (
          <div className="rounded-xl bg-amber-50/70 border border-amber-100 p-3 text-xs text-amber-800 flex gap-2">
            <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>Aucune fiche d&apos;établissement trouvée sur ce compte Google. Reconnectez-vous avec le compte propriétaire de la fiche.</span>
          </div>
        ) : data?.error ? (
          <div className="py-8 text-center text-sm text-gray-400">Avis indisponibles pour le moment.</div>
        ) : data?.ok ? (
          <>
            <div className="flex items-center gap-4 rounded-xl bg-gray-50/70 p-3">
              <div className="text-center flex-shrink-0">
                <div className="text-3xl font-bold text-marine tabular-nums leading-none">{(data.rating || 0).toFixed(1)}</div>
                <div className="mt-1"><Stars n={data.rating || 0} /></div>
              </div>
              <div className="text-sm text-gray-500">
                <p><span className="font-semibold text-marine">{data.total || 0}</span> avis au total</p>
                {data.title && <p className="text-xs text-gray-400 mt-0.5">{data.title}</p>}
              </div>
            </div>

            {data.reviews && data.reviews.length > 0 ? (
              <div className="space-y-2.5 max-h-[70vh] overflow-y-auto pr-0.5">
                {data.reviews.map(rv => (
                  <div key={rv.name} className="rounded-xl border border-gray-100 p-3">
                    <div className="flex items-center gap-2">
                      {rv.photo
                        ? <img src={rv.photo} alt="" className="w-6 h-6 rounded-full flex-shrink-0" referrerPolicy="no-referrer" />
                        : <span className="grid place-items-center w-6 h-6 rounded-full bg-gray-100 text-gray-500 text-[10px] font-bold flex-shrink-0">{rv.author.slice(0, 1).toUpperCase()}</span>}
                      <span className="text-sm font-medium text-marine truncate flex-1">{rv.author}</span>
                      <Stars n={rv.rating} />
                    </div>
                    {rv.text && <p className="text-xs text-gray-600 mt-1.5 leading-relaxed whitespace-pre-line">{rv.text}</p>}
                    {rv.when && <p className="text-[11px] text-gray-400 mt-1">{fmtDate(rv.when)}</p>}

                    {rv.reply ? (
                      <div className="mt-2 ml-2 pl-2.5 border-l-2 border-emerald-200 text-xs">
                        <p className="text-emerald-700 font-medium flex items-center gap-1"><CornerDownRight className="w-3 h-3" /> Votre réponse</p>
                        <p className="text-gray-600 mt-0.5 whitespace-pre-line">{rv.reply}</p>
                      </div>
                    ) : replyOpen === rv.name ? (
                      <div className="mt-2 space-y-2">
                        <textarea value={replyText} onChange={e => setReplyText(e.target.value)} rows={2} autoFocus
                          placeholder="Merci pour votre retour…"
                          className="w-full resize-none rounded-lg border border-gray-200 p-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30" />
                        <div className="flex items-center gap-2">
                          <Button size="sm" className="h-8 gap-1.5" disabled={sending || !replyText.trim()} onClick={() => sendReply(rv)}>
                            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Publier
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8" onClick={() => { setReplyOpen(null); setReplyText('') }}>Annuler</Button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => { setReplyOpen(rv.name); setReplyText('') }}
                        className="mt-2 text-xs font-medium text-primary hover:underline flex items-center gap-1">
                        <CornerDownRight className="w-3 h-3" /> Répondre
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-gray-400">Pas encore d&apos;avis sur cette fiche.</p>
            )}
          </>
        ) : null}

        {/* Changer de compte : utile si la fiche est gérée par un autre compte Google */}
        <a href="/api/auth/gbp/initiate"
          className="flex items-center gap-1.5 pt-1 text-[11px] text-gray-400 hover:text-primary transition-colors">
          <RefreshCcwDot className="w-3.5 h-3.5" /> Changer de compte Google
        </a>
      </CardContent>
    </DottedCard>
  )
}
