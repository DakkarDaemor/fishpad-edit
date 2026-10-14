import { decode, type Encoding } from './encoding'
import { writeWithSyncAccess } from './opfsWrite'
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

/** Legge un File (upload, file condiviso…); con `handle` resta collegato al file su disco. */
export async function readFile(file: File, handle?: FileSystemFileHandle, encoding?: Encoding): Promise<OpenedFile> {
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

/**
 * Stato del permesso sull'handle. I permessi esistono solo in Chromium: altrove (Safari, Firefox)
 * gli handle sono quelli dello spazio dell'app, sempre accessibili.
 */
export async function permissionState(handle: FileSystemHandle, mode: 'read' | 'readwrite'): Promise<PermissionState> {
  if (!('queryPermission' in handle)) return 'granted'
  return handle.queryPermission({ mode }).catch(() => 'denied' as const)
}

export async function ensurePermission(handle: FileSystemHandle, mode: 'read' | 'readwrite'): Promise<boolean> {
  if ((await permissionState(handle, mode)) === 'granted') return true
  return (await handle.requestPermission({ mode })) === 'granted'
}

function isAbort(err: unknown) {
  return err instanceof DOMException && err.name === 'AbortError'
}

/** Sceglie dei file con `<input type="file">`: il contenuto senza collegamento al file originale. */
export function pickUploads(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.onchange = () => resolve([...(input.files ?? [])])
    input.oncancel = () => resolve([])
    input.click()
  })
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
  return Promise.all((await pickUploads()).map((f) => readFile(f)))
}

export function serialize(content: string, eol: Eol) {
  return eol === 'CRLF' ? content.replace(/\n/g, '\r\n') : content
}

/** Sostituisce il contenuto del file. Dove manca `createWritable` (Safari meno recenti) scrive da un worker. */
export async function writeBytes(handle: FileSystemFileHandle, data: Uint8Array<ArrayBuffer> | Blob) {
  if (!('createWritable' in handle)) return writeWithSyncAccess(handle, data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : data)
  const w = await handle.createWritable()
  await w.write(data)
  await w.close()
}

/** Scrive il file e restituisce il suo nuovo `lastModified`. */
export async function writeHandle(handle: FileSystemFileHandle, data: Uint8Array<ArrayBuffer>): Promise<number> {
  if (!(await ensurePermission(handle, 'readwrite'))) throw new Error('Permesso di scrittura negato')
  await writeBytes(handle, data)
  return (await handle.getFile()).lastModified
}

function downloadFile(name: string, data: Uint8Array<ArrayBuffer>) {
  const url = URL.createObjectURL(new Blob([data], { type: 'text/plain' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const touchDevice = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

/**
 * Porta una copia del file fuori dall'app: sui dispositivi touch col foglio Condividi del sistema
 * (salva in File / Drive, invia a un'altra app), altrove con un download. false se annullato.
 */
export async function exportFile(name: string, data: Uint8Array<ArrayBuffer>): Promise<boolean> {
  const file = new File([data], name, { type: 'text/plain' })
  if (touchDevice && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return true
    } catch (err) {
      if (isAbort(err)) return false
      // condivisione non permessa (per esempio senza un gesto recente): si ripiega sul download
    }
  }
  downloadFile(name, data)
  return true
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
  downloadFile(suggestedName, data)
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

/** Sceglie una cartella, con il permesso di modificarla (esplora file); null se annullato. */
export async function pickFolder(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await window.showDirectoryPicker({ mode: 'readwrite' })
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
