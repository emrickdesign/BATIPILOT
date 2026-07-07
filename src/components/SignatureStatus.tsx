import { formatDate } from '@/lib/utils'
import { CheckCircle, Clock, XCircle } from 'lucide-react'
import type { DocumentSignature } from '@/types'

export default function SignatureStatus({ signature }: { signature: DocumentSignature | null | undefined }) {
  if (!signature) return null

  if (signature.status === 'signee') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
        <CheckCircle className="w-4 h-4 shrink-0" />
        <span>Signé électroniquement par <strong>{signature.signer_name}</strong> le {formatDate(signature.signed_at!)}</span>
      </div>
    )
  }

  if (signature.status === 'en_attente') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
        <Clock className="w-4 h-4 shrink-0" />
        <span>En attente de signature — envoyé le {formatDate(signature.sent_at)}, valable jusqu&apos;au {formatDate(signature.expires_at)}</span>
      </div>
    )
  }

  if (signature.status === 'expiree') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-800">
        <XCircle className="w-4 h-4 shrink-0" />
        <span>Lien de signature expiré — renvoyez le document pour un nouveau lien</span>
      </div>
    )
  }

  return null
}
