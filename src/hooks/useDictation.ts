'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Dictée vocale avec retour en direct.
 *
 * `interim` contient ce que le moteur entend mais n'a pas encore validé : c'est
 * ce qui permet de voir le texte s'écrire pendant qu'on parle. Une fois la
 * phrase stabilisée, elle part dans `onFinal` et `interim` se vide.
 */
export function useDictation(onFinal: (text: string) => void) {
  const [recording, setRecording] = useState(false)
  const [interim, setInterim] = useState('')
  const [supported, setSupported] = useState(true)
  const recognitionRef = useRef<any>(null)
  // onFinal change à chaque rendu du parent : on le garde dans une ref pour ne
  // pas avoir à recréer la reconnaissance (ce qui couperait la dictée en cours).
  const onFinalRef = useRef(onFinal)
  onFinalRef.current = onFinal

  useEffect(() => {
    const SR =
      typeof window !== 'undefined' &&
      ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
    setSupported(!!SR)
  }, [])

  const stop = useCallback(() => {
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setRecording(false)
    setInterim('')
  }, [])

  const start = useCallback(() => {
    const SR =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      setSupported(false)
      return
    }
    const r = new SR()
    r.lang = 'fr-FR'
    // continuous : on ne coupe pas au premier silence, l'utilisateur dicte
    // plusieurs phrases. interimResults : c'est ce qui alimente l'aperçu live.
    r.continuous = true
    r.interimResults = true

    r.onresult = (e: any) => {
      let pending = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const chunk = e.results[i][0].transcript
        if (e.results[i].isFinal) onFinalRef.current(chunk.trim())
        else pending += chunk
      }
      setInterim(pending)
    }
    r.onerror = (e: any) => {
      // "aborted" et "no-speech" sont des fins de vie normales, pas des pannes.
      if (e?.error !== 'aborted' && e?.error !== 'no-speech') setRecording(false)
    }
    r.onend = () => {
      setRecording(false)
      setInterim('')
      recognitionRef.current = null
    }

    recognitionRef.current = r
    r.start()
    setRecording(true)
  }, [])

  const toggle = useCallback(() => {
    if (recording) stop()
    else start()
  }, [recording, start, stop])

  useEffect(() => () => recognitionRef.current?.stop(), [])

  return { recording, interim, supported, toggle, stop }
}
