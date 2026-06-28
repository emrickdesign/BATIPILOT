import { createClient } from '@/lib/supabase/server'
import VehiculesManager from './VehiculesManager'

export default async function VehiculesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [vehiclesRes, employeesRes] = await Promise.all([
    supabase.from('vehicles').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    supabase.from('employees').select('*').eq('user_id', user.id).eq('active', true).order('full_name'),
  ])

  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <h1 className="text-2xl md:text-[28px] font-heading font-bold text-marine">Flotte & véhicules</h1>
        <p className="text-gray-500 mt-1 text-sm">Tes véhicules, leurs conducteurs et leur présence sur les chantiers. Saisie manuelle ou import.</p>
      </div>
      <VehiculesManager vehicles={vehiclesRes.data || []} employees={employeesRes.data || []} />
    </div>
  )
}
