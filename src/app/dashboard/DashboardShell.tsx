'use client'

/**
 * Coquille du tableau de bord : contenu à gauche, panneau assistant ANCRÉ à droite
 * (une seule case stable, ~moitié de largeur, pleine hauteur) sur grand écran ;
 * tiroir latéral sur écran plus petit. Ouvrable / fermable, choix mémorisé.
 */
import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import DashboardAssistant from '@/components/assistant/DashboardAssistant'

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  const [wide, setWide] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
    try { setOpen(localStorage.getItem('tp_assistant_open') !== '0') } catch {}
    const mq = window.matchMedia('(min-width: 1280px)')
    const f = () => setWide(mq.matches)
    f(); mq.addEventListener('change', f)
    return () => mq.removeEventListener('change', f)
  }, [])
  useEffect(() => { if (mounted) try { localStorage.setItem('tp_assistant_open', open ? '1' : '0') } catch {} }, [open, mounted])

  const dockedOpen = mounted && wide && open
  const drawerOpen = mounted && !wide && open

  return (
    <div className={dockedOpen ? 'grid grid-cols-[minmax(0,1fr)_minmax(380px,42%)] gap-6 items-start' : ''}>
      <div className="min-w-0">{children}</div>

      {/* Ancré à droite (grand écran) */}
      {dockedOpen && (
        <div className="sticky top-4 h-[calc(100vh-2rem)]">
          <DashboardAssistant onCollapse={() => setOpen(false)} />
        </div>
      )}

      {/* Tiroir latéral (écran moyen) */}
      {drawerOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]" onClick={() => setOpen(false)} aria-hidden />
          <div className="fixed inset-y-0 right-0 z-40 w-[min(440px,94vw)] p-3">
            <DashboardAssistant onCollapse={() => setOpen(false)} />
          </div>
        </>
      )}

      {/* Rouvrir (quand replié) */}
      {mounted && !open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Ouvrir l’assistant IA"
          className="group fixed bottom-6 right-6 z-40 flex h-14 items-center gap-2.5 rounded-full pl-4 pr-5 text-white shadow-[0_10px_30px_rgba(224,103,76,.5)] transition-transform hover:scale-105 active:scale-95"
          style={{ background: 'radial-gradient(120% 140% at 100% 0%, #F5A623 0%, #E0674C 55%, #C14E33 100%)' }}
        >
          <Sparkles className="h-5 w-5" strokeWidth={2.2} />
          <span className="font-heading text-sm font-semibold">IA TonPilote</span>
        </button>
      )}
    </div>
  )
}
