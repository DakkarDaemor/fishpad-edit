import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'

interface Props {
  width: number
  onResize: (width: number) => void
  children: ReactNode
}

/** Barra laterale a sinistra, ridimensionabile trascinando il bordo destro. */
export function Sidebar({ width, onResize, children }: Props) {
  const drag = useRef<{ x: number; w: number } | null>(null)
  const onDown = (e: ReactPointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, w: width }
  }
  const onMove = (e: ReactPointerEvent) => {
    if (!drag.current) return
    const max = Math.max(160, window.innerWidth - 320)
    onResize(Math.round(Math.min(max, Math.max(160, drag.current.w + e.clientX - drag.current.x))))
  }
  return (
    <>
      <aside className="sidebar" style={{ width }}>
        {children}
      </aside>
      <div className="gutter sidebar-gutter" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={() => (drag.current = null)} />
    </>
  )
}
