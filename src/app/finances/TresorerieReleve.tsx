'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowDownLeft, ArrowUpRight, HelpCircle, Link2 } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Mouvement } from '@/lib/finances-data'

// Libellé lisible de la méthode de rapprochement (audit).
const METHOD_LABEL: Record<string, string> = {
  reference: 'référence',
  'nom+montant': 'nom + montant',
  nom: 'nom',
  'iban+montant': 'IBAN + montant',
  iban: 'IBAN',
  montant: 'montant',
  'fournisseur+montant': 'fournisseur + montant',
  'montant+date': 'montant + date',
  manuel: 'manuel',
}

type Filtre = 'toutes' | 'in' | 'out'

export default function TresorerieReleve({ mouvements, nbARapprocher }: { mouvements: Mouvement[]; nbARapprocher: number }) {
  const [filtre, setFiltre] = useState<Filtre>('toutes')

  const rows = useMemo(
    () => mouvements.filter(m => filtre === 'toutes' || m.kind === filtre),
    [mouvements, filtre],
  )

  const tabs: { id: Filtre; label: string }[] = [
    { id: 'toutes', label: 'Toutes' },
    { id: 'in', label: 'Entrées' },
    { id: 'out', label: 'Sorties' },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Relevé</h3>
        <div className="flex items-center gap-2">
          {nbARapprocher > 0 && (
            <Link href="/banque" className="text-xs font-medium text-[#1F5FAE] hover:underline flex items-center gap-1">
              <Link2 className="w-3.5 h-3.5" /> {nbARapprocher} à rapprocher
            </Link>
          )}
          <div className="flex rounded-lg bg-gray-100 p-0.5">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setFiltre(t.id)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${filtre === t.id ? 'bg-white text-marine shadow-sm' : 'text-gray-500 hover:text-marine'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Card className="border border-gray-200/80 bg-white">
        <CardContent className="p-2 sm:p-4">
          {rows.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">Aucun mouvement sur cette période.</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {rows.map(m => {
                const pending = m.status === 'a_rapprocher'
                const positive = m.amount >= 0
                return (
                  <div key={m.id} className="flex items-center gap-3 py-3 px-1">
                    <span className={`grid place-items-center w-9 h-9 rounded-lg flex-shrink-0 ${
                      pending ? 'bg-amber-100 text-amber-600' : positive ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'
                    }`}>
                      {pending ? <HelpCircle className="w-4 h-4" /> : positive ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-marine truncate">{m.label || 'Transaction'}</div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs">
                        <span className="text-gray-400">{m.date ? formatDate(m.date) : '—'}</span>
                        {pending ? (
                          <span className="text-amber-600 font-medium">à rapprocher</span>
                        ) : m.ref ? (
                          <span className="text-emerald-700 truncate">
                            {m.method ? `${METHOD_LABEL[m.method] || m.method} · ` : ''}{m.ref}
                          </span>
                        ) : (
                          <span className="text-gray-400">non rattaché</span>
                        )}
                      </div>
                    </div>
                    <span className={`text-sm font-semibold tabular-nums flex-shrink-0 ${positive ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {positive ? '+ ' : '− '}{formatCurrency(Math.abs(m.amount))}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
