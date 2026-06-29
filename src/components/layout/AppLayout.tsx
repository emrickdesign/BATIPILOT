'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, Mail, FileText, Receipt,
  Users, Tag, Settings, LogOut, Menu, X, HardHat, ScanLine, FolderOpen, ReceiptText, Wallet, UserPlus, Users2, CalendarDays, Clock, ChevronDown, BarChart3, BellRing, Calculator, Camera, Landmark, Truck, Sparkles, ShieldCheck, GitCompare, Sun
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { isPole } from '@/lib/roles'

type NavLink = { href: string; label: string; icon: any }

// Accès direct (hors groupes), épinglé en haut
const topNav: NavLink[] = [
  { href: '/dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
  { href: '/resume', label: 'Résumé du jour', icon: Sun },
  { href: '/reporting', label: 'Reporting', icon: BarChart3 },
]

// Familles repliables
const navGroups: { id: string; label: string; items: NavLink[] }[] = [
  {
    id: 'commercial',
    label: 'Commercial',
    items: [
      { href: '/prospects', label: 'Prospects', icon: UserPlus },
      { href: '/clients', label: 'Clients', icon: Users },
      { href: '/devis', label: 'Devis', icon: FileText },
      { href: '/factures', label: 'Factures', icon: Receipt },
      { href: '/relances', label: 'Relances', icon: BellRing },
    ],
  },
  {
    id: 'chantiers',
    label: 'Chantiers & terrain',
    items: [
      { href: '/chantiers', label: 'Chantiers', icon: HardHat },
      { href: '/planning', label: 'Planning', icon: CalendarDays },
      { href: '/heures', label: 'Heures', icon: Clock },
      { href: '/pointage', label: 'Pointage', icon: Camera },
      { href: '/equipe', label: 'Équipe', icon: Users2 },
      { href: '/vehicules', label: 'Véhicules', icon: Truck },
      { href: '/controle', label: 'Contrôle h/véhic.', icon: GitCompare },
    ],
  },
  {
    id: 'finances',
    label: 'Finances & docs',
    items: [
      { href: '/tickets', label: 'Scan tickets', icon: ReceiptText },
      { href: '/depenses', label: 'Dépenses', icon: Wallet },
      { href: '/banque', label: 'Banque', icon: Landmark },
      { href: '/comptable', label: 'Comptable', icon: Calculator },
      { href: '/documents', label: 'Documents', icon: FolderOpen },
    ],
  },
  {
    id: 'outils',
    label: 'Outils',
    items: [
      { href: '/emails', label: 'Mes mails', icon: Mail },
      { href: '/automatisations', label: 'Automatisations', icon: Sparkles },
      { href: '/prix', label: 'Mes prix', icon: Tag },
      { href: '/plans', label: 'Analyser un plan', icon: ScanLine },
      { href: '/roles', label: 'Utilisateurs & rôles', icon: ShieldCheck },
    ],
  },
]

// Accès direct, épinglé en bas
const bottomNav: NavLink[] = [
  { href: '/parametres', label: 'Paramètres', icon: Settings },
]

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid place-items-center w-9 h-9 rounded-xl bg-gradient-to-br from-[#FF8A2B] to-[#FF6A00] shadow-[var(--shadow-brand)]">
        <HardHat className="w-5 h-5 text-white" strokeWidth={2.2} />
      </span>
      <span className="text-lg font-bold tracking-tight text-white font-heading">
        Bati<span className="text-primary">Pilot</span>
      </span>
    </div>
  )
}

