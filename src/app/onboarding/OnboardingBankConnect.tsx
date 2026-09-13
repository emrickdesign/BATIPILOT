'use client'

import { useState } from 'react'
import { Landmark, Loader2, ShieldCheck, CheckCircle2, ExternalLink } from 'lucide-react'

type State = 'idle' | 'loading' | 'opened' | 'notConfigured' | 'error'

/**
 * Connexion bancaire (Bridge) intégrée à l'onboarding.
 * Le tunnel Bridge s'ouvre dans un NOUVEL onglet pour ne pas perdre la saisie
 * de l'onboarding en cours. La connexion est enregistrée côté serveur, donc
 * indépendante du formulaire : l'utilisateur revient ensuite ici et continue.
 */
export default function OnboardingBankConnect() {
  const [state, setState] = useState<State>('idle')

  async function connect() {
    // Ouvre l'onglet AVANT le fetch (geste utilisateur) pour éviter le blocage popup.
    const win = window.open('', '_blank')
    setState('loading')
    try {
      const res = await fetch('/api/bank/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      if (res.status === 503) { win?.close(); setState('notConfigured'); return }
      if (!res.ok) { win?.close(); setState('error'); return }
      const { link } = await res.json()
      if (win) { win.location.href = link } else { window.location.href = link }
      setState('opened')
    } catch {
      win?.close()
      setState('error')
    }
  }

  if (state === 'notConfigured') {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-800 flex items-start gap-2.5">
        <Landmark className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <span>La connexion bancaire sera disponible très bientôt. Tu pourras la brancher en un clic depuis <span className="font-semibold">Paramètres → Connexion bancaire</span>.</span>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/[0.04] p-4">
      <div className="flex items-start gap-3">
        <span className="grid place-items-center w-10 h-10 rounded-xl bg-primary/10 text-primary flex-shrink-0">
          <Landmark className="w-5 h-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-marine">Connecte ta banque <span className="text-xs font-medium text-primary bg-primary/10 rounded-full px-2 py-0.5 align-middle">Recommandé</span></p>
          <p className="text-sm text-gray-500 mt-1">
            Sois opérationnel dès l&apos;arrivée : les virements reçus se rapprochent
            automatiquement de tes factures. Lecture seule, via un agrégateur agréé DSP2.
          </p>

          {state === 'opened' ? (
            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              Termine la connexion dans l&apos;autre onglet, puis reviens ici et continue.
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={connect}
                disabled={state === 'loading'}
                className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors"
              >
                {state === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                {state === 'loading' ? 'Ouverture…' : 'Connecter ma banque'}
              </button>
              <span className="inline-flex items-center gap-1.5 text-xs text-gray-400">
                <ShieldCheck className="w-3.5 h-3.5" /> Sécurisé · aucune donnée bancaire stockée chez nous
              </span>
            </div>
          )}
          {state === 'error' && (
            <p className="mt-2 text-xs text-[#C0392B]">La connexion n&apos;a pas pu démarrer. Tu pourras réessayer depuis les Paramètres.</p>
          )}
          <p className="mt-2 text-xs text-gray-400">Facultatif — tu peux le faire plus tard depuis Paramètres.</p>
        </div>
      </div>
    </div>
  )
}
