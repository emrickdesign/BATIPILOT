import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Preuve de valeur du module mail : ce que l'activité email rapporte ce mois-ci.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const [{ data: emails }, { data: quotes }] = await Promise.all([
    supabase.from('emails').select('category, received_at').eq('user_id', user.id).gte('received_at', start),
    supabase.from('quotes').select('status, total_ttc, created_at').eq('user_id', user.id).gte('created_at', start),
  ])

  const demandesDevis = (emails || []).filter(e => e.category === 'demande_devis').length
  const q = quotes || []
  const devisEnvoyes = q.filter(x => x.status !== 'brouillon').length
  const signesEur = q
    .filter(x => x.status === 'accepte' || x.status === 'transforme')
    .reduce((s, x) => s + (Number(x.total_ttc) || 0), 0)

  return NextResponse.json({ demandesDevis, devisEnvoyes, signesEur })
}
