'use client'

import { useRef, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { LogIn, LogOut, Coffee, Play, Camera, Loader2, ImageIcon, ReceiptText } from 'lucide-react'
import { presenceLabels, presenceShort, presenceColors } from '@/lib/pointage'
import { employeeInitials } from '@/lib/equipe'
import type { PresenceType } from '@/types'

const ICONS: Record<PresenceType, typeof LogIn> = { arrivee: LogIn, depart: LogOut, pause: Coffee, reprise: Play, photo: Camera }
const QUICK: PresenceType[] = ['arrivee', 'pause', 'reprise', 'photo']
const WITH_PHOTO: PresenceType[] = ['arrivee', 'depart', 'photo']
const AVANCEMENT = ['25 %', '50 %', '75 %', 'Terminé']

type EventItem = {
  id: string; type: PresenceType; occurred_at: string; note?: string | null
  photoUrl?: string | null; employee_id?: string | null; projectTitle?: string | null; employeeName?: string | null
}

export default function PointageClient({
  projects, employees, events, assignedToday,
}: {
  projects: { id: string; title: string }[]
  employees: { id: string; full_name: string }[]
  events: EventItem[]
  assignedToday: string[]
}) {
  const router = useRouter()
  const [projectId, setProjectId] = useState(projects[0]?.id || '')
  const [employeeId, setEmployeeId] = useState('')
  const [noteQuick, setNoteQuick] = useState('')
  const [busy, setBusy] = useState<PresenceType | null>(null)
  const pendingType = useRef<PresenceType | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Fin de journée (§13.2)
  const [showFin, setShowFin] = useState(false)
  const [finAv, setFinAv] = useState('')
  const [finNote, setFinNote] = useState('')
  const [finProb, setFinProb] = useState('')
  const [finMat, setFinMat] = useState('')
  const finFileRef = useRef<HTMLInputElement>(null)
  const [finPhoto, setFinPhoto] = useState<File | null>(null)

  const empById = useMemo(() => new Map(employees.map(e => [e.id, e])), [employees])
  const notPointed = useMemo(() => {
    const pointed = new Set(events.filter(e => e.type === 'arrivee' && e.employee_id).map(e => e.employee_id))
    return assignedToday.map(id => empById.get(id)).filter((e): e is NonNullable<typeof e> => !!e).filter(e => !pointed.has(e.id))
  }, [events, assignedToday, empById])

  async function record(type: PresenceType, photoFile?: File | null, noteText?: string) {
    setBusy(type)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { toast.error('Non connecté'); return }
      let photo_path: string | null = null
      if (photoFile) {
        const safe = photoFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        photo_path = `pointage/${user.id}/${Date.now()}-${safe}`
        const { error: upErr } = await supabase.storage.from('documents').upload(photo_path, photoFile, { contentType: photoFile.type || 'image/jpeg', upsert: false })
        if (upErr) { toast.error('Échec de l’envoi de la photo'); return }
      }
      const { error } = await supabase.from('presence_events').insert({
        user_id: user.id, project_id: projectId || null, employee_id: employeeId || null, type, photo_path, note: noteText?.trim() || null,
      })
      if (error) { toast.error('Erreur lors de l’enregistrement'); return }
      toast.success(presenceShort[type] + ' enregistrée')
      setNoteQuick('')
      router.refresh()
    } finally { setBusy(null); pendingType.current = null }
  }

  function onAction(type: PresenceType) {
    if (WITH_PHOTO.includes(type)) { pendingType.current = type; fileRef.current?.click() }
    else record(type, null, noteQuick)
  }
  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = ''
    const type = pendingType.current
    if (file && type) record(type, file, noteQuick)
  }

  async function submitFin() {
    const parts: string[] = []
    if (finAv) parts.push(`Avancement : ${finAv}`)
    if (finNote.trim()) parts.push(finNote.trim())
    if (finProb.trim()) parts.push(`Problème : ${finProb.trim()}`)
    if (finMat.trim()) parts.push(`Matériel manquant : ${finMat.trim()}`)
    await record('depart', finPhoto, parts.join(' · '))
    setShowFin(false); setFinAv(''); setFinNote(''); setFinProb(''); setFinMat(''); setFinPhoto(null)
  }

  return (
    <div className="space-y-5">
      {/* Sélecteurs + note */}
      <Card className="border border-gray-200/80 bg-white">
        <CardContent className="p-4 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500">Chantier</label>
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-full h-11 rounded-lg border border-gray-200 px-3 text-sm bg-white">
                <option value="">— Aucun —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500">Salarié (optionnel)</label>
              <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="w-full h-11 rounded-lg border border-gray-200 px-3 text-sm bg-white">
                <option value="">— Moi-même —</option>
                {employees.map(em => <option key={em.id} value={em.id}>{em.full_name}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500">Note (optionnel)</label>
            <Input value={noteQuick} onChange={e => setNoteQuick(e.target.value)} placeholder="Ex : accès par l'arrière, digicode 1234A" />
          </div>
        </CardContent>
      </Card>

      {/* Boutons rapides */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {QUICK.map(type => {
          const Icon = ICONS[type]; const isBusy = busy === type
          return (
            <button key={type} onClick={() => onAction(type)} disabled={busy !== null}
              className="card-interactive flex flex-col items-center justify-center gap-2 rounded-2xl border border-gray-200/80 bg-white py-6 px-3 text-center disabled:opacity-60">
              <span className={`grid place-items-center w-12 h-12 rounded-xl ${presenceColors[type]}`}>
                {isBusy ? <Loader2 className="w-6 h-6 animate-spin" /> : <Icon className="w-6 h-6" strokeWidth={2.1} />}
              </span>
              <span className="text-sm font-semibold text-marine leading-tight">{presenceLabels[type]}</span>
              {WITH_PHOTO.includes(type) && <span className="text-[10px] text-gray-400">avec photo</span>}
            </button>
          )
        })}
      </div>

      {/* Fin de journée (§13.2) */}
      {!showFin ? (
        <Button onClick={() => setShowFin(true)} className="w-full h-12 gap-2 bg-marine hover:bg-marine/90"><LogOut className="w-5 h-5" /> Je pars du chantier — fin de journée</Button>
      ) : (
        <Card className="border-2 border-primary/30 bg-white">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-marine flex items-center gap-2"><LogOut className="w-4 h-4" /> Fin de journée</h3>
              <button onClick={() => setShowFin(false)} className="text-sm text-gray-400 hover:text-gray-600">Annuler</button>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500">Avancement</label>
              <div className="grid grid-cols-4 gap-2 mt-1">
                {AVANCEMENT.map(a => (
                  <button key={a} type="button" onClick={() => setFinAv(finAv === a ? '' : a)}
                    className={`py-2 rounded-lg border text-sm font-medium transition-colors ${finAv === a ? 'border-primary bg-accent text-primary' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>{a}</button>
                ))}
              </div>
            </div>
            <div className="space-y-1"><label className="text-xs font-medium text-gray-500">Note de fin</label>
              <Textarea value={finNote} onChange={e => setFinNote(e.target.value)} rows={2} placeholder="Ex : salle de bain prête pour le carrelage demain" /></div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1"><label className="text-xs font-medium text-gray-500">Problème rencontré</label>
                <Input value={finProb} onChange={e => setFinProb(e.target.value)} placeholder="Ex : manque raccord PVC" /></div>
              <div className="space-y-1"><label className="text-xs font-medium text-gray-500">Matériel manquant</label>
                <Input value={finMat} onChange={e => setFinMat(e.target.value)} placeholder="Ex : 2 sacs de colle" /></div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" className="gap-2" onClick={() => finFileRef.current?.click()}>
                <Camera className="w-4 h-4" /> {finPhoto ? 'Photo ajoutée ✓' : 'Photo de fin'}
              </Button>
              <Link href={`/tickets${projectId ? `?project=${projectId}` : ''}`}>
                <Button type="button" variant="outline" className="gap-2"><ReceiptText className="w-4 h-4" /> Ajouter un ticket dépense</Button>
              </Link>
            </div>
            <input ref={finFileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { setFinPhoto(e.target.files?.[0] || null); e.target.value = '' }} />
            <Button onClick={submitFin} disabled={busy !== null} className="w-full h-11 gap-2">
              {busy === 'depart' ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />} Enregistrer mon départ
            </Button>
          </CardContent>
        </Card>
      )}

      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />

      {/* Qui n'a pas pointé (§13.3) */}
      {assignedToday.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Pas encore pointés aujourd&apos;hui ({notPointed.length})</h2>
          <Card className="border border-gray-200/80 bg-white"><CardContent className="p-3 sm:p-4">
            {notPointed.length === 0 ? (
              <p className="text-sm text-[#3F7A2E]">Tous les salariés prévus ont pointé. 👌</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {notPointed.map(e => (
                  <span key={e.id} className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 pl-1 pr-2.5 py-0.5 text-xs text-amber-800">
                    <span className="grid place-items-center w-5 h-5 rounded-full bg-amber-400 text-white text-[9px] font-bold">{employeeInitials(e.full_name)}</span>
                    {e.full_name}
                  </span>
                ))}
              </div>
            )}
          </CardContent></Card>
        </div>
      )}

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
                      <div className="text-xs text-gray-400 truncate">{ev.projectTitle || 'Sans chantier'}</div>
                      {ev.note && <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">{ev.note}</div>}
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

      <p className="text-xs text-gray-400">Pointage simple : arrivée, pause/reprise (optionnel) et fin de journée. Pas besoin de pointer chaque petite pause. Géolocalisation : à venir.</p>
    </div>
  )
}
