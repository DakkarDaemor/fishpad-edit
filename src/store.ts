import { del, get, set } from 'idb-keyval'
import type { Indent } from './editor/indentation'

export type Eol = 'LF' | 'CRLF'
export type ThemeMode = 'system' | 'light' | 'dark'

export interface Settings {
  theme: ThemeMode
  fontSize: number
  wrap: boolean
}

export const DEFAULT_SETTINGS: Settings = { theme: 'system', fontSize: 14, wrap: false }

export interface SavedTab {
  id: string
  name: string
  lang: string | null
  langAuto: boolean
  indent?: Indent
  indentAuto?: boolean
  dirty: boolean
  eol: Eol
  content: string
  cursor: number
  folds: Array<[number, number]>
  handle?: FileSystemFileHandle
}

export interface Session {
  tabs: SavedTab[]
  activeId: string | null
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

export const loadSession = () => safe(async () => (await get<Session>(KEY_SESSION)) ?? null, null)
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
