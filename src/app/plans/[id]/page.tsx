import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowLeft, ExternalLink, FileText } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { normalizeResult } from '@/lib/plans'
import ChiffrageEditor from '../ChiffrageEditor'

export default async function AnalysePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data }, { data: emps }] = await Promise.all([
    supabase
      .from('plan_analyses')
      .select('id, created_at, demande, result, raw_ai_output, plan_uploads(storage_path, original_filename, file_type)')
      .eq('id', id).eq('user_id', user.id)
      .maybeSingle(),
    // Les vrais salariés alimentent le calcul de main-d'œuvre
    supabase.from('employees').select('id, full_name, hourly_cost')
      .eq('user_id', user.id).eq('active', true).order('full_name'),
  ])

  if (!data) return notFound()

  const up = data.plan_uploads as unknown as { storage_path: string | null; original_filename: string | null; file_type: string | null } | null
  // result peut être vide sur d'anciennes lignes : on retombe sur la sortie brute
  const result = normalizeResult(data.result ?? data.raw_ai_output)

  let planUrl: string | null = null
  if (up?.storage_path) {
    const { data: signed } = await supabase.storage.from('documents').createSignedUrl(up.storage_path, 3600)
    planUrl = signed?.signedUrl ?? null
  }
  const isImage = (up?.file_type || '').startsWith('image/')

  return (
    <div className="space-y-4 max-w-3xl animate-fade-up">
      <Link href="/plans">
        <Button variant="ghost" size="sm" className="gap-1"><ArrowLeft className="w-4 h-4" /> Toutes les analyses</Button>
      </Link>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-xl font-bold font-heading text-marine">{result.comprehension || 'Analyse de plan'}</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {formatDate(data.created_at)}{up?.original_filename ? ` · ${up.original_filename}` : ''}
          </p>
        </div>
        {planUrl && (
          <a href={planUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="gap-1.5"><ExternalLink className="w-3.5 h-3.5" /> Voir le plan</Button>
          </a>
        )}
      </div>

      {/* Le plan tel qu'analysé */}
      {planUrl && (
        <Card className="overflow-hidden">
          {isImage ? (
            <a href={planUrl} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={planUrl} alt="Plan analysé" className="w-full max-h-[320px] object-contain bg-gray-50" />
            </a>
          ) : (
            <CardContent className="p-4 flex items-center gap-3 text-sm text-gray-600">
              <FileText className="w-5 h-5 text-gray-400" />
              <span className="truncate">{up?.original_filename || 'Plan PDF'}</span>
            </CardContent>
          )}
        </Card>
      )}

      {data.demande && (
        <Card className="bg-gray-50 border-gray-200">
          <CardContent className="p-4">
            <p className="text-[11px] font-semibold text-gray-400 uppercase mb-1">Votre demande</p>
            <p className="text-sm text-gray-700 whitespace-pre-line">{data.demande}</p>
          </CardContent>
        </Card>
      )}

      {/* Les réponses données avant chiffrage (étape 3) */}
      {result.questions && result.questions.length > 0 && (
        <Card className="border-gray-200">
          <CardContent className="p-4 space-y-2">
            <p className="text-[11px] font-semibold text-gray-400 uppercase">Précisions données</p>
            {result.questions.filter(q => q.reponse).map((q, i) => (
              <div key={i} className="text-sm">
                <p className="text-gray-500">{q.question}</p>
                <p className="text-gray-800 font-medium">{q.reponse}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <ChiffrageEditor analyseId={data.id} initial={result} employees={(emps || []) as { id: string; full_name: string; hourly_cost: number | null }[]} />
    </div>
  )
}
