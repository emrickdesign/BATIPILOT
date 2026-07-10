'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, Mail, FileText, Receipt,
  Users, Tag, Settings, LogOut, Menu, X, HardHat, ScanLine, FolderOpen, ReceiptText, Wallet, UserPlus, Users2, CalendarDays, Clock, ChevronDown, BellRing, Calculator, CreditCard, Truck, Sparkles, ChevronLeft, ChevronRight, MessageSquare, Handshake
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { isPole } from '@/lib/roles'

type NavLink = { href: string; label: string; icon: any }

// Accès direct (hors groupes), épinglé en haut
const topNav: NavLink[] = [
  { href: '/dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
  { href: '/messages', label: 'Messages', icon: MessageSquare },
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
    label: 'Chantiers & équipes',
    items: [
      { href: '/chantiers', label: 'Chantiers', icon: HardHat },
      { href: '/planning', label: 'Planning', icon: CalendarDays },
      { href: '/heures', label: 'Heures', icon: Clock },
      { href: '/equipe', label: 'Équipe', icon: Users2 },
      { href: '/sous-traitants', label: 'Sous-traitants', icon: Handshake },
      { href: '/vehicules', label: 'Véhicules', icon: Truck },
    ],
  },
  {
    id: 'finances',
    label: 'Admin & finances',
    items: [
      { href: '/banque', label: 'Paiements', icon: CreditCard },
      { href: '/depenses', label: 'Dépenses', icon: Wallet },
      { href: '/tickets', label: 'Tickets', icon: ReceiptText },
      { href: '/comptable', label: 'Comptable', icon: Calculator },
      { href: '/documents', label: 'Documents', icon: FolderOpen },
    ],
  },
  {
    id: 'outils',
    label: 'Outils',
    items: [
      { href: '/emails', label: 'Mails', icon: Mail },
      { href: '/prix', label: 'Prix', icon: Tag },
      { href: '/plans', label: 'Analyse de plan', icon: ScanLine },
      { href: '/automatisations', label: 'Automatisations', icon: Sparkles },
    ],
  },
]

// Accès direct, épinglé en bas
const bottomNav: NavLink[] = [
  { href: '/parametres', label: 'Paramètres', icon: Settings },
]

function Logo({ collapsed }: { collapsed?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2.5 min-w-0', collapsed && 'justify-center w-full')}>
      <span className="grid place-items-center w-9 h-9 rounded-xl bg-white/95 shadow-[0_4px_14px_rgba(60,20,0,0.18)] flex-shrink-0">
        <HardHat className="w-5 h-5 text-[#D05C43]" strokeWidth={2.2} />
      </span>
      {!collapsed && (
        <span className="text-lg font-bold tracking-tight text-white font-heading truncate">
          Bati<span className="text-white/85">Pilot</span>
        </span>
      )}
    </div>
  )
}

