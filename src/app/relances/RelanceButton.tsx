'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Check, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

// Marque un devis comme relancé (reminded_at = maintenant) → il sort de la liste « à relancer » pour 7 jours.
export default function RelanceButton({ quoteId }: { quoteId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function markReminded() {
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('quotes')
      .update({ reminded_at: new Date().toISOString() })
      .eq('id', quoteId)
    if (error) {
      toast.error('Impossible d’enregistrer la relance')
    } else {
      toast.success('Relance enregistrée')
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <Button size="sm" variant="outline" className="gap-1 flex-shrink-0" onClick={markReminded} disabled={loading}>
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
      Relancé
    </Button>
  )
}