function NavItem({ href, label, icon: Icon, active, onClick, mobile }: {
  href: string; label: string; icon: any; active: boolean; onClick?: () => void; mobile?: boolean
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        'group relative flex items-center gap-3 rounded-xl font-medium transition-all duration-200',
        mobile ? 'px-3 py-3 text-[15px]' : 'px-3 py-2.5 text-sm',
        active
          ? 'bg-primary text-primary-foreground shadow-[var(--shadow-brand)]'
          : 'text-slate-300 hover:bg-white/5 hover:text-white'
      )}
    >
      <Icon className={cn('w-[18px] h-[18px] flex-shrink-0 transition-transform', !active && 'text-slate-400 group-hover:text-slate-200 group-hover:scale-110')} strokeWidth={2.1} />
      {label}
    </Link>
  )
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [profile, setProfile] = useState<{ name: string; role: string; initials: string }>({ name: '', role: 'Artisan', initials: '' })

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data } = await supabase.from('profiles').select('full_name').eq('id', user.id).single()
      const name = data?.full_name || user.email?.split('@')[0] || 'Mon compte'
      const initials = name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase() || 'BP'
      setProfile({ name, role: 'Artisan', initials })
    })
  }, [])

  // Pôle d'interface : reteinte toute l'app via data-pole sur <html>.
  // Override live stocké en local ; sinon le défaut 'commercial' (SSR) reste.
  // Prêt à dériver du rôle salarié (roleToPole) dès que les logins par salarié arrivent.
  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('batipilot_pole') : null
    if (isPole(stored)) document.documentElement.setAttribute('data-pole', stored)
  }, [])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')
  const groupHasActive = (id: string) => navGroups.find(g => g.id === id)?.items.some(i => isActive(i.href)) ?? false

  // null = laisser ouvert le groupe actif ; true/false = choix explicite de l'utilisateur
  const [openOverride, setOpenOverride] = useState<Record<string, boolean>>({})
  const isGroupOpen = (id: string) => openOverride[id] ?? groupHasActive(id)
  const toggleGroup = (id: string) => setOpenOverride(prev => ({ ...prev, [id]: !isGroupOpen(id) }))

  const SidebarBody = ({ mobile }: { mobile?: boolean }) => (
    <>
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {topNav.map(item => (
          <NavItem key={item.href} {...item} active={isActive(item.href)} mobile={mobile} onClick={mobile ? () => setMenuOpen(false) : undefined} />
        ))}
        {navGroups.map(group => {
          const open = isGroupOpen(group.id)
          return (
            <div key={group.id} className="pt-3">
              <button
                onClick={() => toggleGroup(group.id)}
                className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-300 transition-colors"
              >
                {group.label}
                <ChevronDown className={cn('w-3.5 h-3.5 transition-transform duration-200', open ? 'rotate-0' : '-rotate-90')} />
              </button>
              {open && (
                <div className="mt-1 space-y-1">
                  {group.items.map(item => (
                    <NavItem key={item.href} {...item} active={isActive(item.href)} mobile={mobile} onClick={mobile ? () => setMenuOpen(false) : undefined} />
                  ))}
                </div>
              )}
            </div>
          )
        })}
        <div className="pt-3 border-t border-white/5 mt-3">
          {bottomNav.map(item => (
            <NavItem key={item.href} {...item} active={isActive(item.href)} mobile={mobile} onClick={mobile ? () => setMenuOpen(false) : undefined} />
          ))}
        </div>
      </nav>
      <div className="p-3 border-t border-white/10">
        <div className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 hover:bg-white/5 transition-colors">
          <span className="grid place-items-center w-9 h-9 rounded-full bg-gradient-to-br from-[#FF8A2B] to-[#FF6A00] text-white text-xs font-bold flex-shrink-0">
            {profile.initials}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white truncate leading-tight">{profile.name}</p>
            <p className="text-xs text-slate-400">{profile.role}</p>
          </div>
          <button onClick={handleLogout} title="Se déconnecter" className="grid place-items-center w-8 h-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </>
  )

  return (
    <div className="min-h-screen flex">
      {/* Sidebar desktop */}
      <aside className="hidden md:flex flex-col w-60 bg-[#0F172A] fixed inset-y-0 z-30">
        <div className="px-4 h-16 flex items-center border-b border-white/10">
          <Logo />
        </div>
        <SidebarBody />
      </aside>

      {/* Mobile header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-[#0F172A] flex items-center justify-between px-4 h-14">
        <Logo />
        <button onClick={() => setMenuOpen(!menuOpen)} className="grid place-items-center w-9 h-9 rounded-lg text-slate-300 hover:bg-white/10 transition-colors" aria-label="Menu">
          {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-[#0F172A] pt-14 flex flex-col animate-fade-in">
          <SidebarBody mobile />
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 md:ml-60 pt-14 md:pt-0 min-h-screen bg-app-bg">
        <div className="p-4 md:p-8 max-w-6xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
