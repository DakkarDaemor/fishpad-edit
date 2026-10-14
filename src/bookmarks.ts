import { useEffect, useRef, useState } from 'react'
import { loadBookmarks, saveBookmarks, type Bookmark } from './store'
import type { Doc } from './workbench/Workbench'

/** Sposta l'elemento di `delta` posizioni, restando dentro la lista. */
export function moveItem<T extends { id: string }>(list: T[], id: string, delta: number): T[] {
  const from = list.findIndex((b) => b.id === id)
  if (from < 0) return list
  const to = Math.min(list.length - 1, Math.max(0, from + delta))
  if (to === from) return list
  const next = [...list]
  next.splice(to, 0, ...next.splice(from, 1))
  return next
}

/** Preferito già in lista che apre la stessa cosa (stesso URL o stesso file su disco), se c'è. */
export async function findDuplicate(list: Bookmark[], b: Bookmark): Promise<Bookmark | undefined> {
  for (const other of list) {
    if (other.kind === 'url' && b.kind === 'url' && other.request.url === b.request.url) return other
    if (other.kind === 'file' && b.kind === 'file' && (await other.handle.isSameEntry(b.handle).catch(() => false))) return other
  }
  return undefined
}

/** Preferito per il documento: il suo URL o il suo file. null se è una tab mai salvata. */
export function bookmarkFor(doc: Doc): Bookmark | null {
  const id = crypto.randomUUID()
  if (doc.request) return { id, name: doc.name, kind: 'url', request: doc.request }
  if (doc.handle) return { id, name: doc.name, kind: 'file', handle: doc.handle }
  return null
}

/** Lista dei preferiti, salvata in IndexedDB a ogni modifica. */
export function useBookmarks() {
  const [list, setList] = useState<Bookmark[]>([])
  const loaded = useRef(false)

  useEffect(() => {
    void loadBookmarks().then((saved) => {
      loaded.current = true
      setList(saved)
    })
  }, [])

  useEffect(() => {
    if (loaded.current) void saveBookmarks(list)
  }, [list])

  return {
    list,
    add: (b: Bookmark) => setList((l) => [...l, b]),
    update: (id: string, patch: Partial<Bookmark>) =>
      setList((l) => l.map((b) => (b.id === id ? ({ ...b, ...patch } as Bookmark) : b))),
    remove: (id: string) => setList((l) => l.filter((b) => b.id !== id)),
    move: (id: string, delta: number) => setList((l) => moveItem(l, id, delta)),
  }
}
