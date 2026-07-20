'use client'

import { useRef, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Mic, MicOff, Sparkles, Loader2, SkipForward } from 'lucide-react'
import { toast } from 'sonner'

export type Question = { question: string; exemple?: string }

/**
 * Étape 2 du parcours : l'IA a lu le plan et pose SES questions.
 * Un micro par question — c'est le point clé : dicter une réponse ciblée est
 * bien plus précis qu'un seul long message vocal fourre-tout.
 */
export default function QuestionsStep({
  lecture, pieces, questions, reponses, setReponses, onAnalyser, onSkip, analysing,
}: {
  lecture: string
  pieces: string[]
  questions: Question[]
  reponses: string[]
  setReponses: (r: string[]) => void
  onAnalyser: () => void
  onSkip: () => void
  analysing: boolean
}) {
  const recognitionRef = useRef<{ stop: () => void } | null>(null)
  const [recordingIdx, setRecordingIdx] = useState<number | null>(null)

  function setReponse(i: number, v: string) {
    const next = [...reponses]
    next[i] = v
    setReponses(next)
  }

  function toggleVoice(i: number) {
    if (recordingIdx === i) { recognitionRef.current?.stop(); setRecordingIdx(null); return }
    recognitionRef.current?.stop()

    const w = window as unknown as { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any }
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition
    if (!SR) { toast.error('Reconnaissance vocale non supportée par ce navigateur'); return }

    const r = new SR()
    r.lang = 'fr-FR'; r.continuous = true; r.interimResults = false
    r.onresult = (e: { resultIndex: number; results: { [k: number]: { [k: number]: { transcript: string } }; length: number } }) => {
      let txt = ''
      for (let k = e.resultIndex; k < e.results.length; k++) txt += e.results[k][0].transcript + ' '
      setReponses(prevAll(i, txt.trim()))
    }
    r.onend = () => setRecordingIdx(null)
    r.onerror = () => { toast.error('Erreur micro'); setRecordingIdx(null) }
    recognitionRef.current = r
    r.start()
    setRecordingIdx(i)
  }

  // La reconnaissance vocale émet en asynchrone : on recompose à partir de la
  // dernière valeur connue plutôt que d'écraser les autres réponses.
  function prevAll(i: number, txt: string) {
    const next = [...reponses]
    next[i] = (next[i] ? next[i] + ' ' : '') + txt
    return next
  }

  const nbRepondues = reponses.filter(r => r?.trim()).length

  return (
    <div className="space-y-4">
      <Card className="border-blue-200 bg-blue-50/50">
        <CardContent className="p-4">
          <p className="text-sm text-blue-900"><span className="font-semibold">Ce que je vois :</span> {lecture}</p>
          {pieces.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {pieces.map((p, i) => <Badge key={i} variant="outline" className="text-xs bg-white">{p}</Badge>)}
            </div>
          )}
        </CardContent>
      </Card>

      <div>
        <p className="text-sm font-semibold text-marine">Quelques précisions pour chiffrer juste</p>
        <p className="text-xs text-gray-500">Réponds à la voix ou au clavier. Tu peux en sauter — l&apos;IA fera une hypothèse.</p>
      </div>

      <div className="space-y-3">
        {questions.map((q, i) => {
          const rec = recordingIdx === i
          return (
            <Card key={i} className={rec ? 'border-red-300' : ''}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start gap-2">
                  <span className="grid place-items-center w-6 h-6 rounded-full bg-accent text-primary text-xs font-bold flex-shrink-0">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900">{q.question}</p>
                    {q.exemple && <p className="text-[11px] text-gray-400">{q.exemple}</p>}
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Textarea
                    value={reponses[i] || ''}
                    onChange={e => setReponse(i, e.target.value)}
                    rows={2}
                    placeholder={rec ? 'Parlez…' : 'Votre réponse'}
                    className="flex-1 text-sm"
                  />
                  <Button type="button" variant={rec ? 'destructive' : 'outline'} size="icon"
                    onClick={() => toggleVoice(i)} title={rec ? 'Arrêter' : 'Dicter'}>
                    {rec ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button variant="ghost" onClick={onSkip} disabled={analysing} className="gap-1.5">
          <SkipForward className="w-4 h-4" /> Tout passer
        </Button>
        <Button onClick={onAnalyser} disabled={analysing} className="flex-1 min-w-[220px] h-11 gap-2">
          {analysing
            ? <><Loader2 className="w-5 h-5 animate-spin" /> Chiffrage en cours…</>
            : <><Sparkles className="w-5 h-5" /> Chiffrer le plan ({nbRepondues}/{questions.length} réponses)</>}
        </Button>
      </div>
    </div>
  )
}
