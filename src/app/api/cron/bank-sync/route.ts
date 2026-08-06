import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { syncUserBank } from '@/lib/bank/sync'
import { gocardlessConfigured } from '@/lib/bank/gocardless'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Synchro bancaire automatique (Vercel Cron). Pour chaque connexion active,
// importe les nouveaux virements et les rapproche automatiquement des factures.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }
  if (!gocardlessConfigured()) return NextResponse.json({ ok: true, skipped: 'not_configured' })

  const supabase = createServiceClient()
  const { data: conns } = await supabase.from('bank_connections')
    .select('user_id').eq('status', 'linked')
  const userIds = [...new Set((conns || []).map(c => c.user_id as string))]

  let imported = 0, matched = 0
  for (const uid of userIds) {
    try {
      const r = await syncUserBank(supabase, uid)
      imported += r.imported; matched += r.matched
    } catch { /* on continue les autres comptes */ }
  }
  return NextResponse.json({ ok: true, users: userIds.length, imported, matched })
}
