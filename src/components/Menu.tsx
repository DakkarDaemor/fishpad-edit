import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'

export interface MenuAction {
  label: string
  shortcut?: string
  checked?: boolean
  disabled?: boolean
  danger?: boolean
  /** colore CSS mostrato come quadratino accanto all'etichetta */
  swatch?: string
  action?: () => void
  submenu?: MenuItem[]
}
export type MenuItem = MenuAction | 'separator' | { heading: string }

export interface MenuDef {
  label: string
  items: MenuItem[]
}

// mousedown senza preventDefault sposterebbe il focus dall'editor: i comandi (Annulla, Cerca…) devono agire su di lui
const keepFocus = (e: ReactMouseEvent) => e.preventDefault()

/**
 * Voci di un menu. I sottomenu si aprono passandoci sopra o con un clic (al tocco non c'è hover);
 * con `onEnter` invece il clic su un sottomenu lo passa al chiamante, che lo mostra al posto della lista.
 */
function MenuList({ items, onDone, onEnter }: { items: MenuItem[]; onDone: () => void; onEnter?: (item: MenuAction) => void }) {
  const [openSub, setOpenSub] = useState<number | null>(null)
  return (
    <ul className="menu-list" role="menu">
      {items.map((item, i) => {
        if (item === 'separator') return <li key={i} className="menu-sep" role="separator" />
        if ('heading' in item) return <li key={i} className="menu-heading">{item.heading}</li>
        const hasSub = !!item.submenu
        return (
          <li key={i} className={`menu-entry${hasSub ? ' has-sub' : ''}${openSub === i ? ' sub-open' : ''}`} role="none">
            <button
              role="menuitem"
              className={item.danger ? 'danger' : undefined}
              disabled={item.disabled || (hasSub && item.submenu!.length === 0)}
              onMouseDown={keepFocus}
              onClick={() => {
                if (hasSub) {
                  if (onEnter) onEnter(item)
                  else setOpenSub(openSub === i ? null : i)
                  return
                }
                if (!item.action) return
                onDone()
                item.action()
              }}
            >
              <span className="menu-check">{item.checked ? '✓' : ''}</span>
              <span className="menu-label">
                {item.swatch && <span className="menu-swatch" style={{ background: item.swatch }} />}
                {item.label}
              </span>
              <span className="menu-shortcut">{hasSub ? '▸' : item.shortcut}</span>
            </button>
            {hasSub && !onEnter && item.submenu!.length > 0 && (
              <div className="submenu">
                <MenuList items={item.submenu!} onDone={onDone} />
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Chiude al clic fuori dal contenitore o con Esc. Ascolta `pointerdown` e non `mousedown`: dopo una pressione
 * prolungata il browser genera un mousedown che chiuderebbe subito il menu appena aperto.
 */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && close()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('blur', close)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', close)
    }
  }, [open, close])
  return ref
}

/** Barra dei menu tradizionale: un clic apre, poi passando sulle altre voci si scorre tra i menu. */
export function MenuBar({ menus }: { menus: MenuDef[] }) {
  const [open, setOpen] = useState<number | null>(null)
  const close = useCallback(() => setOpen(null), [])
  const ref = useDismiss(open !== null, close)
  return (
    <div className="menubar" role="menubar" ref={ref}>
      {menus.map((m, i) => (
        <div key={m.label} className={`menubar-item${open === i ? ' open' : ''}`}>
          <button
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={open === i}
            onMouseDown={keepFocus}
            onClick={() => setOpen(open === i ? null : i)}
            onMouseEnter={() => open !== null && setOpen(i)}
          >
            {m.label}
          </button>
          {open === i && (
            <div className="menu-panel">
              <MenuList items={m.items} onDone={close} />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/** Voci del sottomenu raggiunto seguendo le etichette di `path`. */
function itemsAt(menus: MenuDef[], path: string[]): MenuItem[] | null {
  let items: MenuItem[] = menus.map((m) => ({ label: m.label, submenu: m.items }))
  for (const label of path) {
    const found = items.find((i): i is MenuAction => typeof i === 'object' && 'label' in i && i.label === label && !!i.submenu)
    if (!found) return null
    items = found.submenu!
  }
  return items
}

/**
 * Menu per lo schermo del telefono: un pulsante ☰ apre un pannello a tutta larghezza, e i sottomenu
 * (File, Modifica… e i loro) prendono il posto della lista, con "‹" per tornare indietro.
 */
export function MobileMenu({ menus }: { menus: MenuDef[] }) {
  // percorso per etichette: le voci si rileggono a ogni render, con lo stato aggiornato (spunte, voci disattivate)
  const [path, setPath] = useState<string[] | null>(null)
  const close = useCallback(() => setPath(null), [])
  const ref = useDismiss(path !== null, close)
  const items = path && itemsAt(menus, path)
  return (
    <div className={`menubar-item${path ? ' open' : ''}`} ref={ref}>
      <button
        className="menu-toggle"
        aria-label="Menu"
        aria-haspopup="menu"
        aria-expanded={!!path}
        onMouseDown={keepFocus}
        onClick={() => setPath(path ? null : [])}
      >
        ☰
      </button>
      {path && items && (
        <div className="menu-panel mobile-menu">
          {path.length > 0 && (
            <button className="menu-back" onMouseDown={keepFocus} onClick={() => setPath(path.slice(0, -1))}>
              ‹ {path[path.length - 1]}
            </button>
          )}
          <MenuList key={path.join('/')} items={items} onDone={close} onEnter={(item) => setPath([...path, item.label])} />
        </div>
      )}
    </div>
  )
}

/** Pulsante con menu a tendina (usato nella barra di stato, che apre verso l'alto). */
export function MenuButton({
  label,
  title,
  items,
  up = false,
}: {
  label: ReactNode
  title?: string
  items: MenuItem[]
  up?: boolean
}) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const ref = useDismiss(open, close)
  return (
    <div className={`menubar-item${open ? ' open' : ''}${up ? ' up' : ''}`} ref={ref}>
      <button title={title} onMouseDown={keepFocus} onClick={() => setOpen(!open)}>
        {label}
      </button>
      {open && (
        <div className="menu-panel">
          <MenuList items={items} onDone={close} />
        </div>
      )}
    </div>
  )
}

/** Menu contestuale in posizione fissa (tasto destro). Si chiude al clic fuori, con Esc o dopo una scelta. */
export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useDismiss(true, onClose)
  const [pos, setPos] = useState({ left: x, top: y })
  // resta dentro la finestra: se non c'è spazio a destra o in basso si sposta
  useLayoutEffect(() => {
    const { width, height } = ref.current!.getBoundingClientRect()
    setPos({
      left: Math.max(0, Math.min(x, window.innerWidth - width - 4)),
      top: Math.max(0, Math.min(y, window.innerHeight - height - 4)),
    })
  }, [x, y, ref])
  return (
    <div className="menu-panel context-menu" style={pos} ref={ref} onContextMenu={(e) => e.preventDefault()}>
      <MenuList items={items} onDone={onClose} />
    </div>
  )
}
