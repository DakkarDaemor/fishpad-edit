import type { WriteReply } from './opfsWrite'

// Nei tipi DOM manca: esiste solo nei worker
interface SyncAccessHandle {
  truncate(size: number): void
  write(data: Uint8Array, options: { at: number }): number
  flush(): void
  close(): void
}

type WriteMessage = MessageEvent<{ id: number; path: string[]; data: Uint8Array }>
// il progetto usa i tipi DOM, dove `self` è la finestra
const scope = self as unknown as { onmessage: (e: WriteMessage) => void; postMessage(reply: WriteReply): void }

/** Scrive il file al percorso indicato dentro lo spazio dell'app, sostituendone il contenuto. */
scope.onmessage = async (e) => {
  const { id, path, data } = e.data
  let reply: WriteReply = { id }
  try {
    let dir = await navigator.storage.getDirectory()
    for (const seg of path.slice(0, -1)) dir = await dir.getDirectoryHandle(seg)
    const file = await dir.getFileHandle(path[path.length - 1], { create: true })
    const access = await (file as unknown as { createSyncAccessHandle(): Promise<SyncAccessHandle> }).createSyncAccessHandle()
    try {
      access.truncate(0)
      access.write(data, { at: 0 })
      access.flush()
    } finally {
      access.close()
    }
  } catch (err) {
    reply = { id, error: (err as Error).message || String(err) }
  }
  scope.postMessage(reply)
}
