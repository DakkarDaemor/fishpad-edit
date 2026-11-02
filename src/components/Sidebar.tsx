import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'

interface Props {
  width: number
  onResize: (width: number) => void
  /** schermo del telefono: un cassetto sopra l'editor, che si chiude toccando fuori */
  drawer?: { onClose: () => void }
  /** chiusa: resta solo il bordo, che col doppio clic la riapre */
  collapsed?: boolean
  /** doppio clic sul bordo: chiude o riapre */
  onToggle?: () => void
  children: ReactNode
}

/** Barra laterale a sinistra, ridimensionabile trascinando il bordo destro; doppio clic sul bordo la chiude o riapre. */
export function Sidebar({ width, onResize, drawer, collapsed, onToggle, children }: Props) {
  const drag = useRef<{ x: number; w: number } | null>(null)
  const onDown = (e: ReactPointerEvent) => {
    if (collapsed) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, w: width }
  }
  const onMove = (e: ReactPointerEvent) => {
    if (!drag.current) return
    const max = Math.max(160, window.innerWidth - 320)
    onResize(Math.round(Math.min(max, Math.max(160, drag.current.w + e.clientX - drag.current.x))))
  }
  if (drawer) {
    return (
      <>
        <div className="drawer-backdrop" onClick={drawer.onClose} />
        <aside className="sidebar drawer">{children}</aside>
      </>
    )
  }
  return (
    <>
      {!collapsed && (
        <aside className="sidebar" style={{ width }}>
          {children}
        </aside>
      )}
      <div
        className={`gutter sidebar-gutter${collapsed ? ' collapsed' : ''}`}
        title={collapsed ? 'Doppio clic: apri la barra laterale' : 'Trascina per allargare, doppio clic per chiudere'}
        onDoubleClick={onToggle}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={() => (drag.current = null)}
      />
    </>
  )
}
