import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'

export interface MenuAction {
  label: string
  shortcut?: string
  checked?: boolean
  disabled?: boolean
  danger?: boolean
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

function MenuList({ items, onDone }: { items: MenuItem[]; onDone: () => void }) {
  return (
    <ul className="menu-list" role="menu">
      {items.map((item, i) => {
        if (item === 'separator') return <li key={i} className="menu-sep" role="separator" />
        if ('heading' in item) return <li key={i} className="menu-heading">{item.heading}</li>
        const hasSub = !!item.submenu
        return (
          <li key={i} className={`menu-entry${hasSub ? ' has-sub' : ''}`} role="none">
            <button
              role="menuitem"
              className={item.danger ? 'danger' : undefined}
              disabled={item.disabled || (hasSub && item.submenu!.length === 0)}
              onMouseDown={keepFocus}
              onClick={() => {
                if (hasSub || !item.action) return
                onDone()
                item.action()
              }}
            >
              <span className="menu-check">{item.checked ? '✓' : ''}</span>
              <span className="menu-label">{item.label}</span>
              <span className="menu-shortcut">{hasSub ? '▸' : item.shortcut}</span>
            </button>
            {hasSub && item.submenu!.length > 0 && (
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

/** Chiude al clic fuori dal contenitore o con Esc. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && close()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('blur', close)
    return () => {
      document.removeEventListener('mousedown', onDown)
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
