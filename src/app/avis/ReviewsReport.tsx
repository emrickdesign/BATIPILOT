'use client'
/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */
// Rapport d'avis Google — récupéré côté navigateur via l'API Places (getDetails),
// où la clé Maps (restreinte par referrer) est autorisée. L'API Places renvoie la
// note globale + le nombre total d'avis + jusqu'à 5 avis « les plus pertinents ».
// L'historique complet nécessiterait l'API Google Business Profile (OAuth).

import { useCallback, useEffect, useState } from 'react'
import { CardContent } from '@/components/ui/card'
import DottedCard from '@/components/charts/DottedCard'
import { Button } from '@/components/ui/button'
import { Star, RefreshCw, ExternalLink, Info, MessageSquareQuote } from 'lucide-react'
import { loadGoogleMaps } from '@/lib/googleMaps'

type Review = { author: string; rating: number; text: string; when: string; photo?: string }
type Report = { rating: number; total: number; url: string; reviews: Review[] }

function Stars({ n, className = '' }: { n: number; className?: string }) {
  return (
    <span className={`inline-flex ${className}`} aria-label={`${n} sur 5`}>
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} className="w-3.5 h-3.5" fill={i <= Math.round(n) ? '#F5A623' : 'none'} stroke={i <= Math.round(n) ? '#F5A623' : '#D6D3CD'} />
      ))}
    </span>
  )
}

export default function ReviewsReport({
  placeId, mapsKey,
}: { placeId: string | null; mapsKey: string }) {
  const [data, setData] = useState<Report | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchReport = useCallback(async () => {
    if (!placeId || !mapsKey) return
    setLoading(true); setError(null)
    try {
      await loadGoogleMaps(mapsKey)
      const g = (window as any).google
      const svc = new g.maps.places.PlacesService(document.createElement('div'))
      const report = await new Promise<Report>((resolve, reject) => {
        svc.getDetails(
          { placeId, fields: ['rating', 'user_ratings_total', 'url', 'reviews'], language: 'fr' },
          (p: any, status: string) => {
            if (status !== g.maps.places.PlacesServiceStatus.OK || !p) return reject(new Error(status))
            resolve({
              rating: Number(p.rating) || 0,
              total: Number(p.user_ratings_total) || 0,
              url: p.url || '',
              reviews: Array.isArray(p.reviews) ? p.reviews.map((rv: any): Review => ({
                author: rv.author_name || 'Client',
                rating: Number(rv.rating) || 0,
                text: rv.text || '',
                when: rv.relative_time_description || '',
                photo: rv.profile_photo_url || undefined,
              })) : [],
            })
          },
        )
      })
      setData(report)
    } catch (e: any) {
      setError(e?.message === 'NOT_FOUND' ? 'Fiche introuvable' : 'Avis indisponibles pour le moment')
    } finally {
      setLoading(false)
    }
  }, [placeId, mapsKey])

  useEffect(() => { fetchReport() }, [fetchReport])

  return (
    <DottedCard>
      <CardContent className="p-4 space-y-4">
        {/* En-tête */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="grid place-items-center w-8 h-8 rounded-lg bg-amber-50 text-amber-500 flex-shrink-0"><MessageSquareQuote className="w-4 h-4" /></span>
            <div>
              <h2 className="text-base font-bold font-heading text-marine leading-tight">Rapport d&apos;avis</h2>
              <p className="text-[11px] text-gray-400">Depuis votre fiche Google</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="text-gray-400 hover:text-gray-700" disabled={loading || !placeId} onClick={fetchReport} title="Actualiser">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {!placeId ? (
          <div className="rounded-xl bg-amber-50/60 border border-amber-100 p-3 text-xs text-amber-800 flex gap-2">
            <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>Connectez votre fiche via la <span className="font-medium">recherche automatique</span> (bloc « Changer » plus bas) pour afficher vos avis ici.</span>
          </div>
        ) : loading && !data ? (
          <div className="py-10 text-center text-sm text-gray-400">Chargement des avis…</div>
        ) : error ? (
          <div className="py-8 text-center text-sm text-gray-400">{error}</div>
        ) : data ? (
          <>
            {/* Synthèse note globale */}
            <div className="flex items-center gap-4 rounded-xl bg-gray-50/70 p-3">
              <div className="text-center flex-shrink-0">
                <div className="text-3xl font-bold text-marine tabular-nums leading-none">{data.rating.toFixed(1)}</div>
                <Stars n={data.rating} className="mt-1" />
              </div>
              <div className="text-sm text-gray-500">
                <p><span className="font-semibold text-marine">{data.total}</span> avis au total</p>
                {data.url && (
                  <a href={data.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline text-xs mt-1">
                    Voir tous les avis <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>

            {/* Liste des avis (max 5 renvoyés par l'API) */}
            {data.reviews.length > 0 ? (
              <div className="space-y-2.5">
                {data.reviews.map((rv, i) => (
                  <div key={i} className="rounded-xl border border-gray-100 p-3">
                    <div className="flex items-center gap-2">
                      {rv.photo
                        ? <img src={rv.photo} alt="" className="w-6 h-6 rounded-full flex-shrink-0" />
                        : <span className="grid place-items-center w-6 h-6 rounded-full bg-gray-100 text-gray-500 text-[10px] font-bold flex-shrink-0">{rv.author.slice(0, 1).toUpperCase()}</span>}
                      <span className="text-sm font-medium text-marine truncate flex-1">{rv.author}</span>
                      <Stars n={rv.rating} />
                    </div>
                    {rv.text && <p className="text-xs text-gray-600 mt-1.5 leading-relaxed line-clamp-4">{rv.text}</p>}
                    {rv.when && <p className="text-[11px] text-gray-400 mt-1">{rv.when}</p>}
                  </div>
                ))}
                <p className="text-[11px] text-gray-400 flex items-start gap-1.5 pt-1">
                  <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  L&apos;API Google Places affiche jusqu&apos;à 5 avis. Cliquez « Voir tous les avis » pour l&apos;historique complet.
                </p>
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-gray-400">Pas encore d&apos;avis sur cette fiche.</p>
            )}
          </>
        ) : null}
      </CardContent>
    </DottedCard>
  )
}
