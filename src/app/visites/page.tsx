import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus, MapPin, Camera, Sparkles, ChevronRight } from 'lucide-react'
import { visitStatusLabels } from '@/lib/visites'

export default async function VisitesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: visits } = await supabase.from('site_visits')
    .select('id, title, address, status, created_at, ai_result, client_id, clients(type, first_name, last_name, company_name)')
    .eq('user_id', user.id).order('created_at', { ascending: false })

  const list = visits || []

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-[26px] font-bold font-heading text-marine">Visites de repérage</h1>
          <p className="text-gray-500 mt-1 text-sm">Sur place : photos + notes vocales, analysées par l&apos;IA pour préparer le devis.</p>
        </div>
        <Link href="/visites/nouveau"><Button className="gap-1.5"><Plus className="w-4 h-4" /> Nouvelle visite</Button></Link>
      </div>

      {list.length === 0 ? (
        <Card className="border-0 shadow-[var(--shadow-sm)]">
          <CardContent className="py-14 text-center text-gray-500">
            <Camera className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="font-medium text-marine">Aucune visite pour l&apos;instant</p>
            <p className="text-sm mt-1 max-w-md mx-auto">Chez un client, démarrez une visite : prenez des photos, dictez vos notes, et laissez l&apos;IA préparer un pré-chiffrage.</p>
            <Link href="/visites/nouveau"><Button className="mt-4 gap-1.5"><Plus className="w-4 h-4" /> Démarrer une visite</Button></Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {list.map(v => {
            const cli = v.clients as unknown as { type: string; first_name: string | null; last_name: string | null; company_name: string | null } | null
            const cliName = cli ? (cli.company_name || [cli.first_name, cli.last_name].filter(Boolean).join(' ')) : null
            const analysed = v.status === 'analyse'
            return (
              <Link key={v.id} href={`/visites/${v.id}`}>
                <Card className="border-0 shadow-[var(--shadow-sm)] card-interactive">
                  <CardContent className="p-4 flex items-center gap-3">
                    <span className={`grid place-items-center w-11 h-11 rounded-xl flex-shrink-0 ${analysed ? 'bg-[#F1F6E9] text-[#3F7A2E]' : 'bg-[#FCE7DE] text-[#C14E33]'}`}>
                      {analysed ? <Sparkles className="w-5 h-5" /> : <Camera className="w-5 h-5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-marine truncate">{v.title}</p>
                      <p className="text-xs text-gray-400 truncate flex items-center gap-2">
                        <span>{new Date(v.created_at).toLocaleDateString('fr-FR')}</span>
                        {cliName && <>· {cliName}</>}
                        {v.address && <span className="inline-flex items-center gap-0.5"><MapPin className="w-3 h-3" /> {v.address}</span>}
                      </p>
                    </div>
                    <span className={`text-xs font-medium px-2 py-1 rounded-full flex-shrink-0 ${analysed ? 'bg-[#F1F6E9] text-[#3F7A2E]' : 'bg-gray-100 text-gray-500'}`}>
                      {visitStatusLabels[v.status] || v.status}
                    </span>
                    <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
