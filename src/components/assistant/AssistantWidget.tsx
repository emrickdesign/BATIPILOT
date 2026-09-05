'use client'

import { useState } from 'react'
import { Sparkles, Mic, ArrowUpRight } from 'lucide-react'
import AssistantVoiceMode from './AssistantVoiceMode'

const SUGGESTIONS = [
  'Recap de mes derniers mails',
  'Où en sont mes paiements ?',
  'Mes chantiers en cours',
]

export default function AssistantWidget() {
  const [open, setOpen] = useState(false)
  const [initial, setInitial] = useState<string | undefined>(undefined)

  const launch = (q?: string) => { setInitial(q); setOpen(true) }

  return (
    <>
      <div
        className="relative overflow-hidden rounded-2xl p-5 text-white"
        style={{ background: 'radial-gradient(120% 140% at 100% 0%, #241a10 0%, #121013 45%, #0c0c0e 100%)' }}
      >
        {/* onde décorative */}
        <div aria-hidden className="pointer-events-none absolute -right-6 -top-8 h-40 w-40 rounded-full" style={{ background: 'radial-gradient(circle, rgba(245,166,35,.18), transparent 70%)' }} />

        <div className="relative flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="grid place-items-center w-10 h-10 rounded-xl bg-[#F5A623] text-black"><Sparkles className="w-5 h-5" /></span>
            <div>
              <div className="font-heading font-bold leading-tight">IA TonPilote</div>
              <div className="text-xs text-white/50">Demande-moi tout sur ton activité</div>
            </div>
          </div>
        </div>

        <div className="relative mt-4 grid grid-cols-1 sm:grid-cols-[1.3fr_1fr] gap-3">
          {/* Let's Talk */}
          <button
            onClick={() => launch()}
            className="group relative flex flex-col justify-between rounded-2xl bg-white/[0.05] hover:bg-white/[0.09] border border-white/10 p-4 h-32 text-left transition-colors"
          >
            <span className="grid place-items-center w-10 h-10 rounded-full bg-[#F5A623] text-black" style={{ boxShadow: '0 0 24px rgba(245,166,35,.4)' }}><Mic className="w-5 h-5" /></span>
            <span className="text-lg font-heading font-semibold">Let’s Talk</span>
            <ArrowUpRight className="absolute top-4 right-4 w-4 h-4 text-white/40 group-hover:text-white/80" />
          </button>

          {/* Suggestions */}
          <div className="flex flex-col gap-2">
            {SUGGESTIONS.map(s => (
              <button
                key={s}
                onClick={() => launch(s)}
                className="flex-1 text-left rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 px-3 py-2 text-[13px] text-white/80 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {open && <AssistantVoiceMode onClose={() => setOpen(false)} initial={initial} />}
    </>
  )
}
