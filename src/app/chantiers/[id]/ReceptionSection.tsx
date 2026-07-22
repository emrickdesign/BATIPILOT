'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { ClipboardCheck, Plus, Check, Copy, Loader2, CircleDot } from 'lucide-react'

type Reserve = { label: string; resolved: boolean; resolved_date: string | null }
export type Reception = {
  id: string; reception_date: string; has_reserves: boolean; reserves: Reserve[]
  notes: string | null; status: string
}

export default function ReceptionSection({
  projectId, clientName, initial, signatureId,
}: {
  projectId: string; clientName: string
  initial: Reception | null; signatureId: string | null
}) {
  const router = useRouter()
  const [reception, setReception] = useState<Reception | null>(initial)
  const [sigId, setSigId] = useState<string | null>(signatureId)
  const [reserves, setReserves] = useState<Reserve[]>(initial?.reserves || [])
  const [newReserve, setNewReserve] = useState('')
  const [busy, setBusy] = useState(false)

  const signUrl = sigId ? `${typeof window !== 'undefined' ? window.location.origin : ''}/signature/${sigId}` : ''

  async function create() {
    setBusy(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setBusy(false); return }
    const { data: rec, error } = await supabase.from('project_receptions')
      .insert({ user_id: user.id, project_id: projectId }).select().single()
    if (error || !rec) { toast.error('Erreur création réception'); setBusy(false); return }
    const { data: sig } = await supabase.from('document_signatures')
      .insert({ user_id: user.id, reception_id: rec.id, signer_name: clientName }).select('id').single()
    setReception(rec as Reception)
    setReserves([])
    if (sig) setSigId(sig.id)
    setBusy(false)
    toast.success('PV de réception créé — partagez le lien de signature')
    router.refresh()
  }

  async function persistReserves(next: Reserve[]) {
    setReserves(next)
    const supabase = createClient()
    await supabase.from('project_receptions')
      .update({ reserves: next, has_reserves: next.length > 0 }).eq('id', reception!.id)
    router.refresh()
  }

  function addReserve() {
    const label = newReserve.trim()
    if (!label) return
    persistReserves([...reserves, { label, resolved: false, resolved_date: null }])
    setNewReserve('')
  }

  function toggleReserve(i: number) {
    persistReserves(reserves.map((r, idx) => idx === i
      ? { ...r, resolved: !r.resolved, resolved_date: !r.resolved ? new Date().toISOString().split('T')[0] : null }
      : r))
  }

  function copyLink() {
    if (!signUrl) return
    navigator.clipboard.writeText(signUrl)
    toast.success('Lien copié')
  }

  const openReserves = reserves.filter(r => !r.resolved).length

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-base flex items-center gap-2">
          <ClipboardCheck className="w-4 h-4 text-gray-400" /> Réception de chantier
          {reception && (
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${reception.status === 'signee' ? 'bg-[#3F7A2E]/10 text-[#3F7A2E]' : 'bg-amber-100 text-amber-700'}`}>
              {reception.status === 'signee' ? 'Signée' : 'À signer'}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        {!reception ? (
          <>
            <p className="text-sm text-gray-500">Le PV de réception acte la fin des travaux, déclenche le solde et fait courir les garanties. Le client le signe en ligne.</p>
            <Button onClick={create} disabled={busy} className="gap-2">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-4 h-4" />} Prononcer la réception
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-600">Réception du {new Date(reception.reception_date).toLocaleDateString('fr-FR')}. {openReserves > 0 ? <span className="text-amber-700 font-medium">{openReserves} réserve{openReserves > 1 ? 's' : ''} à lever</span> : <span className="text-[#3F7A2E] font-medium">Sans réserve</span>}</p>

            <div className="space-y-1.5">
              {reserves.map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <button onClick={() => toggleReserve(i)} className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 ${r.resolved ? 'bg-[#3F7A2E] border-[#3F7A2E] text-white' : 'border-gray-300 text-transparent'}`}>
                    {r.resolved ? <Check className="w-3.5 h-3.5" /> : <CircleDot className="w-3 h-3" />}
                  </button>
                  <span className={r.resolved ? 'line-through text-gray-400' : 'text-gray-700'}>{r.label}</span>
                  {r.resolved && r.resolved_date && <span className="text-[11px] text-gray-400">levée le {new Date(r.resolved_date).toLocaleDateString('fr-FR')}</span>}
                </div>
              ))}
              <div className="flex gap-2 pt-1">
                <Input value={newReserve} onChange={e => setNewReserve(e.target.value)} onKeyDown={e => e.key === 'Enter' && addReserve()} placeholder="Ajouter une réserve…" className="h-8 text-sm" />
                <Button variant="outline" size="sm" onClick={addReserve} className="gap-1 flex-shrink-0"><Plus className="w-3.5 h-3.5" /> Réserve</Button>
              </div>
            </div>

            {sigId && (
              <div className="flex items-center gap-2 rounded-lg bg-gray-50 p-2 border border-gray-200">
                <input readOnly value={signUrl} className="flex-1 bg-transparent text-xs text-gray-500 outline-none" />
                <Button variant="outline" size="sm" onClick={copyLink} className="gap-1 flex-shrink-0"><Copy className="w-3.5 h-3.5" /> Copier</Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
