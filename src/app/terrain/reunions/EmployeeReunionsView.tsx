'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, Mic, Calendar, CheckCircle2, Circle, Flag, HardHat } from 'lucide-react'
import { toast } from 'sonner'
import type { MeetingAction, MeetingSummary } from '@/types'
import { meetingTypeLabel } from '../../reunions/meta'
import { markActionDone } from './actions'

type MeetingRow = {
  id: string
  title: string
  type: any
  occurred_at: string
  summary: MeetingSummary | null
  projects?: { title: string } | null
}

export default function EmployeeReunionsView({
  meetings,
  actions: initialActions,
}: {
  meetings: MeetingRow[]
  actions: MeetingAction[]
}) {
  const [actions, setActions] = useState<MeetingAction[]>(initialActions)

  async function toggle(a: MeetingAction) {
    const done = a.status !== 'done'
    setActions((prev) => prev.map((x) => (x.id === a.id ? { ...x, status: done ? 'done' : 'todo' } : x)))
    try {
      await markActionDone(a.id, done)
    } catch {
      setActions((prev) => prev.map((x) => (x.id === a.id ? { ...x, status: done ? 'todo' : 'done' } : x)))
      toast.error('Action non enregistrée')
    }
  }

  const openCount = actions.filter((a) => a.status !== 'done').length

  return (
    <div className="min-h-screen bg-app-bg p-4">
      <div className="mx-auto max-w-md">
        <Link href="/terrain" className="mb-3 inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600">
          <ChevronLeft className="h-4 w-4" /> Retour
        </Link>
        <h1 className="mb-1 flex items-center gap-2 font-heading text-xl font-bold text-marine">
          <Mic className="h-5 w-5 text-orange-600" /> Mes réunions
        </h1>
        <p className="mb-5 text-sm text-slate-500">
          {openCount > 0 ? `${openCount} action${openCount > 1 ? 's' : ''} à faire.` : 'Aucune action en attente.'}
        </p>

        {meetings.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 px-4 py-12 text-center text-sm text-slate-500">
            Aucune réunion partagée avec toi pour l’instant.
          </div>
        ) : (
          <div className="space-y-4">
            {meetings.map((m) => {
              const mine = actions.filter((a) => a.meeting_id === m.id)
              return (
                <div key={m.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <div className="border-b border-slate-100 p-4">
                    <h2 className="font-semibold text-slate-900">{m.title}</h2>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                      <span>{meetingTypeLabel(m.type)}</span>
                      <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{new Date(m.occurred_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</span>
                      {m.projects?.title && <span className="inline-flex items-center gap-1"><HardHat className="h-3 w-3" />{m.projects.title}</span>}
                    </div>
                    {m.summary?.tldr && <p className="mt-2 text-sm leading-relaxed text-slate-600">{m.summary.tldr}</p>}
                  </div>

                  {mine.length > 0 ? (
                    <ul className="divide-y divide-slate-50">
                      {mine.map((a) => {
                        const done = a.status === 'done'
                        return (
                          <li key={a.id}>
                            <button onClick={() => toggle(a)} className="flex w-full items-start gap-3 p-3 text-left transition hover:bg-slate-50">
                              {done ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" /> : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-slate-300" />}
                              <span className="min-w-0 flex-1">
                                <span className={`block text-sm ${done ? 'text-slate-400 line-through' : 'font-medium text-slate-800'}`}>{a.title}</span>
                                <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                                  {a.due_date && <span>Échéance {new Date(a.due_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</span>}
                                  {a.priority === 'high' && <span className="inline-flex items-center gap-0.5 text-red-500"><Flag className="h-3 w-3" /> Prioritaire</span>}
                                </span>
                              </span>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  ) : (
                    <p className="p-3 text-xs text-slate-400">Aucune action pour toi sur cette réunion.</p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
