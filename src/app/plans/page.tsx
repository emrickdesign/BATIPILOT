import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Plus, ScanLine, FileText, TrendingUp } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { AnalyseCard } from '@/lib/plans'

type Row = {
  id: string
  created_at: string
  ai_summary: string | null
  total_ht: number | null
  marge_eur: number | null
  marge_pct: number | null
  nb_lignes: number | null
  plan_uploads: {
    storage_path: string | null
    original_filename: string | null
    file_type: string | null
    clients: { type: string | null; company_name: string | null; first_name: string | null; last_name: string | null } | null
    projects: { title: string | null } | null
  } | null
}

export default async function PlansPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('plan_analyses')
    .select(`id, created_at, ai_summary, total_ht, marge_eur, marge_pct, nb_lignes,
             plan_uploads(storage_path, original_filename, file_type,
                          clients(type, company_name, first_name, last_name),
                          projects(title))`)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const rows = (data || []) as unknown as Row[]

  // Vignette : uniquement pour les plans image (un PDF n'en a pas)
  const cards: AnalyseCard[] = await Promise.all(rows.map(async r => {
    const up = r.plan_uploads
    const isImage = (up?.file_type || '').startsWith('image/')
    let thumbUrl: string | null = null
    if (isImage && up?.storage_path) {
      const { data: signed } = await supabase.storage.from('documents').createSignedUrl(up.storage_path, 3600)
      thumbUrl = signed?.signedUrl ?? null
    }
    const c = up?.clients
    const clientName = c
      ? (c.type === 'professionnel' ? (c.company_name || '') : `${c.first_name || ''} ${c.last_name || ''}`.trim())
      : null
    return {
      id: r.id,
      created_at: r.created_at,
      ai_summary: r.ai_summary,
      total_ht: Number(r.total_ht) || 0,
      marge_eur: Number(r.marge_eur) || 0,
      marge_pct: Number(r.marge_pct) || 0,
      nb_lignes: Number(r.nb_lignes) || 0,
      original_filename: up?.original_filename ?? null,
      file_type: up?.file_type ?? null,
      thumbUrl,
      client_name: clientName || null,
      project_title: up?.projects?.title ?? null,
    }
  }))

  return (
    <div className="space-y-5 animate-fade-up">
      <div>
        <h1 className="text-2xl md:text-[26px] font-bold font-heading text-marine">Analyse de plan</h1>
        <p className="text-gray-500 mt-1 text-sm">
          Importez un plan, décrivez les travaux à la voix, obtenez un métré chiffré avec votre marge. Vos analyses restent ici.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {/* Nouvelle analyse — toujours en premier */}
        <Link href="/plans/nouveau">
          <Card className="h-full border-2 border-dashed border-primary/40 bg-accent/30 hover:bg-accent/50 transition-colors">
            <CardContent className="p-5 h-full min-h-[168px] flex flex-col items-center justify-center text-center gap-2">
              <span className="grid place-items-center w-12 h-12 rounded-2xl bg-primary text-primary-foreground shadow-sm">
                <Plus className="w-6 h-6" />
              </span>
              <p className="font-semibold text-marine">Nouvelle analyse</p>
              <p className="text-xs text-gray-500">Importer un plan et le chiffrer</p>
            </CardContent>
          </Card>
        </Link>

        {cards.map(a => (
          <Link key={a.id} href={`/plans/${a.id}`}>
            <Card className="h-full card-interactive border border-gray-200/80 overflow-hidden">
              {a.thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.thumbUrl} alt="" className="w-full h-24 object-cover bg-gray-100" />
              ) : (
                <div className="w-full h-24 grid place-items-center bg-gray-50 text-gray-300">
                  <FileText className="w-8 h-8" />
                </div>
              )}
              <CardContent className="p-4 space-y-2">
                <p className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2">
                  {a.ai_summary || a.original_filename || 'Analyse de plan'}
                </p>
                <div className="flex items-center gap-2 flex-wrap text-[11px] text-gray-400">
                  <span>{formatDate(a.created_at)}</span>
                  {a.nb_lignes > 0 && <span>· {a.nb_lignes} ligne{a.nb_lignes > 1 ? 's' : ''}</span>}
                </div>
                {(a.client_name || a.project_title) && (
                  <p className="text-[11px] text-gray-500 truncate">{a.client_name || a.project_title}</p>
                )}
                <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                  <span className="font-bold text-marine tabular-nums">{formatCurrency(a.total_ht)}</span>
                  {a.total_ht > 0 && (
                    <Badge className="bg-[#E9F2DB] text-[#3F7A2E] border-0 text-[11px] gap-1">
                      <TrendingUp className="w-3 h-3" /> {a.marge_pct}%
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {cards.length === 0 && (
        <Card className="border border-gray-200/80">
          <CardContent className="py-10 text-center text-gray-400">
            <ScanLine className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="font-medium text-gray-500">Aucune analyse pour l&apos;instant</p>
            <p className="text-sm mt-1">Importez votre premier plan — il sera conservé ici avec son chiffrage.</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
