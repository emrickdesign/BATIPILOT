'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Bell } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AppNotification } from '@/types'

/** Cloche de notifications admin (in-app). tone : sur fond sombre (sidebar) ou clair (contenu). */
export default function NotificationBell({ tone = 'onDark' }: { tone?: 'onDark' | 'onLight' }) {
  const [items, setItems] = useState<AppNotification[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const unread = items.filter((n) => !n.read_at).length

  async function load() {
    try {
      const supabase = createClient()
      const { data } = await supabase.from('notifications').select('*').is('employee_id', null).order('created_at', { ascending: false }).limit(20)
      setItems((data as AppNotification[]) || [])
    } catch { /* silencieux */ }
  }
  useEffect(() => { load(); const t = setInterval(load, 45000); return () => clearInterval(t) }, [])
  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  async function toggle() {
    const willOpen = !open
    setOpen(willOpen)
    if (willOpen && unread > 0) {
      const now = new Date().toISOString()
      setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })))
      try { await createClient().from('notifications').update({ read_at: now }).is('employee_id', null).is('read_at', null) } catch { /* */ }
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggle}
        aria-label="Notifications"
        className={cn(
          'relative grid place-items-center transition-colors',
          tone === 'onDark'
            ? 'h-9 w-9 rounded-lg text-white/90 hover:bg-white/15'
            : 'h-10 w-10 rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50',
        )}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 max-h-[70vh] w-80 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">Notifications</div>
          {items.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-slate-400">Aucune notification.</p>
          ) : (
            items.map((n) => {
              const body = (
                <div className={cn('border-b border-slate-50 px-4 py-3', !n.read_at && 'bg-orange-50/40')}>
                  <div className="text-sm font-medium text-slate-800">{n.title}</div>
                  {n.body && <div className="mt-0.5 text-xs text-slate-500">{n.body}</div>}
                  <div className="mt-1 text-[11px] text-slate-400">
                    {new Date(n.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })} · {new Date(n.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              )
              return n.href
                ? <Link key={n.id} href={n.href} onClick={() => setOpen(false)} className="block hover:bg-slate-50">{body}</Link>
                : <div key={n.id}>{body}</div>
            })
          )}
        </div>
      )}
    </div>
  )
}
