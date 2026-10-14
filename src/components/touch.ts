import { useEffect, useSyncExternalStore, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'

/** Larghezza sotto la quale l'interfaccia passa alla disposizione per telefono. */
export const COMPACT_QUERY = '(max-width: 700px)'
export const COARSE_QUERY = '(pointer: coarse)'

export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query)
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
  )
}

const LONG_PRESS_MS = 500
const MOVE_TOLERANCE = 10

// Si tocca un elemento alla volta: basta uno stato condiviso
let timer: number | undefined
let start: { x: number; y: number } | null = null
let fired = false
/** eventi già presi da un elemento più interno (una riga dell'albero dentro l'albero) */
const claimed = new WeakSet<Event>()

function cancel() {
  clearTimeout(timer)
  start = null
}

/**
 * Pressione prolungata col dito: apre lo stesso menu del tasto destro (Safari su iPhone e iPad
 * non genera `contextmenu`). Il clic che arriva quando si solleva il dito viene ignorato.
 */
export function longPress(onPress: (x: number, y: number) => void) {
  return {
    onPointerDown: (e: ReactPointerEvent) => {
      if (e.pointerType !== 'touch' || claimed.has(e.nativeEvent)) return
      claimed.add(e.nativeEvent)
      cancel()
      fired = false
      const at = { x: e.clientX, y: e.clientY }
      start = at
      timer = window.setTimeout(() => {
        fired = true
        start = null
        navigator.vibrate?.(10)
        onPress(at.x, at.y)
      }, LONG_PRESS_MS)
    },
    onPointerMove: (e: ReactPointerEvent) => {
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > MOVE_TOLERANCE) cancel()
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onClickCapture: (e: ReactMouseEvent) => {
      if (!fired) return
      fired = false
      e.preventDefault()
      e.stopPropagation()
    },
  }
}

/**
 * Sui dispositivi touch l'app occupa solo la parte visibile sopra la tastiera virtuale
 * (Safari su iOS non ridimensiona la pagina quando la tastiera si apre).
 */
export function useVisualViewport(enabled: boolean) {
  useEffect(() => {
    const vv = window.visualViewport
    const root = document.documentElement
    if (!enabled || !vv) return
    const update = () => {
      // con lo zoom a due dita la parte visibile è più piccola, ma l'app non deve rimpicciolirsi
      if (Math.abs(vv.scale - 1) > 0.01) return
      root.style.setProperty('--app-height', `${vv.height}px`)
      root.style.setProperty('--app-top', `${vv.offsetTop}px`)
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      root.style.removeProperty('--app-height')
      root.style.removeProperty('--app-top')
    }
  }, [enabled])
}
