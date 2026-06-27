import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

    const body = await req.json()
    const client_id = body.client_id?.trim()
    const client_secret = body.client_secret?.trim()

    if (!client_id || !client_secret) {
      return NextResponse.json({ error: 'client_id et client_secret requis' }, { status: 400 })
    }

    // Vérifie si une ligne existe déjà
    const { data: existing, error: selectError } = await supabase
      .from('gmail_connections')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (selectError) {
      console.error('Select error:', selectError)
      return NextResponse.json({ error: `Erreur lecture BDD: ${selectError.message}` }, { status: 500 })
    }

    if (existing) {
      const { error: updateError } = await supabase
        .from('gmail_connections')
        .update({ client_id, client_secret, updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
      if (updateError) {
        console.error('Update error:', updateError)
        return NextResponse.json({ error: `Erreur mise à jour: ${updateError.message}` }, { status: 500 })
      }
    } else {
      const { error: insertError } = await supabase
        .from('gmail_connections')
        .insert({ user_id: user.id, client_id, client_secret })
      if (insertError) {
        console.error('Insert error:', insertError)
        return NextResponse.json({ error: `Erreur insertion: ${insertError.message}` }, { status: 500 })
      }
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Unhandled error:', err)
    return NextResponse.json({ error: err?.message ?? 'Erreur serveur' }, { status: 500 })
  }
}
