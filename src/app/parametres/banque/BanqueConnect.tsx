'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Loader2, RefreshCw, Link2 } from 'lucide-react'

export default function BanqueConnect({ connected }: { connected: boolean }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [notConfigured, setNotConfigured] = useState(false)

  async function connect() {
    setLoading(true)
    const res = await fetch('/api/bank/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    if (res.status === 503) { setNotConfigured(true); setLoading(false); return }
    if (!res.ok) { toast.error('Erreur de connexion'); setLoading(false); return }
    const { link } = await res.json()
    window.location.href = link // tunnel Bridge : choix de la banque + auth
  }

  async function sync() {
    setSyncing(true)
    const res = await fetch('/api/bank/sync', { method: 'POST' })
    setSyncing(false)
    if (res.status === 503) { setNotConfigured(true); return }
    if (!res.ok) { toast.error('Erreur de synchronisation'); return }
    const j = await res.json()
    toast.success(`${j.imported || 0} virement(s) importé(s), ${j.matched || 0} rapproché(s) auto`)
    router.refresh()
  }

  if (notConfigured) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Connexion bancaire pas encore activée. L&apos;administrateur doit renseigner les clés Bridge
        (<code className="text-xs">BRIDGE_CLIENT_ID</code> / <code className="text-xs">BRIDGE_CLIENT_SECRET</code>) dans les variables d&apos;environnement.
      </div>
    )
  }

  return (
    <div className="flex flex-wrap gap-2">
      {connected && (
        <Button onClick={sync} disabled={syncing} className="gap-2">
          {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {syncing ? 'Synchronisation…' : 'Actualiser les virements'}
        </Button>
      )}
      <Button variant={connected ? 'outline' : 'default'} onClick={connect} disabled={loading} className="gap-2">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
        {connected ? 'Reconnecter la banque' : 'Connecter ma banque'}
      </Button>
    </div>
  )
}
