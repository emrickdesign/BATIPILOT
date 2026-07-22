'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { CalendarOff, Plus, Trash2, Loader2 } from 'lucide-react'

export type Absence = {
  id: string; start_date: string; end_date: string; type: string; reason: string | null
}

const TYPES: Record<string, string> = {
  conges: 'Congés payés', maladie: 'Arrêt maladie', rtt: 'RTT',
  formation: 'Formation', sans_solde: 'Sans solde', autre: 'Autre',
}

export default function AbsencesPanel({ employeeId, initial }: { employeeId: string; initial: Absence[] }) {
  const router = useRouter()
  const [rows, setRows] = useState<Absence[]>(initial)
  const [open, setOpen] = useState(false)
  const [type, setType] = useState('conges')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const today = new Date().toISOString().split('T')[0]

  async function add() {
    if (!start || !end) { toast.error('Renseignez les dates'); return }
    if (end < start) { toast.error('La date de fin précède le début'); return }
    setBusy(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setBusy(false); return }
    const { data, error } = await supabase.from('absences')
      .insert({ user_id: user.id, employee_id: employeeId, type, start_date: start, end_date: end, reason: reason || null })
      .select().single()
    setBusy(false)
    if (error || !data) { toast.error('Erreur enregistrement'); return }
    setRows(prev => [data as Absence, ...prev])
    setOpen(false); setStart(''); setEnd(''); setReason(''); setType('conges')
    toast.success('Absence ajoutée')
    router.refresh()
  }

  async function remove(aid: string) {
    setRows(prev => prev.filter(r => r.id !== aid))
    const supabase = createClient()
    await supabase.from('absences').delete().eq('id', aid)
    router.refresh()
  }

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2"><CalendarOff className="w-4 h-4 text-gray-400" /> Absences & congés</CardTitle>
        <Button variant="outline" size="sm" onClick={() => setOpen(o => !o)}><Plus className="w-4 h-4 mr-1" /> Ajouter</Button>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-2">
        {open && (
          <div className="rounded-lg border border-gray-200 p-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500">Type</label>
                <select value={type} onChange={e => setType(e.target.value)} className="w-full h-8 border border-gray-200 rounded-md px-2 text-sm bg-white">
                  {Object.entries(TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500">Motif (optionnel)</label>
                <Input value={reason} onChange={e => setReason(e.target.value)} className="h-8 text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500">Du</label>
                <Input type="date" value={start} onChange={e => setStart(e.target.value)} className="h-8 text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500">Au</label>
                <Input type="date" value={end} onChange={e => setEnd(e.target.value)} className="h-8 text-sm" />
              </div>
            </div>
            <Button size="sm" onClick={add} disabled={busy} className="gap-1">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Enregistrer
            </Button>
          </div>
        )}

        {rows.length === 0 ? (
          <p className="text-sm text-gray-400 py-1">Aucune absence enregistrée.</p>
        ) : rows.map(a => {
          const enCours = a.start_date <= today && a.end_date >= today
          const futur = a.start_date > today
          return (
            <div key={a.id} className="flex items-center gap-2 text-sm border border-gray-100 rounded-lg px-3 py-2">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${enCours ? 'bg-rose-500' : futur ? 'bg-amber-400' : 'bg-gray-300'}`} />
              <div className="flex-1 min-w-0">
                <span className="font-medium text-gray-800">{TYPES[a.type] || a.type}</span>
                <span className="text-gray-500"> · {new Date(a.start_date).toLocaleDateString('fr-FR')} → {new Date(a.end_date).toLocaleDateString('fr-FR')}</span>
                {a.reason && <span className="text-gray-400"> · {a.reason}</span>}
              </div>
              {enCours && <span className="text-[11px] font-semibold text-rose-600">en cours</span>}
              <button onClick={() => remove(a.id)} className="text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
