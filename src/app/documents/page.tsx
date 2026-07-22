import { createClient } from '@/lib/supabase/server'
import type { Document } from '@/types'
import DocumentsManager from './DocumentsManager'
import EcheancesAlertes, { type Echeance } from './EcheancesAlertes'

export default async function DocumentsPage({
  searchParams,
}: { searchParams: Promise<{ client?: string; project?: string }> }) {
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: documents }, { data: clients }, { data: projects }, { data: categories }] = await Promise.all([
    supabase
      .from('documents')
      .select('*, clients(type, first_name, last_name, company_name), projects(title)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase.from('clients').select('id, type, first_name, last_name, company_name').eq('user_id', user.id).neq('status', 'archive').order('created_at', { ascending: false }),
    supabase.from('projects').select('id, title').eq('user_id', user.id).neq('status', 'archive').order('created_at', { ascending: false }),
    supabase.from('document_categories').select('id, name, family').eq('user_id', user.id).order('family').order('name'),
  ])

  // URLs signées (bucket privé) — 1h
  const docs = documents || []
  const signed = await Promise.all(
    docs.map(d => supabase.storage.from('documents').createSignedUrl(d.storage_path, 3600)),
  )
  const withUrls = docs.map((d, i) => ({ ...d, signedUrl: signed[i].data?.signedUrl })) as (Document & { signedUrl?: string })[]

  // ── Centre d'alertes d'échéances : documents (entreprise + salariés),
  //    assurances et documents des sous-traitants qui expirent bientôt. ──
  const [{ data: employees }, { data: subs }, { data: subDocs }] = await Promise.all([
    supabase.from('employees').select('id, full_name').eq('user_id', user.id),
    supabase.from('subcontractors').select('id, company_name, insurance_expiry').eq('user_id', user.id).not('insurance_expiry', 'is', null),
    supabase.from('subcontractor_documents').select('type, expiry_date, subcontractor_id').eq('user_id', user.id).not('expiry_date', 'is', null),
  ])
  const empName = new Map((employees || []).map(e => [e.id, e.full_name]))
  const subName = new Map((subs || []).map(s => [s.id, s.company_name]))
  const in60 = new Date(Date.now() + 60 * 86400000).toISOString().split('T')[0]

  const echeances: Echeance[] = []
  for (const d of docs) {
    if (!d.expiry_date || d.expiry_date > in60) continue
    const who = d.employee_id ? empName.get(d.employee_id) : d.projects?.title || (d.clients ? 'Client' : 'Entreprise')
    echeances.push({ label: d.name, sub: [d.category, who].filter(Boolean).join(' · '), date: d.expiry_date, kind: d.employee_id ? 'salarié' : 'document' })
  }
  for (const s of subs || []) {
    if (!s.insurance_expiry || s.insurance_expiry > in60) continue
    echeances.push({ label: `Assurance décennale — ${s.company_name}`, sub: 'sous-traitant', date: s.insurance_expiry, kind: 'sous-traitant' })
  }
  for (const sd of subDocs || []) {
    if (!sd.expiry_date || sd.expiry_date > in60) continue
    echeances.push({ label: `${sd.type} — ${subName.get(sd.subcontractor_id) || 'sous-traitant'}`, sub: 'sous-traitant', date: sd.expiry_date, kind: 'sous-traitant' })
  }
  echeances.sort((a, b) => a.date.localeCompare(b.date))

  return (
    <>
    <EcheancesAlertes echeances={echeances} />
    <DocumentsManager
      documents={withUrls}
      clients={clients || []}
      projects={projects || []}
      categories={categories || []}
      preselectClient={sp.client}
      preselectProject={sp.project}
    />
    </>
  )
}
