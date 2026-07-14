'use client'

import { useState, type ReactNode } from 'react'
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, useSensor, useSensors,
  useDroppable, useDraggable, pointerWithin,
  type DragStartEvent, type DragEndEvent,
} from '@dnd-kit/core'

export type KanbanColumn = { key: string; label: string; dot: string }
export type KanbanItem = { id: string; col: string }

function DraggableCard({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id })
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`touch-none outline-none ${isDragging ? 'opacity-40' : ''}`}
    >
      {children}
    </div>
  )
}

function DroppableColumn({ col, count, children }: { col: KanbanColumn; count: number; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key })
  return (
    <div className="flex flex-col min-w-0">
      <div className="flex items-center justify-between px-1 mb-2">
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: col.dot }} />
          {col.label}
        </span>
        <span className="text-xs font-semibold rounded-full px-2 py-0.5" style={{ backgroundColor: `${col.dot}26`, color: col.dot }}>{count}</span>
      </div>
      <div
        ref={setNodeRef}
        className="space-y-3 rounded-2xl p-2.5 min-h-[80px] flex-1 transition-all"
        style={{
          backgroundColor: isOver ? `${col.dot}33` : `${col.dot}1A`,
          boxShadow: isOver ? `inset 0 0 0 2px ${col.dot}` : 'none',
        }}
      >
        {count === 0 ? <p className="text-xs text-gray-400 text-center py-6">—</p> : children}
      </div>
    </div>
  )
}

// Kanban générique avec glisser-déposer (dnd-kit). Contrôlé : le parent détient `items`
// (chaque item porte sa colonne `col`) et applique le déplacement dans `onMove`.
export default function DndKanban<T extends KanbanItem>({
  columns, items, onMove, renderCard, footer,
}: {
  columns: KanbanColumn[]
  items: T[]
  onMove: (id: string, toCol: string) => void
  renderCard: (item: T) => ReactNode
  footer?: ReactNode
}) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(
    // distance 8px : un clic (lien, select) passe, seul un vrai glissé déclenche le drag
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  )

  const onStart = (e: DragStartEvent) => setActiveId(String(e.active.id))
  const onEnd = (e: DragEndEvent) => {
    setActiveId(null)
    const id = String(e.active.id)
    const overCol = e.over ? String(e.over.id) : null
    if (!overCol) return
    const item = items.find(i => i.id === id)
    if (item && item.col !== overCol && columns.some(c => c.key === overCol)) onMove(id, overCol)
  }

  const activeItem = activeId ? items.find(i => i.id === activeId) : null

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={onStart} onDragEnd={onEnd} onDragCancel={() => setActiveId(null)}>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
        {columns.map(col => {
          const colItems = items.filter(i => i.col === col.key)
          return (
            <DroppableColumn key={col.key} col={col} count={colItems.length}>
              {colItems.map(item => (
                <DraggableCard key={item.id} id={item.id}>{renderCard(item)}</DraggableCard>
              ))}
            </DroppableColumn>
          )
        })}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeItem ? <div className="rotate-2 cursor-grabbing shadow-[var(--shadow-lg)] rounded-2xl">{renderCard(activeItem)}</div> : null}
      </DragOverlay>
      {footer}
    </DndContext>
  )
}
