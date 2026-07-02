'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Archive } from 'lucide-react'

export default function ArchiveClientButton({ clientId, archived }: { clientId: string; archived: boolean }) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)

  async function archive() {
    if (!confirm(archived ? 'Réactiver ce client ?' : 'Archiver ce client ? Il n\'apparaîtra plus dans la liste active.')) return
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('clients').update({ status: archived ? 'termine' : 'archive' }).eq('id', clientId)
    setSaving(false)
    if (error) { toast.error('Erreur'); return }
    toast.success(archived ? 'Client réactivé' : 'Client archivé')
    if (archived) router.refresh()
    else router.push('/clients')
  }

  return (
    <Button variant={archived ? 'success' : 'destructive'} size="sm" className="gap-1" onClick={archive} disabled={saving}>
      <Archive className="w-4 h-4" /> {archived ? 'Réactiver' : 'Archiver'}
    </Button>
  )
}
