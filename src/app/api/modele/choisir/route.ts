import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { PREDEFINED_TEMPLATES } from '@/lib/pdf-templates'
import { DOC_TEMPLATES } from '@/lib/doc-templates'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

    const { template_id, primary_color } = await req.json()
    // Nouveaux modèles HTML (azur, via…) ou anciens (compat).
    if (!template_id || (!DOC_TEMPLATES[template_id] && !PREDEFINED_TEMPLATES[template_id])) {
      return NextResponse.json({ error: 'template_id invalide' }, { status: 400 })
    }

    const { data: company } = await supabase.from('companies').select('template_style').eq('user_id', user.id).single()

    const newStyle = {
      ...(company?.template_style || {}),
      template_id,
      ...(primary_color ? { primary_color } : {}),
    }

    await supabase.from('companies').update({ template_style: newStyle }).eq('user_id', user.id)
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Erreur serveur' }, { status: 500 })
  }
}
