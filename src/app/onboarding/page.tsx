'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import OnboardingWizard, { type OnboardingResult, type WizardInitial } from './OnboardingWizard'

export default function OnboardingPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [userEmail, setUserEmail] = useState('')
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [initial, setInitial] = useState<WizardInitial>({})

  // Charge l'utilisateur + une éventuelle fiche entreprise déjà commencée.
  // Si l'onboarding est déjà terminé, on renvoie au tableau de bord.
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.replace('/login'); return }
      setUserEmail(user.email || '')
      supabase.from('companies').select('*').eq('user_id', user.id).maybeSingle().then(({ data }) => {
        if (data?.onboarding_completed_at) { router.replace('/dashboard'); return }
        if (data) {
          setCompanyId(data.id)
          setInitial({
            trade_name: data.trade_name || '', legal_name: data.legal_name || '', siret: data.siret || '',
            vat_number: data.vat_number || '', legal_status: data.legal_status || '', address: data.address || '',
            phone: data.phone || '', email: data.email || user.email || '', website: data.website || '',
            insurance_decennale: data.insurance_decennale || '', insurance_rc: data.insurance_rc || '', iban: data.iban || '',
            payment_terms: data.payment_terms || undefined,
            quote_validity_days: data.quote_validity_days ?? undefined,
            default_deposit_percent: data.default_deposit_percent ?? undefined,
            default_vat_rate: data.default_vat_rate ?? undefined,
            legal_mentions: data.legal_mentions || undefined,
            trade: data.trade, secondary_trades: data.secondary_trades,
            company_size: data.company_size, employees_count: data.employees_count ?? undefined,
            interests: data.interests,
          })
        }
        setReady(true)
      })
    })
  }, [router])

  async function handleFinish(r: OnboardingResult) {
    setFinishing(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/login'); return }

    const f = r.form
    const payload = {
      user_id: user.id,
      trade_name: f.trade_name.trim(),
      legal_name: f.legal_name.trim() || null,
      siret: f.siret.trim() || null,
      vat_number: f.vat_number.trim() || null,
      legal_status: f.legal_status || null,
      address: f.address.trim() || null,
      phone: f.phone.trim() || null,
      email: f.email.trim() || null,
      website: f.website.trim() || null,
      insurance_decennale: f.insurance_decennale.trim() || null,
      insurance_rc: f.insurance_rc.trim() || null,
      iban: f.iban.trim() || null,
      payment_terms: f.payment_terms,
      quote_validity_days: parseInt(f.quote_validity_days) || 30,
      default_deposit_percent: parseFloat(f.default_deposit_percent) || 30,
      default_vat_rate: parseFloat(f.default_vat_rate) || 10,
      legal_mentions: f.legal_mentions || null,
      trade: r.primaryTrade || null,
      secondary_trades: r.secondaryTrades,
      company_size: r.companySize || null,
      employees_count: r.employeesCount,
      interests: r.interests,
      onboarding_completed_at: new Date().toISOString(),
    }

    const { error } = companyId
      ? await supabase.from('companies').update(payload).eq('id', companyId)
      : await supabase.from('companies').insert(payload)

    if (error) {
      toast.error('Erreur lors de l’enregistrement. Réessayez.')
      setFinishing(false)
      return
    }

    // Base de prix : seed filtré par métier (les autres choix se font après).
    if (r.priceChoice === 'seed') {
      try {
        const res = await fetch('/api/seed-prix', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trades: [r.primaryTrade, ...r.secondaryTrades] }),
        })
        if (res.ok) {
          const json = await res.json().catch(() => null)
          toast.success(`Base de prix installée${json?.count ? ` (${json.count} prestations)` : ''}`)
        }
      } catch { /* non bloquant : l'utilisateur pourra seeder depuis /prix */ }
    }

    toast.success('Bienvenue sur TonPilote ! Votre espace est prêt.')
    router.replace(r.priceChoice === 'ia' ? '/prix' : '/dashboard')
  }

  if (!ready) {
    return (
      <div className="min-h-screen grid place-items-center bg-[#FBF9F5]">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    )
  }

  return <OnboardingWizard userEmail={userEmail} initial={initial} onFinish={handleFinish} finishing={finishing} />
}
