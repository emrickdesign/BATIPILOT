'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import AssistantChat from './AssistantChat'
import AssistantVoiceMode from './AssistantVoiceMode'

/**
 * Lanceur flottant de l'assistant, monté dans AppLayout : présent sur toutes
 * les pages admin. Un bouton en bas à droite ouvre la fenêtre de chat ; depuis
 * le chat, le bouton micro bascule en mode vocal plein écran.
 */
export default function AssistantLauncher() {
  const [chatOpen, setChatOpen] = useState(false)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const pathname = usePathname()

  // Sur le tableau de bord, l'assistant est déjà ancré à droite (DashboardShell) :
  // on masque le lanceur flottant global pour ne pas avoir deux assistants.
  if (pathname === '/dashboard') return null

  return (
    <>
      {/* Bouton flottant (masqué quand le chat est ouvert) */}
      {!chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          aria-label="Ouvrir l’assistant IA"
          title="Assistant IA TonPilote"
          className="group fixed bottom-4 right-4 z-[60] grid h-14 w-14 place-items-center rounded-full text-white shadow-[0_10px_30px_rgba(224,103,76,.5)] transition-transform hover:scale-105 active:scale-95 sm:bottom-6 sm:right-6"
          style={{ background: 'radial-gradient(120% 140% at 100% 0%, #F5A623 0%, #E0674C 55%, #C14E33 100%)' }}
        >
          <span aria-hidden className="absolute inset-0 rounded-full ring-2 ring-[#F5A623]/40 animate-ping" style={{ animationDuration: '2.8s' }} />
          <Sparkles className="relative h-6 w-6" strokeWidth={2.2} />
        </button>
      )}

      {chatOpen && (
        <AssistantChat
          onClose={() => setChatOpen(false)}
          onVoice={() => { setChatOpen(false); setVoiceOpen(true) }}
        />
      )}

      {voiceOpen && (
        <AssistantVoiceMode onClose={() => setVoiceOpen(false)} />
      )}
    </>
  )
}
