'use client'

import { Printer } from 'lucide-react'

export default function PrintButton() {
  return (
    <button onClick={() => window.print()}
      className="print:hidden inline-flex items-center gap-2 rounded-lg bg-marine text-white px-4 py-2 text-sm font-medium hover:bg-marine/90">
      <Printer className="w-4 h-4" /> Imprimer / enregistrer en PDF
    </button>
  )
}
