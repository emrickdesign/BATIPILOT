'use client'

import { useEffect, useRef, useState } from 'react'
import { Calendar as CalIcon, ChevronLeft, ChevronRight, X } from 'lucide-react'

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function parseISO(s?: string | null): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export default function DatePicker({
  value,
  onChange,
  placeholder = 'Échéance',
}: {
  value?: string | null
  onChange: (v: string | null) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const selected = parseISO(value)
  const [view, setView] = useState<Date>(selected || new Date())
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const today = new Date()
  const isSameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

  const year = view.getFullYear()
  const month = view.getMonth()
  const first = new Date(year, month, 1)
  const startOffset = (first.getDay() + 6) % 7 // lundi = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (Date | null)[] = []
  for (let i = 0; i < startOffset; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d))

  const label = selected
    ? selected.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
    : placeholder

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition ${selected ? 'border-orange-200 bg-orange-50 text-orange-700' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'}`}
      >
        <CalIcon className="size-3.5" />
        {label}
        {selected && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onChange(null) }}
            className="-mr-1 ml-0.5 rounded-full p-0.5 hover:bg-orange-100"
          >
            <X className="size-3" />
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={() => setView(new Date(year, month - 1, 1))} className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100">
              <ChevronLeft className="size-4" />
            </button>
            <div className="text-sm font-semibold capitalize text-slate-800">{MONTHS[month]} {year}</div>
            <button type="button" onClick={() => setView(new Date(year, month + 1, 1))} className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100">
              <ChevronRight className="size-4" />
            </button>
          </div>
          <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-slate-400">
            {WEEKDAYS.map((w, i) => <span key={i}>{w}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) =>
              d ? (
                <button
                  key={i}
                  type="button"
                  onClick={() => { onChange(toISO(d)); setOpen(false) }}
                  className={`flex size-8 items-center justify-center rounded-full text-xs transition ${
                    selected && isSameDay(d, selected)
                      ? 'bg-orange-600 font-bold text-white'
                      : isSameDay(d, today)
                        ? 'font-bold text-orange-600 ring-1 ring-orange-300 hover:bg-orange-50'
                        : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {d.getDate()}
                </button>
              ) : <span key={i} />,
            )}
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
            <button type="button" onClick={() => { onChange(toISO(today)); setOpen(false) }} className="text-xs font-medium text-orange-600 hover:underline">Aujourd’hui</button>
            {selected && <button type="button" onClick={() => { onChange(null); setOpen(false) }} className="text-xs text-slate-400 hover:text-slate-600">Effacer</button>}
          </div>
        </div>
      )}
    </div>
  )
}
