'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Mic, MicOff } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { createRecognizer, getSpeechRecognitionCtor, speechLikelyBlocked } from '@/lib/speech'

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

  // (Re)crée UNE instance neuve à chaque démarrage/relance : réutiliser une
  // instance déjà terminée est instable sur mobile (surtout iOS).
  function begin() {
    const r = createRecognizer() as Recognition | null
    if (!r) { toast.error('Dictée non supportée par ce navigateur (essayez Chrome)'); setRecording(false); return }

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
      recRef.current = null
      // Coupure auto (silence, ou single-shot iOS) : on relance une instance NEUVE.
      if (!stoppedByUser.current) { setTimeout(() => { if (!stoppedByUser.current) begin() }, 250); return }
      setRecording(false)
    }

    r.onerror = (ev: { error: string }) => {
      // 'no-speech' et 'aborted' sont normaux pendant une pause : onend relance
      if (ev.error === 'no-speech' || ev.error === 'aborted') return
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') toast.error('Micro refusé — autorisez-le dans les réglages du navigateur')
      else toast.error('Erreur micro — réessayez')
      stoppedByUser.current = true
      setRecording(false)
    }

    recRef.current = r
    try { r.start() } catch { /* déjà démarré : ignore, onend relancera */ }
  }

  function start() {
    if (!getSpeechRecognitionCtor()) { toast.error('Dictée non supportée par ce navigateur (essayez Chrome)'); return }
    if (speechLikelyBlocked()) {
      toast.error('La dictée vocale est bloquée par iOS dans l’app installée. Ouvrez TonPilote dans Safari pour dicter.')
      return
    }
    baseRef.current = (value || '').trim()
    stoppedByUser.current = false
    setRecording(true)
    begin()
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
