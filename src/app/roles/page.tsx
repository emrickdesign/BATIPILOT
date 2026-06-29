import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ShieldCheck, Crown, Check, Info, UserPlus } from 'lucide-react'
import Link from 'next/link'
import { employeeInitials } from '@/lib/equipe'
import { accessRoleOrder, accessRoleLabels, accessRoleColors, rolePermissions } from '@/lib/roles'
import type { AccessRole } from '@/lib/roles'
import RoleAssign from './RoleAssign'

export default async function RolesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single()
  const { data: employees } = await supabase.from('employees').select('id, full_name, role, access_role, color').eq('user_id', user.id).order('full_name')

  const adminName = profile?.full_name || user.email?.split('@')[0] || 'Vous'

  return (
    <div className="space-y-7">
      <div className="animate-fade-up">
        <h1 className="text-2xl md:text-[28px] font-heading font-bold text-marine">Utilisateurs & rôles</h1>
        <p className="text-gray-500 mt-1 text-sm">Définis qui accède à quoi dans BatiPilot.</p>
      </div>

      {/* Admin */}
      <div className="animate-fade-up">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Compte principal</h2>
        <Card className="border border-primary/30 bg-accent/40">
          <CardContent className="p-4 flex items-center gap-3">
            <span className="grid place-items-center w-11 h-11 rounded-full bg-gradient-to-br from-[#FF8A2B] to-[#FF6A00] text-white font-bold flex-shrink-0">
              {employeeInitials(adminName)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-marine truncate">{adminName}</div>
              <div className="text-xs text-gray-500">{user.email}</div>
            </div>
            <Badge className="bg-accent text-primary border-0 gap-1"><Crown className="w-3.5 h-3.5" /> Admin / dirigeant</Badge>
          </CardContent>
        </Card>
      </div>

      {/* Accès de l'équipe */}
      <div className="animate-fade-up">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Accès de l&apos;équipe</h2>
          <Link href="/equipe" className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1">
            <UserPlus className="w-3.5 h-3.5" /> Gérer l&apos;équipe
          </Link>
        </div>
        <Card className="border border-gray-200/80 bg-white">
          <CardContent className="p-2 sm:p-4">
            {!employees?.length ? (
              <p className="text-sm text-gray-400 py-6 text-center">Aucun salarié. Ajoute ton équipe depuis le module Équipe pour leur attribuer un rôle.</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {employees.map(e => (
                  <div key={e.id} className="flex items-center gap-3 py-2.5 px-1">
                    <span className="grid place-items-center w-9 h-9 rounded-full text-white text-xs font-bold flex-shrink-0" style={{ backgroundColor: e.color }}>
                      {employeeInitials(e.full_name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-marine truncate">{e.full_name}</div>
                      {e.role && <div className="text-xs text-gray-400">{e.role}</div>}
                    </div>
                    {e.access_role && (
                      <Badge className={`${accessRoleColors[e.access_role as AccessRole] || 'bg-gray-100 text-gray-600'} border-0 text-[10px] hidden sm:inline-flex`}>
                        {accessRoleLabels[e.access_role as AccessRole] || e.access_role}
                      </Badge>
                    )}
                    <RoleAssign employeeId={e.id} current={e.access_role} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <div className="flex items-start gap-2 mt-3 text-xs text-gray-500 bg-blue-50/60 border border-blue-100 rounded-lg p-3">
          <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
          <span>Les rôles définissent les accès. La <strong>connexion individuelle par salarié</strong> (identifiant propre, pointage mobile dédié) sera activée dans une prochaine étape — elle s&apos;appuiera sur ces rôles.</span>
        </div>
      </div>

      {/* Matrice des permissions */}
      <div className="animate-fade-up">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Permissions par rôle</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {accessRoleOrder.map(role => (
            <Card key={role} className="border border-gray-200/80 bg-white">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className={`grid place-items-center w-8 h-8 rounded-lg ${accessRoleColors[role]}`}><ShieldCheck className="w-4 h-4" /></span>
                  <span className="font-semibold text-marine text-sm">{accessRoleLabels[role]}</span>
                </div>
                <ul className="space-y-1.5">
                  {rolePermissions[role].map((p, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-gray-600">
                      <Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" /> {p}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
