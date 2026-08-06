'use client'

import { useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Camera, SwitchCamera, Loader2 } from 'lucide-react'

/**
 * Prise de photo par la caméra (webcam MacBook ou appareil mobile) via getUserMedia.
 * Aperçu live + capture → renvoie un File JPEG. Requiert un contexte sécurisé (HTTPS/localhost).
 */
export default function CameraCapture({ onCapture, disabled }: { onCapture: (file: File) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const [facing, setFacing] = useState<'environment' | 'user'>('environment')
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setReady(false); setError(null)

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) { setError("Caméra non disponible sur cet appareil / navigateur."); return }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: false })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {})
        }
        setReady(true)
      } catch {
        setError("Impossible d'accéder à la caméra. Autorisez-la dans le navigateur, ou utilisez « Importer ».")
      }
    }
    start()

    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }, [open, facing])

  function capture() {
    const v = videoRef.current
    if (!v || !v.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = v.videoWidth
    canvas.height = v.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(v, 0, 0)
    canvas.toBlob(blob => {
      if (!blob) return
      onCapture(new File([blob], `photo-${canvas.width}x${canvas.height}.jpg`, { type: 'image/jpeg' }))
      setOpen(false)
    }, 'image/jpeg', 0.9)
  }

  return (
    <>
      <Button size="sm" className="gap-1.5" disabled={disabled} onClick={() => setOpen(true)}>
        <Camera className="w-4 h-4" /> Prendre une photo
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Prendre une photo</DialogTitle></DialogHeader>
          {error ? (
            <p className="text-sm text-[#C0392B] py-6 text-center">{error}</p>
          ) : (
            <>
              <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3] grid place-items-center">
                {!ready && <Loader2 className="w-8 h-8 animate-spin text-white/70 absolute" />}
                <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
              </div>
              <div className="flex items-center justify-between gap-2 mt-1">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setFacing(f => (f === 'environment' ? 'user' : 'environment'))}>
                  <SwitchCamera className="w-4 h-4" /> Changer
                </Button>
                <Button className="gap-1.5" disabled={!ready} onClick={capture}>
                  <Camera className="w-4 h-4" /> Capturer
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
