import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import MonthCard from './MonthCard'
import { loadMonths } from './data'

export default async function ComptablePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [months, { data: sends }, { data: company }] = await Promise.all([
    loadMonths(supabase, user.id),
    supabase.from('accounting_sends').select('month_key, sent_at, to_email').eq('user_id', user.id).order('sent_at', { ascending: false }),
    supabase.from('companies').select('accountant_email').eq('user_id', user.id).maybeSingle(),
  ])

  // Dernier envoi par mois
  const lastSend = new Map<string, { sent_at: string; to_email: string }>()
  for (const s of sends || []) {
    if (!lastSend.has(s.month_key)) lastSend.set(s.month_key, { sent_at: s.sent_at, to_email: s.to_email })
  }

  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <h1 className="text-2xl md:text-[28px] font-heading font-bold text-marine">Préparation comptable</h1>
        <p className="text-gray-500 mt-1 text-sm">Tes dépenses et tes factures regroupées par mois. Clique un chiffre pour voir le détail, puis envoie le dossier à ta comptable.</p>
      </div>

      {months.length === 0 ? (
        <Card className="border border-gray-200/80 bg-white">
          <CardContent className="p-10 text-center text-gray-400">
            Aucune dépense ni facture pour l&apos;instant. Scanne un ticket ou crée une facture pour démarrer.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {months.map((m, i) => (
            <MonthCard key={m.key} monthKey={m.key} label={m.label} expenses={m.expenses}
              invoices={m.invoices} subInvoices={m.subInvoices} index={i}
              lastSend={lastSend.get(m.key) || null}
              accountantEmail={company?.accountant_email || ''} />
          ))}
        </div>
      )}
    </div>
  )
}
