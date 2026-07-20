'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Mic, MicOff } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

type SpeechResult = { isFinal: boolean; 0: { transcript: string } }
type SpeechEvent = { resultIndex: number; results: { length: number } & Record<number, SpeechResult> }
type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean
  start: () => void; stop: () => void; abort: () => void
  onresult: ((e: SpeechEvent) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
}

/**
 * Dictée continue.
 *
 * Trois pièges que ce composant règle :
 * 1. Le callback de reconnaissance capture l'état au démarrage → on accumule
 *    dans une ref, jamais depuis la prop `value` (sinon une reprise après pause
 *    écrase ce qui précède).
 * 2. Chrome coupe l'écoute tout seul après quelques secondes de silence → on
 *    relance tant que l'utilisateur n'a pas cliqué sur stop.
 * 3. Sans interimResults, rien ne s'affiche avant la fin d'une phrase → on
 *    montre le texte en cours d'écriture, mot à mot.
 */
export default function DictationButton({
  value, onChange, size = 'icon', className, title,
}: {
  value: string
  onChange: (v: string) => void
  size?: 'icon' | 'sm'
  className?: string
  title?: string
}) {
  const [recording, setRecording] = useState(false)
  const recRef = useRef<Recognition | null>(null)
  const baseRef = useRef('')          // texte validé (avant dictée + phrases finalisées)
  const stoppedByUser = useRef(false)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  // Le micro ne doit pas continuer si le composant disparaît
  useEffect(() => () => { stoppedByUser.current = true; recRef.current?.abort() }, [])

  function start() {
    const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition
    if (!SR) { toast.error('Dictée non supportée par ce navigateur (essayez Chrome)'); return }

    baseRef.current = (value || '').trim()
    stoppedByUser.current = false

    const r = new SR()
    r.lang = 'fr-FR'
    r.continuous = true
    r.interimResults = true

    r.onresult = (e: SpeechEvent) => {
      let finals = ''
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        if (res.isFinal) finals += res[0].transcript
        else interim += res[0].transcript
      }
      if (finals.trim()) {
        baseRef.current = (baseRef.current ? baseRef.current + ' ' : '') + finals.trim()
      }
      const composed = (baseRef.current + (interim.trim() ? ' ' + interim.trim() : '')).trim()
      onChangeRef.current(composed)
    }

    r.onend = () => {
      // Coupure automatique après un silence : on repart, la dictée continue
      if (!stoppedByUser.current) {
        try { r.start() } catch { setRecording(false) }
        return
      }
      setRecording(false)
    }

    r.onerror = (ev: { error: string }) => {
      // 'no-speech' et 'aborted' sont normaux pendant une pause : onend relance
      if (ev.error === 'no-speech' || ev.error === 'aborted') return
      if (ev.error === 'not-allowed') toast.error('Micro refusé — autorisez-le dans le navigateur')
      else toast.error('Erreur micro')
      stoppedByUser.current = true
      setRecording(false)
    }

    recRef.current = r
    try { r.start(); setRecording(true) } catch { toast.error('Micro déjà actif') }
  }

  function stop() {
    stoppedByUser.current = true
    recRef.current?.stop()
    setRecording(false)
  }

  return (
    <Button
      type="button"
      variant={recording ? 'destructive' : 'outline'}
      size={size}
      onClick={() => (recording ? stop() : start())}
      title={title || (recording ? 'Arrêter la dictée' : 'Dicter')}
      className={cn(recording && 'animate-pulse', className)}
    >
      {recording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
      {size === 'sm' && <span className="ml-1.5">{recording ? 'Arrêter' : 'Dicter'}</span>}
    </Button>
  )
}
