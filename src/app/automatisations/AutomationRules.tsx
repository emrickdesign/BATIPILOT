'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Zap } from 'lucide-react'

// Règles d'automatisation (doc §24.1). Activables/désactivables (état local, pas de scénarios complexes).
const RULES = [
  { id: 'form_prospect', label: 'Formulaire site → prospect', desc: 'Une demande via votre site crée un prospect.' },
  { id: 'devis_chantier', label: 'Devis accepté → client + chantier', desc: 'À l\'acceptation, le prospect devient client et un chantier à planifier est proposé.' },
  { id: 'chantier_facture', label: 'Chantier terminé → facture', desc: 'Un chantier terminé propose de préparer la facture.' },
  { id: 'ticket_depense', label: 'Ticket scanné → dépense à valider', desc: 'Chaque ticket scanné crée une dépense à vérifier.' },
  { id: 'paiement_facture', label: 'Paiement détecté → facture payée', desc: 'Un virement reçu propose de marquer la facture payée.' },
  { id: 'pointage_heure', label: 'Salarié pointe → heure enregistrée', desc: 'Le pointage alimente les heures du chantier.' },
  { id: 'devis_relance', label: 'Devis sans réponse 7 j → relance', desc: 'Un devis sans réponse depuis 7 jours est proposé en relance.' },
]

export default function AutomationRules() {
  const [off, setOff] = useState<Record<string, boolean>>({})
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydratation depuis localStorage (indispo en SSR)
      setOff(JSON.parse(localStorage.getItem('batipilot_automations_off') || '{}'))
    } catch { /* ignore */ }
  }, [])
  const enabled = (id: string) => !off[id]
  function toggle(id: string) {
    setOff(prev => {
      const next = { ...prev, [id]: !prev[id] }
      try { localStorage.setItem('batipilot_automations_off', JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }

  return (
    <div>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" /> Automatisations actives</h2>
      <Card className="border border-gray-200/80 bg-white">
        <CardContent className="p-2 sm:p-3 divide-y divide-gray-50">
          {RULES.map(r => {
            const on = enabled(r.id)
            return (
              <div key={r.id} className="flex items-center gap-3 py-2.5 px-1">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-marine">{r.label}</div>
                  <div className="text-xs text-gray-500">{r.desc}</div>
                </div>
                <button
                  type="button" role="switch" aria-checked={on} onClick={() => toggle(r.id)}
                  className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${on ? 'bg-primary' : 'bg-gray-200'}`}
                  title={on ? 'Activée' : 'Désactivée'}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : ''}`} />
                </button>
              </div>
            )
          })}
        </CardContent>
      </Card>
      <p className="text-[11px] text-gray-400 mt-2">Vous activez ou désactivez les automatisations utiles. Aucune action n&apos;est envoyée sans votre validation.</p>
    </div>
  )
}
