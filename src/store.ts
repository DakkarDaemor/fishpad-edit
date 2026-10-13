import { del, get, set } from 'idb-keyval'
import type { Indent } from './editor/indentation'
import type { Layout } from './workbench/layout'
import type { TabColor } from './workbench/tabColors'

export type Eol = 'LF' | 'CRLF'
export type ThemeMode = 'system' | 'light' | 'dark'

export interface Settings {
  theme: ThemeMode
  fontSize: number
  wrap: boolean
}

export const DEFAULT_SETTINGS: Settings = { theme: 'system', fontSize: 14, wrap: false }

export interface SavedDoc {
  id: string
  name: string
  lang: string | null
  langAuto: boolean
  indent?: Indent
  indentAuto?: boolean
  dirty: boolean
  eol: Eol
  content: string
  handle?: FileSystemFileHandle
  color?: TabColor
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

function migrate(raw: Session | SessionV1 | undefined): Session | null {
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

export const loadSession = () => safe(async () => migrate(await get<Session | SessionV1>(KEY_SESSION)), null)
export const saveSession = (s: Session) => safe(() => set(KEY_SESSION, s), undefined)

export const loadSettings = () =>
  safe(async () => ({ ...DEFAULT_SETTINGS, ...((await get<Partial<Settings>>(KEY_SETTINGS)) ?? {}) }), DEFAULT_SETTINGS)
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

export async function clearRecents(): Promise<RecentFile[]> {
  await safe(() => del(KEY_RECENTS), undefined)
  return []
}
