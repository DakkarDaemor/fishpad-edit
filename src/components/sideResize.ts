import { useRef, type PointerEvent as ReactPointerEvent } from 'react'

/** Trascinamento del bordo sinistro di un pannello a destra (anteprima, chat): restituisce gli handler del divisore. */
export function useSideResize(width: number, onResize: (width: number) => void) {
  const drag = useRef<{ x: number; w: number } | null>(null)
  return {
    onPointerDown: (e: ReactPointerEvent) => {
      e.currentTarget.setPointerCapture(e.pointerId)
      drag.current = { x: e.clientX, w: width }
    },
    onPointerMove: (e: ReactPointerEvent) => {
      if (!drag.current) return
      const max = window.innerWidth - 240
      onResize(Math.round(Math.min(max, Math.max(200, drag.current.w + drag.current.x - e.clientX))))
    },
    onPointerUp: () => {
      drag.current = null
    },
  }
}
