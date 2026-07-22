'use client'

import { useEffect, useRef, useState } from 'react'
import SignaturePad from 'signature_pad'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Eraser, Loader2, PenLine, CheckCircle } from 'lucide-react'

export default function SignatureForm({
  signatureId, defaultName, defaultEmail, docTypeLabel,
}: {
  signatureId: string
  defaultName: string
  defaultEmail: string
  docTypeLabel: 'devis' | 'facture' | 'contrat' | 'réception'
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const padRef = useRef<SignaturePad | null>(null)
  const [name, setName] = useState(defaultName)
  const [email, setEmail] = useState(defaultEmail)
  const [consent, setConsent] = useState(false)
  const [hasStroke, setHasStroke] = useState(false)
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const pad = new SignaturePad(canvas, { backgroundColor: '#ffffff', penColor: '#111827' })
    padRef.current = pad
    pad.addEventListener('endStroke', () => setHasStroke(!pad.isEmpty()))

    function resize() {
      if (!canvas) return
      const ratio = Math.max(window.devicePixelRatio || 1, 1)
      const data = pad.toData()
      canvas.width = canvas.offsetWidth * ratio
      canvas.height = canvas.offsetHeight * ratio
      canvas.getContext('2d')?.scale(ratio, ratio)
      pad.clear()
      if (data.length) pad.fromData(data)
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  function handleClear() {
    padRef.current?.clear()
    setHasStroke(false)
  }

  async function handleSubmit() {
    if (!name.trim()) { toast.error("Merci d'indiquer votre nom"); return }
    if (!padRef.current || padRef.current.isEmpty()) { toast.error('Merci de signer dans le cadre ci-dessus'); return }
    if (!consent) { toast.error('Merci de cocher la case de consentement'); return }

    setLoading(true)
    try {
      const signatureImage = padRef.current.toDataURL('image/png')
      const res = await fetch(`/api/signature/${signatureId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signerName: name.trim(), signerEmail: email.trim(), signatureImage, consent: true }),
      })
      const json = await res.json()
      if (res.ok) setSubmitted(true)
      else toast.error(json.error || 'Erreur lors de la signature')
    } catch {
      toast.error('Erreur réseau, réessayez')
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardContent className="p-6 flex flex-col items-center text-center gap-2">
          <CheckCircle className="w-10 h-10 text-green-600" />
          <p className="font-semibold text-green-800">Merci, c&apos;est signé !</p>
          <p className="text-sm text-green-700">
            Une copie {docTypeLabel === 'réception' ? 'du PV de réception' : `du ${docTypeLabel}`} signé vous a été envoyée par email{email ? ` à ${email}` : ''}.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <PenLine className="w-4 h-4 text-primary" />
          <p className="font-semibold text-gray-900">{docTypeLabel === 'réception' ? 'Signer le PV de réception' : `Signer ce ${docTypeLabel}`}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Nom et prénom</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Votre nom" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Email</label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@exemple.fr" />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">Votre signature</label>
          <div className="border-2 border-dashed border-gray-300 rounded-lg bg-white">
            <canvas ref={canvasRef} className="w-full h-40 touch-none rounded-lg" />
          </div>
          <div className="flex justify-end mt-1">
            <Button type="button" variant="ghost" size="sm" className="gap-1 text-gray-500" onClick={handleClear}>
              <Eraser className="w-3.5 h-3.5" /> Effacer
            </Button>
          </div>
        </div>

        <label className="flex items-start gap-2 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-gray-300"
          />
          <span>J&apos;ai pris connaissance {docTypeLabel === 'réception' ? 'du procès-verbal' : `du ${docTypeLabel}`} ci-dessus et je l&apos;accepte (bon pour accord).</span>
        </label>

        <Button
          variant="success" className="w-full gap-2"
          onClick={handleSubmit}
          disabled={loading || !hasStroke || !consent || !name.trim()}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <PenLine className="w-4 h-4" />}
          Signer et valider
        </Button>
      </CardContent>
    </Card>
  )
}
