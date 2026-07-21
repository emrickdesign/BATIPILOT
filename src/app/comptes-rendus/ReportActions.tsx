'use client'

import { Button } from '@/components/ui/button'
import { FileText, Mail } from 'lucide-react'
import { buildClientEmail } from '@/lib/comptes-rendus'
import { toast } from 'sonner'

export default function ReportActions({
  projectId, from, to, clientEmail, clientName, companyName, projectTitle, rangeLabel, progress, highlights, hasPhotos,
}: {
  projectId: string; from: string; to: string
  clientEmail: string | null; clientName: string | null; companyName: string | null
  projectTitle: string; rangeLabel: string; progress: number | null; highlights: string[]; hasPhotos: boolean
}) {
  const reportUrl = `/rapport/${projectId}?from=${from}&to=${to}`

  function prepareEmail() {
    const body = buildClientEmail({ clientName, companyName, projectTitle, rangeLabel, progress, highlights })
    const subject = `Point d'avancement — ${projectTitle} (semaine ${rangeLabel})`
    const to = clientEmail || ''
    const href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    // On ouvre aussi l'aperçu imprimable pour joindre le PDF/les photos.
    if (hasPhotos) window.open(reportUrl, '_blank', 'noopener')
    window.location.href = href
    if (!clientEmail) toast.info('Aucun e-mail client enregistré — complétez le destinataire dans votre messagerie.')
  }

  return (
    <div className="flex items-center gap-2">
      <a href={reportUrl} target="_blank" rel="noopener noreferrer">
        <Button variant="outline" size="sm"><FileText className="w-4 h-4 mr-1.5" /> Aperçu / imprimer</Button>
      </a>
      <Button size="sm" onClick={prepareEmail}><Mail className="w-4 h-4 mr-1.5" /> Préparer l&apos;email</Button>
    </div>
  )
}
