import { del, get, set } from 'idb-keyval'
import type { Encoding } from './encoding'
import type { Indent } from './editor/indentation'
import type { Layout } from './workbench/layout'
import type { TabColor } from './workbench/tabColors'
import type { UrlRequest, UrlResponse } from './remote'
import { packHandle, unpackHandle, type StoredHandle } from './workspace'
import { DEFAULT_PROVIDERS, mergeProviders, type AiProvider } from './ai/providers'

export type Eol = 'LF' | 'CRLF'
export type ThemeMode = 'system' | 'light' | 'dark'

export interface Settings {
  theme: ThemeMode
  fontSize: number
  wrap: boolean
  /** barra laterale con preferiti ed esplora file */
  sidebar: boolean
  /** ultime scelte fatte nel confronto */
  diff: DiffPrefs
  ai: AiSettings
}

export interface AiSettings {
  /** chiavi in chiaro in IndexedDB, come gli header dei preferiti URL */
  providers: AiProvider[]
  /** ultimo modello scelto nella chat */
  model?: { providerId: string; model: string }
}

export interface DiffPrefs {
  /** assente finché non si sceglie: unificato sul telefono, affiancato altrove */
  unified?: boolean
  /** righe uguali piegate */
  collapse: boolean
  /** testi passati da Prettier prima del confronto */
  normalize: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  fontSize: 14,
  wrap: false,
  sidebar: false,
  diff: { collapse: true, normalize: false },
  ai: { providers: DEFAULT_PROVIDERS },
}

export interface SavedDoc {
  id: string
  name: string
  lang: string | null
  langAuto: boolean
  indent?: Indent
  indentAuto?: boolean
  dirty: boolean
  eol: Eol
  /** assente nelle sessioni salvate prima della 5.0: UTF-8 */
  encoding?: Encoding
  content: string
  handle?: FileSystemFileHandle
  mtime?: number
  color?: TabColor
  /** tab collegata a un URL: la richiesta per ricaricarla e l'esito dell'ultima */
  request?: UrlRequest
  response?: UrlResponse
}

/** Un documento aperto in un pannello: cursore e blocchi chiusi sono per pannello. */
export interface SavedPaneTab {
  docId: string
  cursor: number
  folds: Array<[number, number]>
}

export interface SavedPane {
  id: string
  tabs: SavedPaneTab[]
  activeDocId: string | null
}

export interface Session {
  version: 2
  docs: SavedDoc[]
  panes: SavedPane[]
  layout: Layout
  activePaneId: string
}

/** Formato v1: un solo editor, tab con cursore e folding inclusi. */
interface SessionV1 {
  tabs: Array<SavedDoc & { cursor: number; folds: Array<[number, number]> }>
  activeId: string | null
}

export function migrate(raw: Session | SessionV1 | undefined): Session | null {
  if (!raw) return null
  if ('version' in raw && raw.version === 2) return raw
  const v1 = raw as SessionV1
  if (!Array.isArray(v1.tabs)) return null
  const paneId = 'p1'
  return {
    version: 2,
    docs: v1.tabs.map(({ cursor: _c, folds: _f, ...doc }) => doc),
    panes: [{ id: paneId, tabs: v1.tabs.map((t) => ({ docId: t.id, cursor: t.cursor, folds: t.folds })), activeDocId: v1.activeId }],
    layout: { kind: 'pane', paneId },
    activePaneId: paneId,
  }
}

export interface RecentFile {
  name: string
  handle: FileSystemFileHandle
  openedAt: number
}

const KEY_SESSION = 'session'
const KEY_SETTINGS = 'settings'
const KEY_RECENTS = 'recents'
// chiave storica: prima della 6.0 era la cartella dell'anteprima, ora è quella dell'esplora file
const KEY_FOLDER = 'previewFolder'
const KEY_BOOKMARKS = 'bookmarks'
const KEY_SEEN_NOTICES = 'seenNotices'
const MAX_RECENTS = 12

// IndexedDB può non essere disponibile (navigazione privata, storage bloccato): non deve rompere l'app.
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    console.warn('[store]', err)
    return fallback
  }
}

