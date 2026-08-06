'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Archive, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

/** Archive une visite directement depuis sa carte (garde photos+note dans le chantier). */
export default function ArchiveVisitButton({ visitId }: { visitId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function archive(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation()
    setBusy(true)
    const { error } = await createClient().from('site_visits').update({ status: 'archive' }).eq('id', visitId)
    setBusy(false)
    if (error) { toast.error('Erreur'); return }
    toast.success('Visite archivée')
    router.refresh()
  }

  return (
    <button onClick={archive} disabled={busy} title="Archiver la visite"
      className="absolute top-2 right-2 z-10 inline-flex items-center gap-1 h-7 pl-2 pr-2.5 rounded-lg bg-white/90 border border-gray-200 text-[11px] font-medium text-gray-500 hover:text-[#C0392B] hover:border-[#C0392B]/40 backdrop-blur-sm transition-colors">
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Archive className="w-3.5 h-3.5" />}
      Archiver
    </button>
  )
}
