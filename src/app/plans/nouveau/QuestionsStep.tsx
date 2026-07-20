'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Sparkles, Loader2, SkipForward } from 'lucide-react'
import DictationButton from '@/components/DictationButton'

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
  function setReponse(i: number, v: string) {
    const next = [...reponses]
    next[i] = v
    setReponses(next)
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
        {questions.map((q, i) => (
          <Card key={i}>
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
                  placeholder="Votre réponse — au clavier ou au micro"
                  className="flex-1 text-sm"
                />
                <DictationButton value={reponses[i] || ''} onChange={v => setReponse(i, v)} />
              </div>
            </CardContent>
          </Card>
        ))}
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
