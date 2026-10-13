import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { filterItems, type PaletteItem } from './commands'

interface Props {
  items: PaletteItem[]
  placeholder: string
  onClose: () => void
}

/** Palette in alto al centro: si scrive per filtrare, ↑↓ per scegliere, Invio per eseguire, Esc per chiudere. */
export function CommandPalette({ items, placeholder, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)
  const shown = useMemo(() => filterItems(items, query), [items, query])
  const current = Math.min(index, shown.length - 1)

  useEffect(() => {
    listRef.current?.children[current]?.scrollIntoView({ block: 'nearest' })
  }, [current])

  const run = (item: PaletteItem | undefined) => {
    if (!item) return
    onClose()
    item.run()
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') setIndex((current + 1) % Math.max(shown.length, 1))
    else if (e.key === 'ArrowUp') setIndex((current - 1 + shown.length) % Math.max(shown.length, 1))
    else if (e.key === 'Enter') run(shown[current])
    else if (e.key === 'Escape') onClose()
    else return
    e.preventDefault()
  }

  return (
    <div className="palette-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-label={placeholder}>
        <input
          autoFocus
          value={query}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value)
            setIndex(0)
          }}
          onKeyDown={onKeyDown}
          onBlur={onClose}
          aria-controls="palette-list"
        />
        <ul id="palette-list" ref={listRef} role="listbox">
          {shown.map((item, i) => (
            <li
              key={item.id}
              role="option"
              aria-selected={i === current}
              className={i === current ? 'current' : undefined}
              // mousedown: prima che il blur dell'input chiuda la palette
              onMouseDown={(e) => {
                e.preventDefault()
                run(item)
              }}
              onMouseMove={() => i !== current && setIndex(i)}
            >
              <span className="palette-label">{item.label}</span>
              {item.detail && <span className="palette-detail">{item.detail}</span>}
              {item.shortcut && <kbd>{item.shortcut}</kbd>}
            </li>
          ))}
          {!shown.length && <li className="palette-empty">Nessun risultato</li>}
        </ul>
      </div>
    </div>
  )
}
