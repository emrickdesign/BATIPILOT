'use client'

import { useState, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { LogIn, LogOut, Coffee, Play, MapPin, Loader2, ReceiptText, Navigation, Camera, X } from 'lucide-react'
import { presenceShort, presenceColors } from '@/lib/pointage'
import { employeeInitials } from '@/lib/equipe'
import type { PresenceType } from '@/types'

const ICONS: Record<PresenceType, typeof LogIn> = { arrivee: LogIn, depart: LogOut, pause: Coffee, reprise: Play, photo: MapPin }

type EventItem = {
  id: string; type: PresenceType; occurred_at: string; note?: string | null
  lat?: number | null; lng?: number | null
  employee_id?: string | null; projectTitle?: string | null; employeeName?: string | null
}

// Récupère la position GPS (résout à null si refusée/indisponible — le pointage reste valide).
function getPosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise(resolve => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { resolve(null); return }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    )
  })
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

  // Fin de journée (§13.2)
  const [showFin, setShowFin] = useState(false)
  const [finAv, setFinAv] = useState('')
  const [finNote, setFinNote] = useState('')
  const [finProb, setFinProb] = useState('')
  const [finMat, setFinMat] = useState('')

  // Photo du chantier (→ compte-rendu client)
  const [finPhoto, setFinPhoto] = useState<File | null>(null)
  const [finPhotoUrl, setFinPhotoUrl] = useState<string | null>(null)
  const finPhotoRef = useRef<HTMLInputElement>(null)
  const quickPhotoRef = useRef<HTMLInputElement>(null)
  const [photoBusy, setPhotoBusy] = useState(false)

  const AV_TO_PCT: Record<string, number> = { '25 %': 25, '50 %': 50, '75 %': 75, 'Terminé': 100 }

  function pickFinPhoto(f: File | null) {
    setFinPhoto(f)
    setFinPhotoUrl(prev => { if (prev) URL.revokeObjectURL(prev); return f ? URL.createObjectURL(f) : null })
  }

  // Crée un point d'avancement (site_updates), avec ou sans photo (upload dans le bucket documents).
  async function createSiteUpdate(file: File | null, progress: number | null, note: string | null) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { toast.error('Non connecté'); return false }
    let path: string | null = null
    if (file && file.size > 0) {
      const safe = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_') || 'photo.jpg'
      path = `comptes-rendus/${user.id}/${Date.now()}-${safe}`
      const { error: upErr } = await supabase.storage.from('documents').upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false })
      if (upErr) { toast.error('Envoi de la photo impossible'); return false }
    }
    const { error } = await supabase.from('site_updates').insert({
      user_id: user.id, project_id: projectId || null, employee_id: employeeId || null,
      progress, note: note?.trim() || null, photo_path: path,
    })
    if (error) { if (path) await supabase.storage.from('documents').remove([path]); toast.error('Enregistrement impossible'); return false }
    return true
  }

  // Photo rapide (hors fin de journée) → compte-rendu.
  async function submitQuickPhoto(f: File) {
    if (!projectId) { toast.error('Choisissez d’abord un chantier'); return }
    setPhotoBusy(true)
    const ok = await createSiteUpdate(f, null, null)
    setPhotoBusy(false)
    if (ok) { toast.success('Photo ajoutée au compte-rendu 📸'); router.refresh() }
  }

  const empById = useMemo(() => new Map(employees.map(e => [e.id, e])), [employees])
  const notPointed = useMemo(() => {
    const pointed = new Set(events.filter(e => e.type === 'arrivee' && e.employee_id).map(e => e.employee_id))
    return assignedToday.map(id => empById.get(id)).filter((e): e is NonNullable<typeof e> => !!e).filter(e => !pointed.has(e.id))
  }, [events, assignedToday, empById])

  async function record(type: PresenceType, noteText?: string) {
    setBusy(type)
    try {
      const pos = await getPosition()
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { toast.error('Non connecté'); return }
      const { error } = await supabase.from('presence_events').insert({
        user_id: user.id, project_id: projectId || null, employee_id: employeeId || null,
        type, note: noteText?.trim() || null, lat: pos?.lat ?? null, lng: pos?.lng ?? null,
      })
      if (error) { toast.error('Erreur lors de l’enregistrement'); return }
      toast.success(pos ? `${presenceShort[type]} enregistrée 📍` : `${presenceShort[type]} enregistrée (position indisponible)`)
      setNoteQuick('')
      router.refresh()
    } finally { setBusy(null) }
  }

  async function submitFin() {
    const parts: string[] = []
    if (finAv) parts.push(`Avancement : ${finAv}`)
    if (finNote.trim()) parts.push(finNote.trim())
    if (finProb.trim()) parts.push(`Problème : ${finProb.trim()}`)
    if (finMat.trim()) parts.push(`Matériel manquant : ${finMat.trim()}`)
    await record('depart', parts.join(' · '))
    // Point d'avancement pour le compte-rendu client (photo + % + note visible client).
    if (finPhoto || finAv || finNote.trim()) {
      const ok = await createSiteUpdate(
        finPhoto,
        finAv ? AV_TO_PCT[finAv] ?? null : null,
        finNote.trim() || (finAv ? `Avancement : ${finAv}` : null),
      ).catch(() => false)
      if (finPhoto && ok) toast.success('Photo ajoutée au compte-rendu 📸')
    }
    setShowFin(false); setFinAv(''); setFinNote(''); setFinProb(''); setFinMat(''); pickFinPhoto(null)
  }

  const AVANCEMENT = ['25 %', '50 %', '75 %', 'Terminé']

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

      {/* Bouton principal : je pointe (arrivée géolocalisée) */}
      <button onClick={() => record('arrivee', noteQuick)} disabled={busy !== null}
        className="card-interactive w-full flex items-center justify-center gap-3 rounded-2xl bg-emerald-600 text-white py-6 px-4 font-semibold text-lg shadow-[var(--shadow-brand)] disabled:opacity-60">
        {busy === 'arrivee' ? <Loader2 className="w-6 h-6 animate-spin" /> : <MapPin className="w-6 h-6" strokeWidth={2.2} />}
        Je pointe — je suis au chantier
      </button>

      {/* Pause / reprise */}
      <div className="grid grid-cols-2 gap-3">
        {(['pause', 'reprise'] as PresenceType[]).map(type => {
          const Icon = ICONS[type]; const isBusy = busy === type
          return (
            <button key={type} onClick={() => record(type, noteQuick)} disabled={busy !== null}
              className="card-interactive flex flex-col items-center justify-center gap-2 rounded-2xl border border-gray-200/80 bg-white py-5 px-3 text-center disabled:opacity-60">
              <span className={`grid place-items-center w-11 h-11 rounded-xl ${presenceColors[type]}`}>
                {isBusy ? <Loader2 className="w-6 h-6 animate-spin" /> : <Icon className="w-6 h-6" strokeWidth={2.1} />}
              </span>
              <span className="text-sm font-semibold text-marine leading-tight">{type === 'pause' ? 'Pause déjeuner' : 'Je reprends'}</span>
            </button>
          )
        })}
      </div>

      {/* Photo du chantier (→ compte-rendu client) */}
      <input ref={quickPhotoRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) submitQuickPhoto(f); if (quickPhotoRef.current) quickPhotoRef.current.value = '' }} />
      <button onClick={() => quickPhotoRef.current?.click()} disabled={photoBusy || busy !== null}
        className="card-interactive w-full flex items-center justify-center gap-2.5 rounded-2xl border border-gray-200/80 bg-white py-4 px-4 font-semibold text-marine disabled:opacity-60">
        {photoBusy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5 text-primary" strokeWidth={2.1} />}
        Photo du chantier
        <span className="text-xs font-normal text-gray-400">— pour le compte-rendu client</span>
      </button>

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
            {/* Photo du jour pour le compte-rendu */}
            <input ref={finPhotoRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={e => pickFinPhoto(e.target.files?.[0] ?? null)} />
            {finPhotoUrl ? (
              <div className="relative w-full h-40 rounded-xl overflow-hidden border border-gray-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={finPhotoUrl} alt="Photo du chantier" className="w-full h-full object-cover" />
                <button type="button" onClick={() => pickFinPhoto(null)}
                  className="absolute top-2 right-2 grid place-items-center w-8 h-8 rounded-full bg-black/50 text-white hover:bg-black/70"><X className="w-4 h-4" /></button>
              </div>
            ) : (
              <button type="button" onClick={() => finPhotoRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 py-4 text-sm font-medium text-gray-500 hover:border-primary hover:text-primary transition-colors">
                <Camera className="w-5 h-5" /> Ajouter une photo du chantier
              </button>
            )}
            <Link href={`/tickets${projectId ? `?project=${projectId}` : ''}`}>
              <Button type="button" variant="outline" className="gap-2"><ReceiptText className="w-4 h-4" /> Ajouter un ticket dépense</Button>
            </Link>
            <Button onClick={submitFin} disabled={busy !== null} className="w-full h-11 gap-2">
              {busy === 'depart' ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />} Pointer mon départ (géolocalisé)
            </Button>
          </CardContent>
        </Card>
      )}

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
                    {ev.lat != null && ev.lng != null && (
                      <a href={`https://www.google.com/maps/search/?api=1&query=${ev.lat},${ev.lng}`} target="_blank" rel="noopener noreferrer"
                        title="Voir la position" className="flex-shrink-0 grid place-items-center w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100">
                        <Navigation className="w-4 h-4" />
                      </a>
                    )}
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

      <p className="text-xs text-gray-400">Pointage géolocalisé : à l&apos;arrivée, à la pause déjeuner/reprise et au départ. La position et l&apos;heure du clic sont enregistrées et remontent côté bureau.</p>
    </div>
  )
}
