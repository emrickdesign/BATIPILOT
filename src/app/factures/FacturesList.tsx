'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Search, HardHat, Send, AlertTriangle, Clock, CheckCircle2 } from 'lucide-react'

export type FactureRow = {
  id: string; number: string; clientName: string; chantier: string | null
  dateFmt: string; dueFmt: string | null; amountFmt: string; resteFmt: string
  statusLabel: string; statusColor: string; overdue: boolean
  aPreparer: boolean; enRetard: boolean; ouverte: boolean; payee: boolean
}

const PAGE = 12

export default function FacturesList({ rows }: { rows: FactureRow[] }) {
  const [q, setQ] = useState('')
  const [limit, setLimit] = useState(PAGE)

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return rows
    return rows.filter(r => r.clientName.toLowerCase().includes(s) || r.number.toLowerCase().includes(s))
  }, [rows, q])
  const shown = filtered.slice(0, limit)

  const buckets = useMemo(() => ({
    aPreparer: rows.filter(r => r.aPreparer),
    enRetard: rows.filter(r => r.enRetard),
    ouverte: rows.filter(r => r.ouverte),
    payee: rows.filter(r => r.payee),
  }), [rows])
  const prioritaires = [...buckets.enRetard, ...buckets.ouverte].slice(0, 6)

  return (
    <div className="grid lg:grid-cols-[minmax(0,580px)_1fr] gap-5 items-start">
      <div className="space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input value={q} onChange={e => { setQ(e.target.value); setLimit(PAGE) }}
            placeholder="Rechercher un client, un numéro…" className="pl-9 h-10" />
        </div>

        {filtered.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">Aucune facture ne correspond à « {q} ».</p>
        ) : (
          <>
            <div className="space-y-2.5">
              {shown.map(r => (
                <Link key={r.id} href={`/factures/${r.id}`} className="block">
                  <div className="card-interactive border border-gray-200/80 rounded-xl bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs text-gray-400">{r.number}</span>
                          <Badge className={`${r.statusColor} border-0 text-xs`}>{r.statusLabel}</Badge>
                        </div>
                        <p className="font-semibold text-gray-900 mt-1 truncate">{r.clientName}</p>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400 flex-wrap">
                          <span>{r.dateFmt}</span>
                          {r.dueFmt && <span className={r.overdue ? 'text-[#C0392B] font-medium' : ''}>Échéance {r.dueFmt}</span>}
                          {r.chantier && <span className="flex items-center gap-1"><HardHat className="w-3 h-3" />{r.chantier}</span>}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-bold text-gray-900 tabular-nums">{r.amountFmt}</p>
                        <p className="text-xs text-gray-400">{r.resteFmt}</p>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
            {filtered.length > limit && (
              <button onClick={() => setLimit(l => l + PAGE)}
                className="w-full py-2.5 rounded-xl border border-dashed border-gray-300 text-sm font-medium text-gray-500 hover:border-primary hover:text-primary transition-colors">
                Afficher plus ({filtered.length - limit} restante{filtered.length - limit > 1 ? 's' : ''})
              </button>
            )}
          </>
        )}
      </div>

      <aside className="hidden lg:block lg:sticky lg:top-4 space-y-3 w-full max-w-[340px]">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="font-semibold text-marine mb-3 text-sm">À traiter</h3>
          <div className="grid grid-cols-2 gap-2">
            <Bucket icon={<Send className="w-3.5 h-3.5" />} label="À préparer" n={buckets.aPreparer.length} tone="coral" />
            <Bucket icon={<AlertTriangle className="w-3.5 h-3.5" />} label="En retard" n={buckets.enRetard.length} tone="red" />
            <Bucket icon={<Clock className="w-3.5 h-3.5" />} label="En attente" n={buckets.ouverte.length} tone="amber" />
            <Bucket icon={<CheckCircle2 className="w-3.5 h-3.5" />} label="Payées" n={buckets.payee.length} tone="green" />
          </div>
        </div>

        {prioritaires.length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h3 className="font-semibold text-marine mb-2 text-sm">À encaisser en priorité</h3>
            <div className="space-y-1.5">
              {prioritaires.map(r => (
                <Link key={r.id} href={`/factures/${r.id}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50 -mx-2">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${r.enRetard ? 'bg-rose-500' : 'bg-amber-400'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800 truncate">{r.clientName}</p>
                    <p className="text-[11px] text-gray-400 truncate">{r.enRetard ? 'En retard' : 'En attente de paiement'}</p>
                  </div>
                  <span className="text-xs font-semibold text-gray-600 tabular-nums flex-shrink-0">{r.amountFmt}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  )
}

const TONES: Record<string, string> = {
  coral: 'linear-gradient(140deg,#D65A34,#B23F22)',
  amber: 'linear-gradient(140deg,#C9820F,#9A5E07)',
  red: 'linear-gradient(140deg,#CA4133,#A02A1F)',
  green: 'linear-gradient(140deg,#4E9331,#356420)',
}
function Bucket({ icon, label, n, tone }: { icon: React.ReactNode; label: string; n: number; tone: string }) {
  return (
    <div className="rounded-lg p-2.5 text-white" style={{ background: TONES[tone] }}>
      <div className="flex items-center gap-1.5 text-white/85 text-[11px]">{icon}{label}</div>
      <div className="text-xl font-bold tabular-nums mt-0.5">{n}</div>
    </div>
  )
}
