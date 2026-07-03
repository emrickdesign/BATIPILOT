'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { HardHat, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { employeeInitials } from '@/lib/equipe'
import { verifyEmployeePin } from '../actions'

type EmployeeLite = { id: string; full_name: string; color: string }

export default function PinGate({ employees, preselected }: { employees: EmployeeLite[]; preselected?: string }) {
  const router = useRouter()
  const [empId, setEmpId] = useState<string | null>(preselected || null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const selected = employees.find(e => e.id === empId)

  async function handleSubmit() {
    if (!empId || pin.length < 4) return
    setBusy(true)
    setError(null)
    const res = await verifyEmployeePin(empId, pin)
    setBusy(false)
    if (res.error) { setError(res.error); setPin('') }
    else router.refresh()
  }

  if (!selected) {
    return (
      <div className="min-h-screen bg-[#0F172A] text-white p-5">
        <div className="max-w-md mx-auto pt-8 space-y-6">
          <div className="text-center">
            <span className="inline-grid place-items-center w-14 h-14 rounded-2xl bg-gradient-to-br from-[#FF8A2B] to-[#FF6A00] mb-3"><Lock className="w-7 h-7 text-white" /></span>
            <h1 className="text-xl font-bold">Messages</h1>
            <p className="text-slate-400 text-sm mt-1">Qui es-tu ? Un code confidentiel te sera demandé ensuite.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {employees.map(e => (
              <button key={e.id} onClick={() => setEmpId(e.id)} className="rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 p-4 flex flex-col items-center gap-2 text-center transition-colors">
                <span className="grid place-items-center w-12 h-12 rounded-full text-white font-bold" style={{ backgroundColor: e.color }}>{employeeInitials(e.full_name)}</span>
                <span className="text-sm font-medium truncate w-full">{e.full_name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0F172A] text-white p-5">
      <div className="max-w-xs mx-auto pt-16 space-y-6 text-center">
        <span className="grid place-items-center w-16 h-16 rounded-full text-white font-bold text-xl mx-auto" style={{ backgroundColor: selected.color }}>{employeeInitials(selected.full_name)}</span>
        <div>
          <h1 className="text-lg font-bold">{selected.full_name}</h1>
          <p className="text-slate-400 text-sm mt-1">Entre ton code confidentiel</p>
        </div>
        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={pin}
          onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          maxLength={6}
          placeholder="••••"
          className="w-full text-center text-2xl tracking-[0.5em] h-14 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-slate-500 focus:outline-none focus:border-primary"
        />
        {error && <p className="text-rose-400 text-sm">{error}</p>}
        <Button className="w-full h-12" disabled={pin.length < 4 || busy} onClick={handleSubmit}>
          {busy ? 'Vérification...' : 'Valider'}
        </Button>
        <button onClick={() => { setEmpId(null); setPin(''); setError(null) }} className="text-slate-400 text-sm flex items-center gap-1.5 mx-auto">
          <HardHat className="w-3.5 h-3.5" /> Ce n&apos;est pas moi
        </button>
      </div>
    </div>
  )
}
