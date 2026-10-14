import { Fragment, useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { ensurePermission, exportFile, permissionState, pickUploads } from '../fs'
import { createFile, createFolder, deleteEntry, listDir, parentPath, type TreeEntry } from '../explorer'
import { importFiles } from '../workspace'
import { ContextMenu, type MenuItem } from './Menu'
import { longPress } from './touch'

interface Props {
  root: FileSystemDirectoryHandle
  /** spazio dell'app al posto di una cartella del disco: nome da mostrare, e si importa e si esporta */
  workspace?: { label: string }
  /** cambia quando l'app ha scritto nella cartella (salvataggio, import): l'albero si rilegge */
  version?: number
  /** percorso del file della tab attiva, se sta nella cartella: viene evidenziato */
  activePath: string | null
  onOpen: (handle: FileSystemFileHandle) => void
  onBookmark: (handle: FileSystemFileHandle) => void
  /** rinomina la voce aggiornando le tab aperte che ne dipendono */
  onRename: (parent: FileSystemDirectoryHandle, entry: TreeEntry, newName: string) => Promise<void>
  onCloseFolder?: () => void
  onMessage: (msg: string) => void
}

/** Contenuto di una cartella: le voci, o il messaggio d'errore se non si è potuta leggere. */
type Listing = TreeEntry[] | string

const errorText = (err: unknown) => (err as Error).message || String(err)

/**
 * Esplora file: albero della cartella aperta, letto un livello alla volta quando si apre una cartella
 * (così anche node_modules non costa nulla finché resta chiusa). Si aggiorna tornando all'app.
 */
export function FileTree({ root, workspace, version, activePath, onOpen, onBookmark, onRename, onCloseFolder, onMessage }: Props) {
  const [granted, setGranted] = useState<boolean | null>(null)
  const [listings, setListings] = useState<ReadonlyMap<string, Listing>>(new Map())
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const [menu, setMenu] = useState<{ x: number; y: number; entry: TreeEntry | null } | null>(null)
  const closeMenu = useCallback(() => setMenu(null), [])
  /** handle di ogni cartella già vista, per percorso ('' = la cartella aperta) */
  const dirs = useRef(new Map<string, FileSystemDirectoryHandle>([['', root]]))
  const expandedRef = useRef(expanded)
  useEffect(() => {
    expandedRef.current = expanded
  }, [expanded])

  const load = useCallback(async (path: string) => {
    const dir = dirs.current.get(path)
    if (!dir) return
    let listing: Listing
    try {
      listing = await listDir(dir, path)
      for (const e of listing) if (e.handle.kind === 'directory') dirs.current.set(e.path, e.handle)
    } catch (err) {
      if (path && err instanceof DOMException && err.name === 'NotFoundError') {
        // la cartella non c'è più (eliminata o rinominata da fuori)
        setExpanded((s) => new Set([...s].filter((p) => p !== path && !p.startsWith(`${path}/`))))
        return
      }
      listing = errorText(err)
    }
    setListings((m) => new Map(m).set(path, listing))
  }, [])

  const refresh = useCallback(() => {
    for (const path of ['', ...expandedRef.current]) void load(path)
  }, [load])

  useEffect(() => {
    let cancelled = false
    void permissionState(root, 'readwrite').then((state) => !cancelled && setGranted(state === 'granted'))
    return () => {
      cancelled = true
    }
  }, [root])

  useEffect(() => {
    if (!granted) return
    refresh()
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [granted, refresh, version])

  async function reconnect() {
    setGranted(await ensurePermission(root, 'readwrite').catch(() => false))
  }

  function toggle(path: string) {
    const open = expanded.has(path)
    setExpanded((s) => {
      const next = new Set(s)
      if (open) next.delete(path)
      else next.add(path)
      return next
    })
    if (!open) void load(path)
  }

  /** Permesso di scrittura sulla cartella, chiesto prima di creare, rinominare o eliminare. */
  async function writable() {
    if (await ensurePermission(root, 'readwrite').catch(() => false)) return true
    onMessage('Permesso di scrittura sulla cartella negato')
    return false
  }

  async function create(dirPath: string, kind: 'file' | 'directory') {
    if (!(await writable())) return
    const name = prompt(kind === 'file' ? 'Nome del nuovo file:' : 'Nome della nuova cartella:')?.trim()
    const dir = dirs.current.get(dirPath)
    if (!name || !dir) return
    try {
      const handle = kind === 'file' ? await createFile(dir, name) : await createFolder(dir, name)
      if (dirPath) setExpanded((s) => new Set(s).add(dirPath))
      await load(dirPath)
      if (handle.kind === 'file') onOpen(handle)
    } catch (err) {
      onMessage(`Impossibile creare "${name}": ${errorText(err)}`)
    }
  }

  async function rename(entry: TreeEntry) {
    if (!(await writable())) return
    const name = prompt('Nuovo nome:', entry.name)?.trim()
    const parent = dirs.current.get(parentPath(entry.path))
    if (!name || name === entry.name || !parent) return
    try {
      await onRename(parent, entry, name)
      // una cartella rinominata si richiude: i percorsi sotto di lei sono cambiati
      setExpanded((s) => new Set([...s].filter((p) => p !== entry.path && !p.startsWith(`${entry.path}/`))))
      await load(parentPath(entry.path))
    } catch (err) {
      onMessage(`Impossibile rinominare "${entry.name}": ${errorText(err)}`)
    }
  }

  async function remove(entry: TreeEntry) {
    if (!(await writable())) return
    const what = entry.handle.kind === 'directory' ? `la cartella "${entry.name}" e tutto il suo contenuto` : `"${entry.name}"`
    if (!confirm(`Eliminare ${what}?\n\nNon va nel Cestino: l'operazione non si può annullare.`)) return
    const parent = dirs.current.get(parentPath(entry.path))
    if (!parent) return
    try {
      await deleteEntry(parent, entry.name)
      await load(parentPath(entry.path))
    } catch (err) {
      onMessage(`Impossibile eliminare "${entry.name}": ${errorText(err)}`)
    }
  }

  /** Copia nella cartella dei file scelti dal dispositivo. */
  async function importHere(dirPath: string) {
    const dir = dirs.current.get(dirPath)
    const files = await pickUploads()
    if (!dir || !files.length) return
    const done = await importFiles(dir, files, (f, err) => onMessage(`Impossibile importare "${f.name}": ${errorText(err)}`))
    if (dirPath) setExpanded((s) => new Set(s).add(dirPath))
    await load(dirPath)
    if (done.length) onMessage(done.length === 1 ? `Importato: ${done[0].name}` : `Importati ${done.length} file`)
  }

  async function exportEntry(handle: FileSystemFileHandle) {
    try {
      const file = await handle.getFile()
      await exportFile(file.name, new Uint8Array(await file.arrayBuffer()))
    } catch (err) {
      onMessage(`Impossibile esportare "${handle.name}": ${errorText(err)}`)
    }
  }

  async function copyPath(path: string) {
    try {
      await navigator.clipboard.writeText(path)
      onMessage(`Copiato: ${path}`)
    } catch {
      onMessage('Appunti non disponibili')
    }
  }

  const openMenu = (e: ReactMouseEvent, entry: TreeEntry | null) => {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY, entry })
  }

  const menuItems = (entry: TreeEntry | null): MenuItem[] => {
    const newItems = (dirPath: string): MenuItem[] => [
      { label: 'Nuovo file…', action: () => void create(dirPath, 'file') },
      { label: 'Nuova cartella…', action: () => void create(dirPath, 'directory') },
      ...(workspace ? [{ label: 'Importa file qui…', action: () => void importHere(dirPath) }] : []),
    ]
    if (!entry) return [...newItems(''), 'separator', { label: 'Aggiorna', action: refresh }]
    const handle = entry.handle
    const common: MenuItem[] = [
      { label: 'Copia percorso relativo', action: () => void copyPath(entry.path) },
      'separator',
      { label: 'Rinomina…', action: () => void rename(entry) },
      { label: 'Elimina…', danger: true, action: () => void remove(entry) },
    ]
    if (handle.kind === 'directory') return [...newItems(entry.path), 'separator', ...common]
    return [
      { label: 'Apri', action: () => onOpen(handle) },
      { label: 'Aggiungi ai preferiti', action: () => onBookmark(handle) },
      ...(workspace ? [{ label: 'Esporta / condividi…', action: () => void exportEntry(handle) }] : []),
      'separator',
      ...common,
    ]
  }

  const indent = (depth: number) => ({ paddingLeft: 6 + depth * 12 })

  const renderLevel = (path: string, depth: number): ReactNode => {
    const listing = listings.get(path)
    if (listing === undefined) return <div className="tree-note" style={indent(depth + 1)}>Caricamento…</div>
    if (typeof listing === 'string') return <div className="tree-note error" style={indent(depth + 1)}>{listing}</div>
    if (!listing.length) return <div className="tree-note" style={indent(depth + 1)}>{depth ? 'Vuota' : 'Cartella vuota'}</div>
    return listing.map((entry) => {
      const isDir = entry.handle.kind === 'directory'
      const open = isDir && expanded.has(entry.path)
      return (
        <Fragment key={entry.path}>
          <button
            className={`tree-row${entry.path === activePath ? ' current' : ''}`}
            style={indent(depth)}
            role="treeitem"
            aria-expanded={isDir ? open : undefined}
            title={entry.path}
            onClick={() => (isDir ? toggle(entry.path) : onOpen(entry.handle as FileSystemFileHandle))}
            onContextMenu={(e) => openMenu(e, entry)}
            {...longPress((x, y) => setMenu({ x, y, entry }))}
          >
            <span className="tree-twisty">{isDir ? (open ? '▾' : '▸') : ''}</span>
            <span className="tree-name">{entry.name}</span>
          </button>
          {open && renderLevel(entry.path, depth + 1)}
        </Fragment>
      )
    })
  }

  const title = workspace?.label ?? root.name
  return (
    <section className="side-section tree-section">
      <header className="side-header" title={title}>
        <span className="panel-title">{title}</span>
        <div className="spacer" />
        {granted && (
          <>
            {workspace && (
              <button onClick={() => void importHere('')} title="Importa file dal dispositivo" aria-label="Importa file">⇩</button>
            )}
            <button onClick={() => void create('', 'file')} title="Nuovo file nella cartella" aria-label="Nuovo file">+</button>
            <button onClick={refresh} title="Aggiorna" aria-label="Aggiorna">↻</button>
          </>
        )}
        {onCloseFolder && (
          <button onClick={onCloseFolder} title="Chiudi la cartella" aria-label="Chiudi la cartella">×</button>
        )}
      </header>
      <div className="tree" role="tree" onContextMenu={(e) => granted && openMenu(e, null)} {...longPress((x, y) => granted && setMenu({ x, y, entry: null }))}>
        {granted === false ? (
          <div className="side-empty">
            <p>Dopo un riavvio il browser chiede di nuovo il permesso di accedere alla cartella.</p>
            <button className="primary" onClick={() => void reconnect()}>Riconnetti «{root.name}»</button>
          </div>
        ) : granted ? (
          renderLevel('', 0)
        ) : null}
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.entry)} onClose={closeMenu} />}
    </section>
  )
}

/** Sezione Esplora senza cartella aperta. */
export function NoFolder({ supported, onOpenFolder }: { supported: boolean; onOpenFolder: () => void }) {
  return (
    <section className="side-section tree-section">
      <header className="side-header">
        <span className="panel-title">Esplora</span>
      </header>
      <div className="side-empty">
        {supported ? (
          <>
            <p>Nessuna cartella aperta. I suoi file si aprono con un clic, e l'anteprima HTML carica da lì CSS, script e immagini.</p>
            <button className="primary" onClick={onOpenFolder}>Apri cartella…</button>
          </>
        ) : (
          <p>L'esplora file richiede Chrome o Edge.</p>
        )}
      </div>
    </section>
  )
}
