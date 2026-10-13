import { decode, type Encoding } from './encoding'
import type { Eol } from './store'

/** File System Access API disponibile (Chromium desktop). Altrove: upload/download. */
export const hasFsAccess = typeof window !== 'undefined' && 'showOpenFilePicker' in window

export interface OpenedFile {
  name: string
  content: string
  eol: Eol
  encoding: Encoding
  handle?: FileSystemFileHandle
  /** `lastModified` del file su disco quando è stato letto (solo con handle) */
  mtime?: number
}

export function detectEol(text: string): Eol {
  const crlf = text.indexOf('\r\n')
  if (crlf === -1) return 'LF'
  const lf = text.indexOf('\n')
  return lf === crlf + 1 ? 'CRLF' : 'LF'
}

async function readFile(file: File, handle?: FileSystemFileHandle, encoding?: Encoding): Promise<OpenedFile> {
  const { text, encoding: found } = decode(new Uint8Array(await file.arrayBuffer()), encoding)
  return { name: file.name, content: text, eol: detectEol(text), encoding: found, handle, mtime: handle ? file.lastModified : undefined }
}

/** Legge il file; senza `encoding` la codifica viene rilevata dal contenuto. */
export function readHandle(handle: FileSystemFileHandle, encoding?: Encoding) {
  return handle.getFile().then((f) => readFile(f, handle, encoding))
}

/** `lastModified` attuale del file su disco, null se non esiste più. */
export async function diskMtime(handle: FileSystemFileHandle): Promise<number | null> {
  try {
    return (await handle.getFile()).lastModified
  } catch (err) {
    if (err instanceof DOMException && err.name === 'NotFoundError') return null
    throw err
  }
}

export async function ensurePermission(handle: FileSystemHandle, mode: 'read' | 'readwrite'): Promise<boolean> {
  if ((await handle.queryPermission({ mode })) === 'granted') return true
  return (await handle.requestPermission({ mode })) === 'granted'
}

function isAbort(err: unknown) {
  return err instanceof DOMException && err.name === 'AbortError'
}

export async function pickFiles(): Promise<OpenedFile[]> {
  if (hasFsAccess) {
    try {
      const handles = await window.showOpenFilePicker({ multiple: true })
      return Promise.all(handles.map((h) => readHandle(h)))
    } catch (err) {
      if (isAbort(err)) return []
      throw err
    }
  }
  // Fallback: <input type="file">
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.onchange = async () => resolve(await Promise.all([...(input.files ?? [])].map((f) => readFile(f))))
    input.oncancel = () => resolve([])
    input.click()
  })
}

export function serialize(content: string, eol: Eol) {
  return eol === 'CRLF' ? content.replace(/\n/g, '\r\n') : content
}

/** Scrive il file e restituisce il suo nuovo `lastModified`. */
export async function writeHandle(handle: FileSystemFileHandle, data: Uint8Array<ArrayBuffer>): Promise<number> {
  if (!(await ensurePermission(handle, 'readwrite'))) throw new Error('Permesso di scrittura negato')
  const w = await handle.createWritable()
  await w.write(data)
  await w.close()
  return (await handle.getFile()).lastModified
}

/** Salva con nome. Restituisce il nuovo handle, `null` se annullato, `undefined` se scaricato (fallback). */
export async function saveAs(suggestedName: string, data: Uint8Array<ArrayBuffer>): Promise<FileSystemFileHandle | null | undefined> {
  if (hasFsAccess) {
    try {
      const handle = await window.showSaveFilePicker({ suggestedName })
      await writeHandle(handle, data)
      return handle
    } catch (err) {
      if (isAbort(err)) return null
      throw err
    }
  }
  const url = URL.createObjectURL(new Blob([data], { type: 'text/plain' }))
  const a = document.createElement('a')
  a.href = url
  a.download = suggestedName
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return undefined
}

/** File trascinati sulla finestra: su Chromium recupera anche l'handle (così Ctrl+S salva sul file). */
export async function filesFromDrop(dt: DataTransfer): Promise<OpenedFile[]> {
  // Gli item del DataTransfer valgono solo durante l'evento: si leggono tutti in modo sincrono prima di qualsiasi await.
  const pending = [...dt.items]
    .filter((i) => i.kind === 'file')
    .map((item) => ({
      handle: item.getAsFileSystemHandle ? item.getAsFileSystemHandle() : Promise.resolve(null),
      file: item.getAsFile(),
    }))
  const out: OpenedFile[] = []
  for (const p of pending) {
    const handle = await p.handle.catch(() => null)
    if (handle?.kind === 'file') out.push(await readHandle(handle as FileSystemFileHandle))
    else if (p.file) out.push(await readFile(p.file))
  }
  return out
}

export const hasFolderAccess = typeof window !== 'undefined' && 'showDirectoryPicker' in window

/** Sceglie una cartella (solo lettura); null se annullato. */
export async function pickFolder(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await window.showDirectoryPicker({ mode: 'read' })
  } catch (err) {
    if (isAbort(err)) return null
    throw err
  }
}

/** Handle del file al percorso indicato nella cartella, null se non esiste. */
export async function fileInFolder(dir: FileSystemDirectoryHandle, path: string[]): Promise<FileSystemFileHandle | null> {
  try {
    let cur = dir
    for (const seg of path.slice(0, -1)) cur = await cur.getDirectoryHandle(seg)
    return await cur.getFileHandle(path[path.length - 1])
  } catch {
    return null
  }
}
