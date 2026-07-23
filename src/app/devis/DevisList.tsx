'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Search, HardHat, ArrowRight, Send, BellRing, AlertTriangle, Receipt } from 'lucide-react'

export type DevisRow = {
  id: string; number: string; clientName: string; title: string | null; chantier: string | null
  dateFmt: string; amountFmt: string; statusLabel: string; statusColor: string; action: string
  aRelancer: boolean; expire: boolean; aEnvoyer: boolean; aFacturer: boolean
}

const PAGE = 12

export default function DevisList({ rows }: { rows: DevisRow[] }) {
  const [q, setQ] = useState('')
  const [limit, setLimit] = useState(PAGE)

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return rows
    return rows.filter(r =>
      r.clientName.toLowerCase().includes(s) ||
      r.number.toLowerCase().includes(s) ||
      (r.title || '').toLowerCase().includes(s))
  }, [rows, q])

  const shown = filtered.slice(0, limit)

  const buckets = useMemo(() => ({
    aEnvoyer: rows.filter(r => r.aEnvoyer),
    aRelancer: rows.filter(r => r.aRelancer),
    expire: rows.filter(r => r.expire),
    aFacturer: rows.filter(r => r.aFacturer),
  }), [rows])
  const prioritaires = [...buckets.expire, ...buckets.aRelancer].slice(0, 6)

  return (
    <div className="grid lg:grid-cols-[minmax(0,580px)_1fr] gap-5 items-start">
      {/* Colonne gauche : recherche + liste */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input value={q} onChange={e => { setQ(e.target.value); setLimit(PAGE) }}
            placeholder="Rechercher un client, un numéro…" className="pl-9 h-10" />
        </div>

        {filtered.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">Aucun devis ne correspond à « {q} ».</p>
        ) : (
          <>
            <div className="space-y-2.5">
              {shown.map(r => (
                <Link key={r.id} href={`/devis/${r.id}`} className="block">
                  <div className="card-interactive border border-gray-200/80 rounded-xl bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs text-gray-400">{r.number}</span>
                          <Badge className={`${r.statusColor} border-0 text-xs`}>{r.statusLabel}</Badge>
                        </div>
                        <p className="font-semibold text-gray-900 mt-1 truncate">
                          {r.clientName}
                          {r.title && <span className="font-normal text-gray-500"> — {r.title}</span>}
                        </p>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400 flex-wrap">
                          <span>{r.dateFmt}</span>
                          {r.chantier && <span className="flex items-center gap-1"><HardHat className="w-3 h-3" />{r.chantier}</span>}
                        </div>
                        <div className="flex items-center gap-1 mt-1.5 text-xs text-primary font-medium">
                          <ArrowRight className="w-3 h-3" />{r.action}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-bold text-gray-900 tabular-nums">{r.amountFmt}</p>
                        <p className="text-xs text-gray-400">TTC</p>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
            {filtered.length > limit && (
              <button onClick={() => setLimit(l => l + PAGE)}
                className="w-full py-2.5 rounded-xl border border-dashed border-gray-300 text-sm font-medium text-gray-500 hover:border-primary hover:text-primary transition-colors">
                Afficher plus ({filtered.length - limit} restant{filtered.length - limit > 1 ? 's' : ''})
              </button>
            )}
          </>
        )}
      </div>

      {/* Colonne droite : analyse, fixe au scroll */}
      <aside className="hidden lg:block lg:sticky lg:top-4 space-y-3 w-full max-w-[340px]">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="font-semibold text-marine mb-3 text-sm">À traiter</h3>
          <div className="grid grid-cols-2 gap-2">
            <Bucket icon={<Send className="w-3.5 h-3.5" />} label="À envoyer" n={buckets.aEnvoyer.length} tone="coral" />
            <Bucket icon={<BellRing className="w-3.5 h-3.5" />} label="À relancer" n={buckets.aRelancer.length} tone="amber" />
            <Bucket icon={<AlertTriangle className="w-3.5 h-3.5" />} label="Expirés" n={buckets.expire.length} tone="red" />
            <Bucket icon={<Receipt className="w-3.5 h-3.5" />} label="À facturer" n={buckets.aFacturer.length} tone="blue" />
          </div>
        </div>

        {prioritaires.length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h3 className="font-semibold text-marine mb-2 text-sm">En priorité</h3>
            <div className="space-y-1.5">
              {prioritaires.map(r => (
                <Link key={r.id} href={`/devis/${r.id}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50 -mx-2">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${r.expire ? 'bg-rose-500' : 'bg-amber-400'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800 truncate">{r.clientName}</p>
                    <p className="text-[11px] text-gray-400 truncate">{r.expire ? 'Expiré' : 'Sans réponse — à relancer'}</p>
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
  blue: 'linear-gradient(140deg,#2F6BE8,#1E56A0)',
}
function Bucket({ icon, label, n, tone }: { icon: React.ReactNode; label: string; n: number; tone: string }) {
  return (
    <div className="rounded-lg p-2.5 text-white" style={{ background: TONES[tone] }}>
      <div className="flex items-center gap-1.5 text-white/85 text-[11px]">{icon}{label}</div>
      <div className="text-xl font-bold tabular-nums mt-0.5">{n}</div>
    </div>
  )
}
