'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { LogIn, LogOut, Coffee, Play, Camera, Loader2, ImageIcon } from 'lucide-react'
import { presenceLabels, presenceShort, presenceColors, presenceActions } from '@/lib/pointage'
import type { PresenceType } from '@/types'

const ICONS: Record<PresenceType, typeof LogIn> = {
  arrivee: LogIn, depart: LogOut, pause: Coffee, reprise: Play, photo: Camera,
}
// Ces actions demandent une photo (preuve) ; pause/reprise non.
const WITH_PHOTO: PresenceType[] = ['arrivee', 'depart', 'photo']

type EventItem = {
  id: string; type: PresenceType; occurred_at: string; note?: string | null
  photoUrl?: string | null; projectTitle?: string | null; employeeName?: string | null
}

export default function PointageClient({
  projects, employees, events,
}: {
  projects: { id: string; title: string }[]
  employees: { id: string; full_name: string }[]
  events: EventItem[]
}) {
  const router = useRouter()
  const [projectId, setProjectId] = useState(projects[0]?.id || '')
  const [employeeId, setEmployeeId] = useState('')
  const [busy, setBusy] = useState<PresenceType | null>(null)
  const pendingType = useRef<PresenceType | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function record(type: PresenceType, photoFile?: File) {
    setBusy(type)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { toast.error('Non connecté'); return }

      let photo_path: string | null = null
      if (photoFile) {
        const safe = photoFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        photo_path = `pointage/${user.id}/${Date.now()}-${safe}`
        const { error: upErr } = await supabase.storage.from('documents').upload(photo_path, photoFile, {
          contentType: photoFile.type || 'image/jpeg', upsert: false,
        })
        if (upErr) { toast.error('Échec de l’envoi de la photo'); return }
      }

      const { error } = await supabase.from('presence_events').insert({
        user_id: user.id,
        project_id: projectId || null,
        employee_id: employeeId || null,
        type,
        photo_path,
      })
      if (error) { toast.error('Erreur lors de l’enregistrement'); return }
      toast.success(presenceShort[type] + ' enregistrée')
      router.refresh()
    } finally {
      setBusy(null)
      pendingType.current = null
    }
  }

  function onAction(type: PresenceType) {
    if (WITH_PHOTO.includes(type)) {
      pendingType.current = type
      fileRef.current?.click()
    } else {
      record(type)
    }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    const type = pendingType.current
    if (file && type) record(type, file)
  }

  return (
    <div className="space-y-5">
      {/* Sélecteurs chantier / salarié */}
      <Card className="border border-gray-200/80 bg-white">
        <CardContent className="p-4 grid sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500">Chantier</label>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}
              className="w-full h-11 rounded-lg border border-gray-200 px-3 text-sm bg-white">
              <option value="">— Aucun —</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500">Salarié (optionnel)</label>
            <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}
              className="w-full h-11 rounded-lg border border-gray-200 px-3 text-sm bg-white">
              <option value="">— Moi-même —</option>
              {employees.map(em => <option key={em.id} value={em.id}>{em.full_name}</option>)}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Gros boutons d'action */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {presenceActions.map(type => {
          const Icon = ICONS[type]
          const isBusy = busy === type
          return (
            <button
              key={type}
              onClick={() => onAction(type)}
              disabled={busy !== null}
              className="card-interactive flex flex-col items-center justify-center gap-2 rounded-2xl border border-gray-200/80 bg-white py-6 px-3 text-center disabled:opacity-60"
            >
              <span className={`grid place-items-center w-12 h-12 rounded-xl ${presenceColors[type]}`}>
                {isBusy ? <Loader2 className="w-6 h-6 animate-spin" /> : <Icon className="w-6 h-6" strokeWidth={2.1} />}
              </span>
              <span className="text-sm font-semibold text-marine leading-tight">{presenceLabels[type]}</span>
              {WITH_PHOTO.includes(type) && <span className="text-[10px] text-gray-400">avec photo</span>}
            </button>
          )
        })}
      </div>

      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />

      {/* Timeline du jour */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Aujourd&apos;hui</h2>
        <Card className="border border-gray-200/80 bg-white">
          <CardContent className="p-2 sm:p-4">
            {events.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">Aucun pointage aujourd&apos;hui.</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {events.map(ev => (
                  <div key={ev.id} className="flex items-center gap-3 py-2.5 px-1">
                    <span className={`grid place-items-center w-9 h-9 rounded-lg flex-shrink-0 ${presenceColors[ev.type]}`}>
                      {(() => { const I = ICONS[ev.type]; return <I className="w-4 h-4" /> })()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-marine">{presenceShort[ev.type]}{ev.employeeName ? ` · ${ev.employeeName}` : ''}</div>
                      <div className="text-xs text-gray-400 truncate">
                        {ev.projectTitle || 'Sans chantier'}
                      </div>
                    </div>
                    {ev.photoUrl && (
                      <a href={ev.photoUrl} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
                        <img src={ev.photoUrl} alt="" className="w-10 h-10 rounded-lg object-cover border border-gray-200" />
                      </a>
                    )}
                    {!ev.photoUrl && WITH_PHOTO.includes(ev.type) && <ImageIcon className="w-4 h-4 text-gray-300 flex-shrink-0" />}
                    <span className="text-xs text-gray-400 tabular-nums w-12 text-right flex-shrink-0">
                      {new Date(ev.occurred_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