function NavItem({ href, label, icon: Icon, active, onClick, mobile, collapsed }: {
  href: string; label: string; icon: any; active: boolean; onClick?: () => void; mobile?: boolean; collapsed?: boolean
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={cn(
        'group relative flex items-center gap-3 rounded-xl font-medium transition-all duration-200 overflow-hidden whitespace-nowrap',
        collapsed ? 'justify-center px-0 py-2.5' : mobile ? 'px-3 py-3 text-[15px]' : 'px-3 py-2.5 text-sm',
        active
          ? 'bg-white text-[var(--sidebar-primary-foreground)] shadow-[0_5px_14px_rgba(60,20,0,0.22)]'
          : 'text-white/80 hover:bg-white/15 hover:text-white'
      )}
    >
      <Icon className={cn('w-[18px] h-[18px] flex-shrink-0 transition-transform', !active && 'text-white/70 group-hover:text-white group-hover:scale-110')} strokeWidth={2.1} />
      {!collapsed && label}
    </Link>
  )
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [profile, setProfile] = useState<{ name: string; role: string; initials: string }>({ name: '', role: 'Artisan', initials: '' })
  const [collapsed, setCollapsed] = useState(false)

  // Sidebar repliable (desktop) : préférence persistée par appareil.
  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('batipilot_sidebar_collapsed_v2') : null
    if (stored === '1') setCollapsed(true)
  }, [])
  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev
      if (typeof window !== 'undefined') localStorage.setItem('batipilot_sidebar_collapsed_v2', next ? '1' : '0')
      return next
    })
  }

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

  const SidebarBody = ({ mobile, rail }: { mobile?: boolean; rail?: boolean }) => (
    <>
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto overflow-x-hidden">
        {topNav.map(item => (
          <NavItem key={item.href} {...item} active={isActive(item.href)} mobile={mobile} collapsed={rail} onClick={mobile ? () => setMenuOpen(false) : undefined} />
        ))}
        {navGroups.map(group => {
          const open = isGroupOpen(group.id)
          return (
            <div key={group.id} className={rail ? 'pt-2' : 'pt-3'}>
              {rail ? (
                <div className="border-t border-white/15 mx-1 mb-2" />
              ) : (
                <button
                  onClick={() => toggleGroup(group.id)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/60 hover:text-white/90 transition-colors overflow-hidden whitespace-nowrap"
                >
                  <span className="truncate">{group.label}</span>
                  <ChevronDown className={cn('w-3.5 h-3.5 shrink-0 transition-transform duration-200', open ? 'rotate-0' : '-rotate-90')} />
                </button>
              )}
              {(rail || open) && (
                <div className="mt-1 space-y-1">
                  {group.items.map(item => (
                    <NavItem key={item.href} {...item} active={isActive(item.href)} mobile={mobile} collapsed={rail} onClick={mobile ? () => setMenuOpen(false) : undefined} />
                  ))}
                </div>
              )}
            </div>
          )
        })}
        <div className="pt-3 border-t border-white/15 mt-3">
          {bottomNav.map(item => (
            <NavItem key={item.href} {...item} active={isActive(item.href)} mobile={mobile} collapsed={rail} onClick={mobile ? () => setMenuOpen(false) : undefined} />
          ))}
        </div>
      </nav>
      <div className="p-3 border-t border-white/10">
        <div className={cn('flex items-center gap-2.5 rounded-xl px-2.5 py-2 hover:bg-white/15 transition-colors', rail && 'justify-center px-0')}>
          <span className="grid place-items-center w-9 h-9 rounded-full bg-white/20 text-white text-xs font-bold flex-shrink-0" title={rail ? profile.name : undefined}>
            {profile.initials}
          </span>
          {!rail && (
            <>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white truncate leading-tight">{profile.name}</p>
                <p className="text-xs text-white/70">{profile.role}</p>
              </div>
              <button onClick={handleLogout} title="Se déconnecter" className="grid place-items-center w-8 h-8 rounded-lg text-white/70 hover:text-white hover:bg-white/15 transition-colors flex-shrink-0">
                <LogOut className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
        {rail && (
          <button onClick={handleLogout} title="Se déconnecter" className="mt-1 w-full grid place-items-center h-8 rounded-lg text-white/70 hover:text-white hover:bg-white/15 transition-colors">
            <LogOut className="w-4 h-4" />
          </button>
        )}
      </div>
    </>
  )

  return (
    <div className="min-h-screen flex">
      {/* Sidebar desktop */}
      <aside
        className={cn(
          'bp-sidebar hidden md:flex flex-col fixed inset-y-0 z-30 transition-[width] duration-200 ease-out',
          collapsed ? 'w-[72px]' : 'w-60'
        )}
      >
        <div className="bp-sidebar__glows" aria-hidden>
          <span className="bp-sidebar__glow bp-sidebar__glow--a" />
          <span className="bp-sidebar__glow bp-sidebar__glow--b" />
          <span className="bp-sidebar__glow bp-sidebar__glow--c" />
        </div>
        <div className={cn('relative z-10 h-16 flex items-center border-b border-white/15', collapsed ? 'px-2' : 'px-4')}>
          <Logo collapsed={collapsed} />
        </div>
        <div className="relative z-10 flex flex-1 flex-col min-h-0">
          <SidebarBody rail={collapsed} />
        </div>
        <button
          onClick={toggleCollapsed}
          title={collapsed ? 'Déplier le menu' : 'Replier le menu'}
          aria-label={collapsed ? 'Déplier le menu' : 'Replier le menu'}
          className="absolute -right-3 top-[52px] z-40 grid place-items-center w-6 h-6 rounded-full bg-[#D05C43] border border-white/25 text-white/90 hover:text-white hover:bg-[#C14E33] shadow-[var(--shadow-sm)] transition-colors"
        >
          {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
        </button>
      </aside>

      {/* Mobile header */}
      <div className="bp-sidebar md:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 h-14">
        <Logo />
        <button onClick={() => setMenuOpen(!menuOpen)} className="relative z-10 grid place-items-center w-9 h-9 rounded-lg text-white/90 hover:bg-white/15 transition-colors" aria-label="Menu">
          {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="bp-sidebar md:hidden fixed inset-0 z-40 pt-14 flex flex-col animate-fade-in">
          <div className="relative z-10 flex flex-1 flex-col min-h-0">
            <SidebarBody mobile />
          </div>
        </div>
      )}

      {/* Main content */}
      <main className={cn(
        'flex-1 pt-14 md:pt-0 min-h-screen bg-app-bg transition-[margin] duration-200 ease-out',
        collapsed ? 'md:ml-[72px]' : 'md:ml-60'
      )}>
        <div className="p-4 md:p-8">
          {children}
        </div>
      </main>
    </div>
  )
}
