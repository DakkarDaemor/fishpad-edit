/**
 * Scrittura nello spazio dell'app (Origin Private File System) per i browser senza `createWritable`
 * (Safari meno recenti): lì si può scrivere solo da un worker, con `createSyncAccessHandle`.
 */

interface WriteRequest {
  id: number
  path: string[]
  data: Uint8Array<ArrayBuffer>
}
export type WriteReply = { id: number; error?: string }

let worker: Worker | null = null
let nextId = 0
const pending = new Map<number, { resolve: () => void; reject: (err: Error) => void }>()

function getWorker() {
  if (worker) return worker
  worker = new Worker(new URL('./opfsWrite.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent<WriteReply>) => {
    const p = pending.get(e.data.id)
    pending.delete(e.data.id)
    if (e.data.error) p?.reject(new Error(e.data.error))
    else p?.resolve()
  }
  return worker
}

export async function writeWithSyncAccess(handle: FileSystemFileHandle, data: Uint8Array<ArrayBuffer>) {
  const root = await navigator.storage.getDirectory()
  const path = await root.resolve(handle)
  if (!path) throw new Error('Il browser permette di salvare solo nei file dell\'app')
  const id = nextId++
  return new Promise<void>((resolve, reject) => {
    pending.set(id, { resolve, reject })
    getWorker().postMessage({ id, path, data } satisfies WriteRequest, [data.buffer])
  })
}
