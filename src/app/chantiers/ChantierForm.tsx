'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { FormSection } from '@/components/ui/form-section'
import { toast } from 'sonner'
import type { Project, ProjectStatus } from '@/types'
import { projectStatusLabels, projectStatusOrder, projectTypeOptions, clientDisplayName } from '@/lib/chantiers'
import { entityColors } from '@/lib/entityColors'
import { HardHat, MapPin, StickyNote } from 'lucide-react'

const COLOR = entityColors.chantier

type ClientOption = {
  id: string; type: string
  first_name: string | null; last_name: string | null; company_name: string | null
}

const selectClass =
  'w-full h-10 rounded-md border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary'

export default function ChantierForm({ project }: { project?: Project }) {
  const isEdit = !!project
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [clients, setClients] = useState<ClientOption[]>([])
  const [clientId, setClientId] = useState<string>(project?.client_id || searchParams.get('client') || '')
  const [status, setStatus] = useState<ProjectStatus>(project?.status || 'a_planifier')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase
        .from('clients')
        .select('id, type, first_name, last_name, company_name')
        .eq('user_id', user.id)
        .neq('status', 'archive')
        .order('created_at', { ascending: false })
        .then(({ data }) => setClients((data as ClientOption[]) || []))
    })
  }, [])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const data = new FormData(e.currentTarget)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const payload = {
      client_id: clientId || null,
      title: data.get('title') as string,
      project_type: (data.get('project_type') as string) || null,
      address: (data.get('address') as string) || null,
      start_date: (data.get('start_date') as string) || null,
      end_date: (data.get('end_date') as string) || null,
      status,
      description: (data.get('description') as string) || null,
      notes: (data.get('notes') as string) || null,
    }

    if (isEdit) {
      const { error } = await supabase.from('projects').update(payload).eq('id', project!.id)
      if (error) { toast.error('Erreur lors de la modification'); setLoading(false); return }
      toast.success('Chantier modifié !')
      router.push(`/chantiers/${project!.id}`)
      router.refresh()
    } else {
      const { data: created, error } = await supabase.from('projects')
        .insert({ user_id: user.id, ...payload }).select('id').single()
      if (error || !created) { toast.error('Erreur lors de la création'); setLoading(false); return }
      toast.success('Chantier créé !')
      router.push(`/chantiers/${created.id}`)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 animate-fade-up">
      {/* Identité du chantier */}
      <FormSection icon={HardHat} color={COLOR} title="Identité du chantier">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Nom du chantier *</Label>
            <Input id="title" name="title" required defaultValue={project?.title || ''}
              placeholder="Rénovation appartement Martin" className="h-11" />
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="client_id">Client</Label>
              <select id="client_id" value={clientId} onChange={e => setClientId(e.target.value)} className={selectClass}>
                <option value="">— Aucun —</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{clientDisplayName(c)}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="project_type">Type de chantier</Label>
              <select id="project_type" name="project_type" defaultValue={project?.project_type || ''} className={selectClass}>
                <option value="">— À définir —</option>
                {projectTypeOptions.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="status">Statut</Label>
              <select id="status" value={status} onChange={e => setStatus(e.target.value as ProjectStatus)} className={selectClass}>
                {projectStatusOrder.map(s => (
                  <option key={s} value={s}>{projectStatusLabels[s]}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </FormSection>

      {/* Adresse & planning */}
      <FormSection icon={MapPin} color={COLOR} title="Adresse & planning">
        <div className="grid sm:grid-cols-[1fr_auto_auto] gap-3 items-end">
          <div className="space-y-1.5">
            <Label htmlFor="address">Adresse du chantier</Label>
            <Input id="address" name="address" defaultValue={project?.address || ''}
              placeholder="12 rue de la Paix, 75001 Paris" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="start_date">Début prévu</Label>
            <Input id="start_date" name="start_date" type="date" defaultValue={project?.start_date || ''} className="w-full sm:w-[150px]" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="end_date">Fin prévue</Label>
            <Input id="end_date" name="end_date" type="date" defaultValue={project?.end_date || ''} className="w-full sm:w-[150px]" />
          </div>
        </div>
      </FormSection>

      {/* Description & notes côte à côte */}
      <FormSection icon={StickyNote} color={COLOR} title="Détails">
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="description">Description des travaux</Label>
            <Textarea id="description" name="description" rows={4} defaultValue={project?.description || ''}
              placeholder="Nature et détail des travaux à réaliser..." />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes internes <span className="text-gray-400 font-normal">(privées)</span></Label>
            <Textarea id="notes" name="notes" rows={4} defaultValue={project?.notes || ''}
              placeholder="Notes internes, non visibles par le client..." />
          </div>
        </div>
      </FormSection>

      {/* Barre d'action collante */}
      <div className="sticky bottom-0 -mx-1 bg-gradient-to-t from-[#FAFAF8] via-[#FAFAF8] to-transparent pt-4 pb-2">
        <Button type="submit" className="w-full h-12 text-base shadow-sm" disabled={loading}>
          {loading ? 'Enregistrement...' : isEdit ? 'Enregistrer les modifications' : 'Créer le chantier'}
        </Button>
      </div>
    </form>
  )
}
