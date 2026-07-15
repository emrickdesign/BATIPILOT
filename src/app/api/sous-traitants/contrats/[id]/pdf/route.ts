import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { generateContractPDF } from '@/lib/pdf-generator'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

  const [{ data: contract }, { data: company }] = await Promise.all([
    supabase.from('subcontractor_contracts').select('*, subcontractors(*)').eq('id', id).eq('user_id', user.id).single(),
    supabase.from('companies').select('*').eq('user_id', user.id).single(),
  ])
  if (!contract) return NextResponse.json({ error: 'Introuvable' }, { status: 404 })

  let project_title: string | null = null
  if (contract.project_id) {
    const { data: p } = await supabase.from('projects').select('title').eq('id', contract.project_id).single()
    project_title = p?.title ?? null
  }

  const pdf = await generateContractPDF({ ...contract, project_title }, contract.subcontractors, company)
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="contrat-sous-traitance.pdf"`,
    },
  })
}
