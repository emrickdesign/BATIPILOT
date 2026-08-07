import { Loader2 } from 'lucide-react'

// Écran de chargement de marque, affiché pendant les temps d'attente
// (navigation entre pages, chargement des données serveur).
export default function LoadingScreen() {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#FAFAF8]">
      <div className="flex flex-col items-center gap-5 animate-fade-in">
        <div className="relative grid place-items-center">
          {/* Ondes concentriques */}
          <span className="absolute w-20 h-20 rounded-[22px] bg-primary/30 animate-logo-ring" />
          <span className="absolute w-20 h-20 rounded-[22px] bg-primary/25 animate-logo-ring [animation-delay:1s]" />
          {/* Logo animé (respire) */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="TonPilote" className="relative w-20 h-20 rounded-[22px] shadow-[var(--shadow-brand)] animate-logo-breathe" />
        </div>
        <p className="text-xl font-bold font-heading text-marine">Ton<span className="text-primary">Pilote</span></p>
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" /> Chargement…
        </div>
      </div>
    </div>
  )
}
