'use client'

/**
 * Coquille du tableau de bord : contenu en pleine largeur + assistant en petite
 * case flottante en bas à droite (ouvrable / fermable, choix mémorisé).
 */
import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import DashboardAssistant from '@/components/assistant/DashboardAssistant'

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
    try {
      const stored = localStorage.getItem('tp_assistant_open')
      // Par défaut : ouvert sur ordinateur, FERMÉ sur mobile (pour ne pas couvrir l'écran).
      if (stored != null) setOpen(stored !== '0')
      else setOpen(!window.matchMedia('(max-width: 640px)').matches)
    } catch { setOpen(true) }
  }, [])
  useEffect(() => { if (mounted) try { localStorage.setItem('tp_assistant_open', open ? '1' : '0') } catch {} }, [open, mounted])

  return (
    <>
      {children}

      {mounted && open && <DashboardAssistant onClose={() => setOpen(false)} />}

      {mounted && !open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Ouvrir l’assistant IA"
          title="Assistant IA TonPilote"
          className="group fixed bottom-4 right-4 z-[60] grid h-14 w-14 place-items-center rounded-full text-white shadow-[0_10px_30px_rgba(224,103,76,.5)] transition-transform hover:scale-105 active:scale-95 sm:bottom-6 sm:right-6"
          style={{ background: 'radial-gradient(120% 140% at 100% 0%, #F5A623 0%, #E0674C 55%, #C14E33 100%)' }}
        >
          <span aria-hidden className="absolute inset-0 rounded-full ring-2 ring-[#F5A623]/40 animate-ping" style={{ animationDuration: '2.8s' }} />
          <Sparkles className="relative h-6 w-6" strokeWidth={2.2} />
        </button>
      )}
    </>
  )
}