/** Elemento con l'handle convertito per IndexedDB (vedi `packHandle`). */
type Packed<T extends { handle?: FileSystemFileHandle }> = Omit<T, 'handle'> & StoredHandle

async function pack<T extends { handle?: FileSystemFileHandle }>({ handle, ...rest }: T): Promise<Packed<T>> {
  return { ...rest, ...(await packHandle(handle)) }
}

async function unpack<T extends { handle?: FileSystemFileHandle }>({ handle, workspacePath, ...rest }: Packed<T>) {
  return { ...rest, handle: await unpackHandle({ handle, workspacePath }) } as T
}

export const loadSession = () =>
  safe(async () => {
    const session = migrate(await get<Session | SessionV1>(KEY_SESSION))
    // un file dello spazio dell'app eliminato nel frattempo lascia la tab col suo testo, non più collegata
    return session && { ...session, docs: await Promise.all((session.docs as Array<Packed<SavedDoc>>).map((d) => unpack<SavedDoc>(d))) }
  }, null)
export const saveSession = (s: Session) => safe(async () => set(KEY_SESSION, { ...s, docs: await Promise.all(s.docs.map(pack)) }), undefined)

export const loadSettings = () =>
  safe(async () => {
    const saved = (await get<Partial<Settings>>(KEY_SETTINGS)) ?? {}
    return { ...DEFAULT_SETTINGS, ...saved, ai: { ...saved.ai, providers: mergeProviders(saved.ai?.providers) } }
  }, DEFAULT_SETTINGS)
export const saveSettings = (s: Settings) => safe(() => set(KEY_SETTINGS, s), undefined)

export const loadRecents = () => safe(async () => (await get<RecentFile[]>(KEY_RECENTS)) ?? [], [] as RecentFile[])

export async function addRecent(handle: FileSystemFileHandle): Promise<RecentFile[]> {
  const list = await loadRecents()
  const kept: RecentFile[] = []
  for (const r of list) {
    if (!(await safe(() => r.handle.isSameEntry(handle), false))) kept.push(r)
  }
  const next = [{ name: handle.name, handle, openedAt: Date.now() }, ...kept].slice(0, MAX_RECENTS)
  await safe(() => set(KEY_RECENTS, next), undefined)
  return next
}

/** Cartella aperta nell'esplora file; l'anteprima HTML carica da lì i file locali (CSS, script, immagini). */
export const loadFolder = () => safe(async () => (await get<FileSystemDirectoryHandle>(KEY_FOLDER)) ?? null, null)
export const saveFolder = (dir: FileSystemDirectoryHandle | null) =>
  safe(() => (dir ? set(KEY_FOLDER, dir) : del(KEY_FOLDER)), undefined)

export async function clearRecents(): Promise<RecentFile[]> {
  await safe(() => del(KEY_RECENTS), undefined)
  return []
}

/** Preferito: un URL (con i suoi header) o un file su disco, da riaprire in una tab. */
export type Bookmark = { id: string; name: string } & (
  | { kind: 'url'; request: UrlRequest }
  | { kind: 'file'; handle: FileSystemFileHandle }
)

type FileBookmark = Extract<Bookmark, { kind: 'file' }>

export const loadBookmarks = () =>
  safe(async () => {
    const saved = (await get<Array<Bookmark | Packed<FileBookmark>>>(KEY_BOOKMARKS)) ?? []
    const list = await Promise.all(saved.map((b) => (b.kind === 'file' ? unpack<FileBookmark>(b as Packed<FileBookmark>) : b)))
    // i file dello spazio dell'app che non esistono più
    return list.filter((b) => b.kind === 'url' || b.handle)
  }, [] as Bookmark[])
export const saveBookmarks = (list: Bookmark[]) =>
  safe(async () => set(KEY_BOOKMARKS, await Promise.all(list.map((b) => (b.kind === 'file' ? pack(b) : b)))), undefined)

/** Avvisi sui limiti del dispositivo già mostrati (vedi notices.ts). */
export const loadSeenNotices = () => safe(async () => (await get<string[]>(KEY_SEEN_NOTICES)) ?? [], [] as string[])
export const saveSeenNotices = (ids: string[]) => safe(() => set(KEY_SEEN_NOTICES, ids), undefined)
