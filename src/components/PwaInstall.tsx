'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
// Pop-up « Ajouter à l'écran d'accueil », affichée une fois après l'arrivée dans l'app.
//  - Android / Chrome / Edge (mobile + PC) : bouton 1 clic (beforeinstallprompt → prompt()).
//  - iPhone / iPad (Safari) : pas d'API d'installation → on montre le geste (Partager → Sur l'écran d'accueil).
//  - Enregistre aussi le service worker (nécessaire pour que l'installation soit proposée).
import { useCallback, useEffect, useState } from 'react'
import { Download, X, Share, Plus, Smartphone, MonitorDown } from 'lucide-react'

const SEEN_KEY = 'tp_pwa_prompt_v1'

function isStandalone() {
  if (typeof window === 'undefined') return true
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true
}
function isIOS() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && 'ontouchend' in document)
}

export default function PwaInstall() {
  const [deferred, setDeferred] = useState<any>(null)
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'button' | 'ios' | 'manual'>('manual')
  const [installing, setInstalling] = useState(false)

  // Enregistre le service worker (silencieux).
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
  }, [])

  useEffect(() => {
    if (isStandalone()) return
    let seen = false
    try { seen = localStorage.getItem(SEEN_KEY) === '1' } catch {}
    if (seen) return

    const onBIP = (e: any) => { e.preventDefault(); setDeferred(e); setMode('button') }
    window.addEventListener('beforeinstallprompt', onBIP)

    // Laisse le temps à beforeinstallprompt d'arriver, puis décide du mode d'affichage.
    const t = setTimeout(() => {
      if (isStandalone()) return
      setMode(prev => (prev === 'button' ? 'button' : isIOS() ? 'ios' : 'manual'))
      setOpen(true)
    }, 1600)

    return () => { window.removeEventListener('beforeinstallprompt', onBIP); clearTimeout(t) }
  }, [])

  const dismiss = useCallback(() => {
    setOpen(false)
    try { localStorage.setItem(SEEN_KEY, '1') } catch {}
  }, [])

  const install = useCallback(async () => {
    if (!deferred) return
    setInstalling(true)
    try {
      deferred.prompt()
      await deferred.userChoice
    } catch {}
    setInstalling(false)
    setDeferred(null)
    dismiss()
  }, [deferred, dismiss])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[120] grid place-items-end sm:place-items-center bg-black/40 backdrop-blur-[2px] p-3 sm:p-4 animate-fade-in" role="dialog" aria-modal="true">
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-[0_24px_60px_rgba(20,10,0,.32)] animate-fade-up">
        {/* Bandeau */}
        <div className="relative px-5 pt-6 pb-5 text-white text-center" style={{ background: 'radial-gradient(120% 140% at 50% 0%, #E5735A 0%, #D05C43 55%, #C14E33 120%)' }}>
          <button onClick={dismiss} aria-label="Fermer" className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-white/15 hover:bg-white/25"><X className="h-[18px] w-[18px]" /></button>
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-white/95 shadow-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/icon-192.png" alt="TonPilote" className="h-14 w-14 rounded-xl" />
          </span>
          <h2 className="mt-3 font-heading text-xl font-extrabold">Installe TonPilote</h2>
          <p className="mt-1 text-[13px] text-white/85">Accède à ton espace en un tap, comme une vraie appli — sur ton téléphone et ton ordinateur.</p>
        </div>

        {/* Corps */}
        <div className="px-5 py-5">
          {mode === 'button' && (
            <>
              <button onClick={install} disabled={installing}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-[#E0674C] px-5 py-3.5 text-[15px] font-semibold text-white hover:bg-[#c9563d] disabled:opacity-70">
                <Download className="h-5 w-5" /> {installing ? 'Installation…' : 'Ajouter à l’écran d’accueil'}
              </button>
              <p className="mt-3 flex items-center justify-center gap-1.5 text-[12px] text-gray-400"><Smartphone className="h-3.5 w-3.5" /> Un seul clic — rien à télécharger.</p>
            </>
          )}

          {mode === 'ios' && (
            <div className="space-y-3">
              <Step n={1} icon={<Share className="h-4 w-4" />}>Appuie sur <b>Partager</b> en bas de Safari.</Step>
              <Step n={2} icon={<Plus className="h-4 w-4" />}>Choisis <b>« Sur l’écran d’accueil »</b> puis <b>Ajouter</b>.</Step>
              <Step n={3} icon={<Smartphone className="h-4 w-4" />}>Ouvre TonPilote depuis <b>l’icône</b> de l’écran d’accueil.</Step>
            </div>
          )}

          {mode === 'manual' && (
            <div className="space-y-3">
              <Step n={1} icon={<MonitorDown className="h-4 w-4" />}>Sur Chrome : menu <b>⋮</b> (3 points, en haut à droite).</Step>
              <Step n={2} icon={<Download className="h-4 w-4" />}>Choisis <b>« Installer l’application »</b> (ou « Ajouter à l’écran d’accueil »).</Step>
              <Step n={3} icon={<Smartphone className="h-4 w-4" />}>Ouvre TonPilote depuis <b>l’icône</b> installée.</Step>
            </div>
          )}

          {/* Rappel important : rester dans l'app installée, pas dans le navigateur */}
          <div className="mt-3 rounded-xl bg-[#F1F6E9] border border-[#4C6F18]/20 px-3 py-2.5 text-[12px] text-[#3A5613]">
            Une fois installée, ouvre TonPilote depuis <b>l’icône de ton écran d’accueil</b> et <b>ferme cet onglet du navigateur</b> — sinon tu continues dans le navigateur.
          </div>

          <button onClick={dismiss} className="mt-4 w-full text-center text-[13px] font-medium text-gray-400 hover:text-gray-600">Plus tard</button>
        </div>
      </div>
    </div>
  )
}

function Step({ n, icon, children }: { n: number; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-[#FBF8F6] px-3.5 py-2.5">
      <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-[#E0674C] text-white text-sm font-bold">{n}</span>
      <span className="flex items-center gap-2 text-[13.5px] text-marine"><span className="text-[#E0674C]">{icon}</span> <span>{children}</span></span>
    </div>
  )
}
