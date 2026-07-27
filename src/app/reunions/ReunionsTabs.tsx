'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Mic, ListChecks } from 'lucide-react'

const TABS = [
  { href: '/reunions', label: 'Réunions', icon: Mic, exact: true },
  { href: '/reunions/actions', label: 'Actions', icon: ListChecks, exact: false },
]

export default function ReunionsTabs() {
  const path = usePathname()
  return (
    <div className="mb-5 inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1">
      {TABS.map((t) => {
        const active = t.exact ? path === t.href : path.startsWith(t.href)
        const Icon = t.icon
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${active ? 'bg-orange-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            <Icon className="size-4" /> {t.label}
          </Link>
        )
      })}
    </div>
  )
}
