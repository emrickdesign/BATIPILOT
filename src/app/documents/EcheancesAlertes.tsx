import { AlertTriangle, CalendarClock } from 'lucide-react'

export type Echeance = { label: string; sub: string; date: string; kind: 'document' | 'salarié' | 'sous-traitant' }

/** Centre d'alertes : documents, assurances et habilitations qui expirent (≤ 60 j) ou sont expirés. */
export default function EcheancesAlertes({ echeances }: { echeances: Echeance[] }) {
  if (!echeances.length) return null
  const today = new Date().toISOString().split('T')[0]
  const expired = echeances.filter(e => e.date < today)
  const soon = echeances.filter(e => e.date >= today)

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 mb-5">
      <div className="flex items-center gap-2 mb-3">
        <CalendarClock className="w-4 h-4 text-amber-600" />
        <h2 className="font-semibold text-amber-800">Échéances à surveiller</h2>
        <span className="text-xs text-amber-600">{expired.length > 0 && `${expired.length} expiré${expired.length > 1 ? 's' : ''} · `}{soon.length} à venir</span>
      </div>
      <div className="grid sm:grid-cols-2 gap-2">
        {[...expired, ...soon].slice(0, 12).map((e, i) => {
          const isExpired = e.date < today
          return (
            <div key={i} className={`flex items-center gap-2 rounded-lg border px-3 py-2 bg-white ${isExpired ? 'border-rose-200' : 'border-amber-200'}`}>
              <AlertTriangle className={`w-4 h-4 flex-shrink-0 ${isExpired ? 'text-rose-500' : 'text-amber-500'}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-800 truncate">{e.label}</p>
                <p className="text-[11px] text-gray-400 truncate">{e.sub}</p>
              </div>
              <span className={`text-[11px] font-semibold whitespace-nowrap ${isExpired ? 'text-rose-600' : 'text-amber-600'}`}>
                {isExpired ? 'expiré le ' : ''}{new Date(e.date).toLocaleDateString('fr-FR')}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
