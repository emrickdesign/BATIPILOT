import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { fmtRange, fmtDayLong, isoDate, mondayOf, addDays } from '@/lib/comptes-rendus'
import { clientDisplayName } from '@/lib/chantiers'
import PrintButton from './PrintButton'

export default async function RapportPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; to?: string }> }) {
  const { id } = await params
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Fenêtre : semaine courante par défaut.
  const monday = mondayOf(new Date())
  const fromIso = sp.from || isoDate(monday)
  const toIso = sp.to || isoDate(addDays(monday, 6))

  const [{ data: project }, { data: company }, { data: updates }] = await Promise.all([
    supabase.from('projects').select('id,title,address,client_id, clients(type,first_name,last_name,company_name)').eq('id', id).eq('user_id', user.id).single(),
    supabase.from('companies').select('trade_name,address,phone,email,siret').eq('user_id', user.id).maybeSingle(),
    supabase.from('site_updates').select('id,update_date,photo_path,progress,note,created_at')
      .eq('user_id', user.id).eq('project_id', id).gte('update_date', fromIso).lte('update_date', toIso).order('created_at', { ascending: true }),
  ])
  if (!project) return notFound()

  const ups = updates || []
  const withPhotos = ups.filter(u => u.photo_path)
  const signed = await Promise.all(withPhotos.map(u => supabase.storage.from('documents').createSignedUrl(u.photo_path as string, 3600)))
  const urlByUpdate = new Map(withPhotos.map((u, i) => [u.id, signed[i].data?.signedUrl]))

  type Cli = { type: string; first_name: string | null; last_name: string | null; company_name: string | null }
  const client = (project.clients as unknown as Cli | null) || null
  const progress = [...ups].reverse().find(u => u.progress != null)?.progress ?? null
  const notes = ups.filter(u => u.note)
  const photos = withPhotos
  const rangeLabel = fmtRange(fromIso, toIso)
  const co = company as { trade_name?: string; address?: string; phone?: string; email?: string; siret?: string } | null

  return (
    <div className="min-h-screen bg-gray-100 print:bg-white py-8 print:py-0">
      <div className="mx-auto max-w-[820px] px-4 print:px-0 flex justify-end mb-4 print:hidden">
        <PrintButton />
      </div>

      <article className="mx-auto max-w-[820px] bg-white print:max-w-none shadow-sm print:shadow-none rounded-xl print:rounded-none overflow-hidden">
        {/* En-tête entreprise */}
        <header className="px-8 pt-8 pb-5 border-b border-gray-200 flex items-start justify-between gap-4">
          <div>
            <p className="text-lg font-bold text-marine">{co?.trade_name || 'Votre entreprise'}</p>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              {[co?.address, co?.phone, co?.email].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">Compte-rendu de chantier</p>
            <p className="text-sm text-gray-600 mt-1">Semaine {rangeLabel}</p>
          </div>
        </header>

        {/* Chantier / client */}
        <section className="px-8 py-5 grid sm:grid-cols-2 gap-4 border-b border-gray-100">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold mb-1">Chantier</p>
            <p className="text-base font-semibold text-marine">{project.title}</p>
            {project.address && <p className="text-sm text-gray-500 mt-0.5">{project.address}</p>}
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold mb-1">Client</p>
            <p className="text-base font-semibold text-marine">{client ? clientDisplayName(client) : '—'}</p>
          </div>
        </section>

        {/* Avancement */}
        {progress != null && (
          <section className="px-8 py-5 border-b border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-marine">Avancement global</p>
              <p className="text-sm font-bold text-primary">{progress} %</p>
            </div>
            <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
            </div>
          </section>
        )}

        {/* Faits marquants */}
        {notes.length > 0 && (
          <section className="px-8 py-5 border-b border-gray-100">
            <p className="text-sm font-semibold text-marine mb-2">Cette semaine</p>
            <ul className="space-y-1.5">
              {notes.map(u => (
                <li key={u.id} className="flex gap-2 text-sm text-gray-700">
                  <span className="text-gray-400 flex-shrink-0 w-24 capitalize">{fmtDayLong(u.update_date).split(' ').slice(0, 3).join(' ')}</span>
                  <span>{u.note}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Photos */}
        {photos.length > 0 && (
          <section className="px-8 py-5">
            <p className="text-sm font-semibold text-marine mb-3">Photos du chantier ({photos.length})</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {photos.map(u => {
                const url = urlByUpdate.get(u.id)
                return url ? (
                  <figure key={u.id} className="break-inside-avoid">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="Photo du chantier" className="w-full aspect-[4/3] object-cover rounded-lg border border-gray-200" />
                    <figcaption className="text-[11px] text-gray-400 mt-1 capitalize">{fmtDayLong(u.update_date)}</figcaption>
                  </figure>
                ) : null
              })}
            </div>
          </section>
        )}

        {photos.length === 0 && notes.length === 0 && progress == null && (
          <section className="px-8 py-12 text-center text-gray-400 text-sm">Aucun élément saisi sur cette période.</section>
        )}

        {/* Pied */}
        <footer className="px-8 py-4 border-t border-gray-200 text-[11px] text-gray-400">
          {co?.trade_name || ''}{co?.siret ? ` · SIRET ${co.siret}` : ''} — Compte-rendu généré par BatiPilot le {new Date().toLocaleDateString('fr-FR')}
        </footer>
      </article>
    </div>
  )
}
