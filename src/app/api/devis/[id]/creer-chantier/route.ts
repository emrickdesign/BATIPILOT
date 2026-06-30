import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { isProspect } from '@/lib/clients'
import type { ClientStatus } from '@/types'

// §7.4 — Quand un devis est accepté : créer le chantier (à planifier),
// le rattacher au devis, et convertir le prospect en client si besoin.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

  const { data: quote } = await supabase
    .from('quotes')
    .select('*, clients(id, status, site_address, billing_address)')
    .eq('id', id).eq('user_id', user.id).single()

  if (!quote) return NextResponse.json({ error: 'Devis introuvable' }, { status: 404 })

  // Déjà rattaché à un chantier : on le renvoie sans en recréer.
  if (quote.project_id) return NextResponse.json({ projectId: quote.project_id, existing: true })

  const client = quote.clients as { id: string; status: ClientStatus; site_address?: string; billing_address?: string } | null

  const { data: project, error } = await supabase.from('projects').insert({
    user_id: user.id,
    client_id: quote.client_id,
    title: quote.title || 'Nouveau chantier',
    address: client?.site_address || client?.billing_address || null,
    status: 'a_planifier',
  }).select().single()

  if (error || !project) return NextResponse.json({ error: 'Erreur création chantier' }, { status: 500 })

  // Rattacher le devis au chantier créé.
  await supabase.from('quotes').update({ project_id: project.id }).eq('id', id)

  // Convertir le prospect en client (à planifier) s'il est encore au stade prospect.
  if (client && isProspect(client.status)) {
    await supabase.from('clients').update({ status: 'chantier_a_planifier' }).eq('id', client.id)
  }

  return NextResponse.json({ projectId: project.id })
}
