'use client'

import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { setEmployeePin } from '@/app/terrain/actions'

export default function SetPinButton({ employeeId, employeeName }: { employeeId: string; employeeName: string }) {
  const [open, setOpen] = useState(false)
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSave() {
    setBusy(true)
    const res = await setEmployeePin(employeeId, pin)
    setBusy(false)
    if (res.error) { toast.error(res.error); return }
    toast.success('Code PIN enregistré')
    setOpen(false)
    setPin('')
  }

  return (
    <>
      <button onClick={() => setOpen(true)} title="Code PIN messagerie"
        className="grid place-items-center w-8 h-8 rounded-md text-gray-400 hover:text-teal-600 hover:bg-gray-50">
        <KeyRound className="w-4 h-4" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Code PIN — {employeeName}</DialogTitle>
            <DialogDescription>Ce code (4 à 6 chiffres) permet à {employeeName} d&apos;accéder à la messagerie en toute confidentialité depuis /terrain.</DialogDescription>
          </DialogHeader>
          <Input
            type="text" inputMode="numeric" value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="Ex : 1234" maxLength={6}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
            <Button disabled={pin.length < 4 || busy} onClick={handleSave}>{busy ? 'Enregistrement...' : 'Enregistrer'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
