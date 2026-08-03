'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Zap, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

// Règles d'automatisation. Désormais persistées côté serveur (table automation_settings)
// et RÉELLEMENT respectées par les crons (ex : la relance de devis).
const RULES = [
  { id: 'form_prospect', label: 'Formulaire site → prospect', desc: 'Une demande via votre site crée un prospect.' },
  { id: 'devis_chantier', label: 'Devis accepté → client + chantier', desc: 'À l\'acceptation, le prospect devient client et un chantier à planifier est proposé.' },
  { id: 'chantier_facture', label: 'Chantier terminé → facture', desc: 'Un chantier terminé propose de préparer la facture.' },
  { id: 'ticket_depense', label: 'Ticket scanné → dépense à valider', desc: 'Chaque ticket scanné crée une dépense à vérifier.' },
  { id: 'paiement_facture', label: 'Paiement détecté → facture payée', desc: 'Un virement reçu propose de marquer la facture payée.' },
  { id: 'pointage_heure', label: 'Salarié pointe → heure enregistrée', desc: 'Le pointage alimente les heures du chantier.' },
  { id: 'devis_relance', label: 'Devis sans réponse → relance automatique', desc: 'Un devis resté sans réponse est relancé par email, aux délais que vous choisissez.' },
] as const

const DEFAULT_DELAYS = [7, 14]

export default function AutomationRules() {
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [disabled, setDisabled] = useState<string[]>([])
  const [delays, setDelays] = useState<number[]>(DEFAULT_DELAYS)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setReady(true); return }
      setUserId(user.id)
      const { data } = await supabase
        .from('automation_settings')
        .select('disabled_rules, relance_delays')
        .eq('user_id', user.id)
        .maybeSingle()
      if (data) {
        setDisabled(Array.isArray(data.disabled_rules) ? data.disabled_rules : [])
        setDelays(Array.isArray(data.relance_delays) && data.relance_delays.length ? data.relance_delays : DEFAULT_DELAYS)
      } else {
        // Migration douce depuis l'ancien localStorage cosmétique, une seule fois.
        let legacy: string[] = []
        try {
          const raw = JSON.parse(localStorage.getItem('batipilot_automations_off') || '{}') as Record<string, boolean>
          legacy = Object.keys(raw).filter(k => raw[k])
        } catch { /* ignore */ }
        setDisabled(legacy)
        await supabase.from('automation_settings').upsert({
          user_id: user.id, disabled_rules: legacy, relance_delays: DEFAULT_DELAYS,
        })
      }
      setReady(true)
    })
  }, [])

  const persist = useCallback(async (nextDisabled: string[], nextDelays: number[]) => {
    if (!userId) return
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('automation_settings').upsert({
      user_id: userId,
      disabled_rules: nextDisabled,
      relance_delays: nextDelays,
      updated_at: new Date().toISOString(),
    })
    setSaving(false)
    if (error) toast.error('Enregistrement impossible — réessayez')
  }, [userId])

  const enabled = (id: string) => !disabled.includes(id)

  function toggle(id: string) {
    const next = disabled.includes(id) ? disabled.filter(x => x !== id) : [...disabled, id]
    setDisabled(next)
    persist(next, delays)
  }

  function setDelay(index: number, value: string) {
    const n = Math.max(1, Math.min(120, parseInt(value) || 1))
    setDelays(prev => {
      const next = [...prev]
      next[index] = n
      return next
    })
  }

  function commitDelays() {
    // Garde 2 paliers croissants cohérents.
    const d1 = delays[0] || DEFAULT_DELAYS[0]
    const d2 = Math.max((delays[1] || DEFAULT_DELAYS[1]), d1 + 1)
    const next = [d1, d2]
    setDelays(next)
    persist(disabled, next)
  }

  return (
    <div>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-1.5">
        <Zap className="w-3.5 h-3.5" /> Automatisations actives
        {saving && <Loader2 className="w-3 h-3 animate-spin text-gray-400" />}
      </h2>
      <Card className="border border-gray-200/80 bg-white">
        <CardContent className="p-2 sm:p-3 divide-y divide-gray-50">
          {RULES.map(r => {
            const on = enabled(r.id)
            return (
              <div key={r.id} className="py-2.5 px-1">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-marine">{r.label}</div>
                    <div className="text-xs text-gray-500">{r.desc}</div>
                  </div>
                  <button
                    type="button" role="switch" aria-checked={on} onClick={() => toggle(r.id)}
                    disabled={!ready}
                    className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 disabled:opacity-50 ${on ? 'bg-primary' : 'bg-gray-200'}`}
                    title={on ? 'Activée' : 'Désactivée'}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : ''}`} />
                  </button>
                </div>
                {/* Config des délais de relance, visible quand la règle est active. */}
                {r.id === 'devis_relance' && on && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
                    <span>Relancer après</span>
                    <input
                      type="number" min={1} max={120} value={delays[0] ?? DEFAULT_DELAYS[0]}
                      onChange={e => setDelay(0, e.target.value)} onBlur={commitDelays}
                      className="w-14 border border-gray-200 rounded-md px-2 py-1 text-center"
                    />
                    <span>jours, puis</span>
                    <input
                      type="number" min={1} max={120} value={delays[1] ?? DEFAULT_DELAYS[1]}
                      onChange={e => setDelay(1, e.target.value)} onBlur={commitDelays}
                      className="w-14 border border-gray-200 rounded-md px-2 py-1 text-center"
                    />
                    <span>jours. Au-delà, on n’insiste plus.</span>
                  </div>
                )}
              </div>
            )
          })}
        </CardContent>
      </Card>
      <p className="text-[11px] text-gray-400 mt-2">Ces réglages sont enregistrés sur votre compte et appliqués automatiquement. Aucune action irréversible n&apos;est envoyée sans votre validation.</p>
    </div>
  )
}
