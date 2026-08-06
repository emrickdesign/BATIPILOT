'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Loader2, Building2, RefreshCw, Link2 } from 'lucide-react'

type Institution = { id: string; name: string; logo?: string }

export default function BanqueConnect({ connected }: { connected: boolean }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [institutions, setInstitutions] = useState<Institution[] | null>(null)
  const [notConfigured, setNotConfigured] = useState(false)

  async function loadBanks() {
    setLoading(true)
    try {
      const res = await fetch('/api/bank/institutions')
      if (res.status === 503) { setNotConfigured(true); return }
      if (!res.ok) { toast.error('Impossible de charger les banques'); return }
      const json = await res.json()
      setInstitutions(json.institutions || [])
    } finally { setLoading(false) }
  }

  async function connect(institutionId: string) {
    setLoading(true)
    const res = await fetch('/api/bank/connect', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ institutionId }),
    })
    if (!res.ok) { toast.error('Erreur de connexion'); setLoading(false); return }
    const { link } = await res.json()
    window.location.href = link // redirection vers la banque (consentement)
  }

  async function sync() {
    setSyncing(true)
    const res = await fetch('/api/bank/sync', { method: 'POST' })
    setSyncing(false)
    if (!res.ok) { toast.error('Erreur de synchronisation'); return }
    const j = await res.json()
    toast.success(`${j.imported || 0} virement(s) importé(s), ${j.matched || 0} rapproché(s) auto`)
    router.refresh()
  }

  if (notConfigured) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Connexion bancaire pas encore activée. L&apos;administrateur doit renseigner les clés GoCardless
        (<code className="text-xs">GOCARDLESS_SECRET_ID</code> / <code className="text-xs">GOCARDLESS_SECRET_KEY</code>) dans les variables d&apos;environnement.
      </div>
    )
  }

  if (connected && !institutions) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button onClick={sync} disabled={syncing} className="gap-2">
          {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {syncing ? 'Synchronisation…' : 'Actualiser les virements'}
        </Button>
        <Button variant="outline" onClick={loadBanks} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
          Reconnecter la banque
        </Button>
      </div>
    )
  }

  if (!institutions) {
    return (
      <Button onClick={loadBanks} disabled={loading} className="gap-2">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
        Connecter ma banque
      </Button>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-500">Choisis ta banque :</p>
      <div className="grid sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto">
        {institutions.map(b => (
          <button key={b.id} onClick={() => connect(b.id)} disabled={loading}
            className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-left hover:border-primary/40 transition-colors disabled:opacity-50">
            {b.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={b.logo} alt="" className="w-7 h-7 rounded object-contain flex-shrink-0" />
            ) : (
              <span className="grid place-items-center w-7 h-7 rounded bg-gray-100 text-gray-500 flex-shrink-0"><Building2 className="w-4 h-4" /></span>
            )}
            <span className="text-sm font-medium text-gray-800 truncate">{b.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
