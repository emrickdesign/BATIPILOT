'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { HardHat, MapPin, User, Users2, Calendar, AlertTriangle } from 'lucide-react'
import type { Project, ProjectStatus } from '@/types'
import { projectStatusLabels, projectStatusColors, projectStatusOrder, clientDisplayName } from '@/lib/chantiers'
import { formatCurrency, formatDate } from '@/lib/utils'

export type ChantierCard = Project & {
  clients?: { type: string; first_name: string | null; last_name: string | null; company_name: string | null } | null
  montantDevis: number
  depenses: number
  marge: number | null
  equipeCount: number
  enRetard: boolean
}

export default function ChantiersList({ projects }: { projects: ChantierCard[] }) {
  const [filter, setFilter] = useState<ProjectStatus | 'tous'>('tous')

  // Statuts présents (ordre logique). "Tous" masque les archivés.
  const presentStatuses = useMemo(() => {
    const set = new Set(projects.map(p => p.status))
    return projectStatusOrder.filter(s => set.has(s))
  }, [projects])

  const nonArchived = useMemo(() => projects.filter(p => p.status !== 'archive'), [projects])
  const filtered = useMemo(
    () => (filter === 'tous' ? nonArchived : projects.filter(p => p.status === filter)),
    [projects, nonArchived, filter],
  )

  if (!projects.length) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-gray-500">
          <HardHat className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="font-medium">Aucun chantier pour l&apos;instant</p>
          <p className="text-sm mt-1">Créez votre premier chantier pour commencer à piloter.</p>
          <Link href="/chantiers/nouveau" className="mt-4 inline-block"><Button>Nouveau chantier</Button></Link>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filtres par statut (§10.1) */}
      <div className="flex flex-wrap gap-2">
        <FilterChip active={filter === 'tous'} onClick={() => setFilter('tous')}>Tous ({nonArchived.length})</FilterChip>
        {presentStatuses.map(s => (
          <FilterChip key={s} active={filter === s} onClick={() => setFilter(s)}>
            {projectStatusLabels[s]} ({projects.filter(p => p.status === s).length})
          </FilterChip>
        ))}
      </div>

      {/* Cartes (§10.2) */}
      <div className="grid gap-3">
        {filtered.map(project => (
          <Link key={project.id} href={`/chantiers/${project.id}`}>
            <Card className="card-interactive border border-gray-200/80 cursor-pointer">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                      <HardHat className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-900 truncate">{project.title || 'Chantier sans titre'}</div>
                      <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 mt-1 text-sm text-gray-500">
                        <span className="flex items-center gap-1 truncate"><User className="w-3 h-3" />{clientDisplayName(project.clients)}</span>
                        {project.address && <span className="flex items-center gap-1 truncate"><MapPin className="w-3 h-3" />{project.address}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <Badge className={`${projectStatusColors[project.status] || 'bg-gray-100 text-gray-700'} border-0 text-xs`}>
                      {projectStatusLabels[project.status] || project.status}
                    </Badge>
                    {project.enRetard && (
                      <Badge className="bg-rose-100 text-rose-700 border-0 text-[10px] gap-1"><AlertTriangle className="w-3 h-3" /> En retard</Badge>
                    )}
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div>
                    <div className="text-[11px] text-gray-400 flex items-center gap-1"><Calendar className="w-3 h-3" />Dates</div>
                    <div className="font-medium text-gray-700 text-xs mt-0.5">
                      {project.start_date || project.end_date
                        ? `${project.start_date ? formatDate(project.start_date) : '?'} → ${project.end_date ? formatDate(project.end_date) : '?'}`
                        : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-gray-400 flex items-center gap-1"><Users2 className="w-3 h-3" />Équipe</div>
                    <div className="font-semibold text-marine mt-0.5">{project.equipeCount || '—'}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-gray-400">Devis</div>
                    <div className="font-semibold text-marine tabular-nums mt-0.5">{project.montantDevis > 0 ? formatCurrency(project.montantDevis) : '—'}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-gray-400">Marge est.</div>
                    <div className={`font-semibold tabular-nums mt-0.5 ${project.marge == null ? 'text-gray-400' : project.marge >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {project.marge == null ? '—' : formatCurrency(project.marge)}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
        active ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
      }`}
    >
      {children}
    </button>
  )
}
