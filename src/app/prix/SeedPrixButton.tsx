'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

export default function SeedPrixButton() {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSeed() {
    setLoading(true)
    const res = await fetch('/api/seed-prix', { method: 'POST' })
    const data = await res.json()
    if (data.success) {
      toast.success(`${data.count} prestations chargées avec succès !`)
      router.refresh()
    } else {
      toast.error('Erreur lors du chargement des prix')
    }
    setLoading(false)
  }

  return (
    <Button onClick={handleSeed} disabled={loading} size="lg">
      {loading ? 'Chargement...' : 'Charger une base de prix type'}
    </Button>
  )
}
