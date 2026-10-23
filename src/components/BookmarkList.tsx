import { useCallback, useState } from 'react'
import { matches } from '../bookmarks'
import type { Bookmark } from '../store'
import { ContextMenu } from './Menu'
import { longPress } from './touch'

interface Props {
  list: Bookmark[]
  /** la tab attiva si può aggiungere (è un file su disco o un URL) */
  canAdd: boolean
  onAdd: () => void
  onOpenUrl: () => void
  onOpen: (b: Bookmark) => void
  onEdit: (b: Bookmark) => void
  onRemove: (id: string) => void
  onMove: (id: string, delta: number) => void
}

function detail(b: Bookmark) {
  if (b.kind === 'file') return b.handle.name === b.name ? '' : b.handle.name
  try {
    const { host } = new URL(b.request.url)
    // i nomi automatici contengono già l'host
    return b.name.includes(host) ? '' : host
  } catch {
    return b.request.url
  }
}

/** Sezione Preferiti della barra laterale: URL e file da riaprire con un clic. */
export function BookmarkList({ list, canAdd, onAdd, onOpenUrl, onOpen, onEdit, onRemove, onMove }: Props) {
  const [menu, setMenu] = useState<{ x: number; y: number; bookmark: Bookmark } | null>(null)
  const closeMenu = useCallback(() => setMenu(null), [])
  const [collapsed, setCollapsed] = useState(false)
  const [query, setQuery] = useState('')
  const shown = list.filter((b) => matches(b, query))

  return (
    <section className={`side-section bookmarks-section${collapsed ? ' collapsed' : ''}`}>
      <header className="side-header">
        <button className="tree-toggle" onClick={() => setCollapsed((c) => !c)} aria-expanded={!collapsed} title={collapsed ? 'Mostra i preferiti' : 'Nascondi i preferiti'}>
          <span className="tree-twisty">{collapsed ? '▸' : '▾'}</span>
          <span className="panel-title">Preferiti</span>
        </button>
        <div className="spacer" />
        <button onClick={onOpenUrl} title="Apri un URL…" aria-label="Apri un URL">URL</button>
        <button onClick={onAdd} disabled={!canAdd} title="Aggiungi la tab attiva ai preferiti" aria-label="Aggiungi la tab attiva">☆</button>
      </header>
      {!collapsed && list.length > 0 && (
        <input
          className="side-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setQuery('')
            if (e.key === 'Enter' && shown.length === 1) onOpen(shown[0])
          }}
          placeholder="Cerca nei preferiti"
          aria-label="Cerca nei preferiti"
        />
      )}
      <div className="side-list" hidden={collapsed}>
        {shown.map((b) => {
          const sub = detail(b)
          return (
            <button
              key={b.id}
              className="tree-row bookmark"
              title={b.kind === 'url' ? `GET ${b.request.url}` : b.handle.name}
              onClick={() => onOpen(b)}
              onContextMenu={(e) => {
                e.preventDefault()
                setMenu({ x: e.clientX, y: e.clientY, bookmark: b })
              }}
              {...longPress((x, y) => setMenu({ x, y, bookmark: b }))}
            >
              <span className={`bookmark-kind ${b.kind}`}>{b.kind === 'url' ? 'GET' : 'file'}</span>
              <span className="tree-name">{b.name}</span>
              {sub && <span className="bookmark-detail">{sub}</span>}
            </button>
          )
        })}
        {list.length > 0 && !shown.length && <p className="side-empty">Nessun preferito contiene «{query.trim()}».</p>}
        {!list.length && (
          <p className="side-empty">
            Nessun preferito. ☆ aggiunge la tab attiva (un file o un URL); URL apre un indirizzo, per esempio un'API che restituisce JSON.
          </p>
        )}
      </div>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={closeMenu}
          items={[
            { label: 'Apri', action: () => onOpen(menu.bookmark) },
            { label: menu.bookmark.kind === 'url' ? 'Modifica…' : 'Rinomina…', action: () => onEdit(menu.bookmark) },
            'separator',
            { label: 'Sposta su', disabled: list[0]?.id === menu.bookmark.id, action: () => onMove(menu.bookmark.id, -1) },
            { label: 'Sposta giù', disabled: list.at(-1)?.id === menu.bookmark.id, action: () => onMove(menu.bookmark.id, 1) },
            'separator',
            { label: 'Rimuovi dai preferiti', danger: true, action: () => onRemove(menu.bookmark.id) },
          ]}
        />
      )}
    </section>
  )
}
