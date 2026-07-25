import { HardHat, Loader2 } from 'lucide-react'

// Écran de chargement de marque, affiché pendant les temps d'attente
// (navigation entre pages, chargement des données serveur).
export default function LoadingScreen() {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#FAFAF8]">
      <div className="flex flex-col items-center gap-4 animate-fade-up">
        <span className="grid place-items-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#FF8A2B] to-[#FF6A00] shadow-[var(--shadow-brand)] animate-pulse">
          <HardHat className="w-8 h-8 text-white" strokeWidth={2.2} />
        </span>
        <p className="text-xl font-bold font-heading text-marine">Ton<span className="text-primary">Pilote</span></p>
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" /> Chargement…
        </div>
      </div>
    </div>
  )
}
