import { createClient } from '@/lib/supabase/server'
import { getTresorerieData } from '@/lib/finances-data'
import TresorerieView from '@/app/finances/TresorerieView'

// Vue Trésorerie autonome (accès direct par URL). Le hub /finances rend la même vue.
export default async function TresoreriePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const data = await getTresorerieData(user.id)
  return (
    <div className="space-y-6">
      <TresorerieView data={data} />
    </div>
  )
}
