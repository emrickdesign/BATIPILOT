'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { HardHat, MapPin, User } from 'lucide-react'
import type { Project, ProjectStatus } from '@/types'
import {
  projectStatusLabels, projectStatusColors, projectStatusOrder, clientDisplayName,
} from '@/lib/chantiers'

export default function ChantiersList({ projects }: { projects: Project[] }) {
  const [filter, setFilter] = useState<ProjectStatus | 'tous'>('tous')

  // Statuts réellement présents, dans l'ordre logique, pour ne montrer que les filtres utiles
  const presentStatuses = useMemo(() => {
    const set = new Set(projects.map(p => p.status))
    return projectStatusOrder.filter(s => set.has(s))
  }, [projects])

  const filtered = useMemo(
    () => (filter === 'tous' ? projects : projects.filter(p => p.status === filter)),
    [projects, filter],
  )

  if (!projects.length) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-gray-500">
          <HardHat className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="font-medium">Aucun chantier pour l&apos;instant</p>
          <p className="text-sm mt-1">Créez votre premier chantier pour commencer à piloter.</p>
          <Link href="/chantiers/nouveau" className="mt-4 inline-block">
            <Button>Nouveau chantier</Button>
          </Link>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filtres par statut */}
      <div className="flex flex-wrap gap-2">
        <FilterChip active={filter === 'tous'} onClick={() => setFilter('tous')}>
          Tous ({projects.length})
        </FilterChip>
        {presentStatuses.map(s => {
          const count = projects.filter(p => p.status === s).length
          return (
            <FilterChip key={s} active={filter === s} onClick={() => setFilter(s)}>
              {projectStatusLabels[s]} ({count})
            </FilterChip>
          )
        })}
      </div>

      {/* Liste */}
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
                      <div className="font-semibold text-gray-900 truncate">
                        {project.title || 'Chantier sans titre'}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                        <span className="flex items-center gap-1 truncate">
                          <User className="w-3 h-3" />{clientDisplayName(project.clients)}
                        </span>
                        {project.address && (
                          <span className="flex items-center gap-1 truncate">
                            <MapPin className="w-3 h-3" />{project.address}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <Badge className={`${projectStatusColors[project.status] || 'bg-gray-100 text-gray-700'} border-0 flex-shrink-0 text-xs`}>
                    {projectStatusLabels[project.status] || project.status}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}

function FilterChip({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
        active
          ? 'border-blue-500 bg-blue-50 text-blue-700'
          : 'border-gray-200 text-gray-600 hover:border-gray-300'
      }`}
    >
      {children}
    </button>
  )
}
