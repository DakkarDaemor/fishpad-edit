/**
 * Spazio dell'app: dove il browser non dà accesso alle cartelle del disco (telefoni e tablet, Safari, Firefox)
 * l'esplora file mostra una cartella privata dell'app (Origin Private File System). Lì i file si creano,
 * si modificano e si salvano davvero; si portano dentro con Importa e fuori con Esporta.
 */
import { fileInFolder, hasFolderAccess, writeBytes } from './fs'
import { invalidName } from './explorer'

export const hasWorkspace =
  !hasFolderAccess && typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function'

export const WORKSPACE_LABEL = "File dell'app"

let root: Promise<FileSystemDirectoryHandle | null> | undefined

/** Radice dello spazio dell'app; null se il browser non lo offre (per esempio in navigazione privata). */
export function workspaceRoot() {
  root ??= hasWorkspace ? navigator.storage.getDirectory().catch(() => null) : Promise.resolve(null)
  return root
}

/**
 * Percorso scritto dall'utente ("note/oggi.md") diviso in segmenti validi.
 * Le barre iniziali, finali o doppie si ignorano; un segmento non valido genera un errore col motivo.
 */
export function parseWorkspacePath(input: string): string[] {
  const segs = input.split('/').map((s) => s.trim()).filter(Boolean)
  if (!segs.length) throw new Error('Il nome è vuoto')
  for (const seg of segs) {
    const invalid = invalidName(seg)
    if (invalid) throw new Error(`${invalid}: "${seg}"`)
  }
  return segs
}

async function fileExists(dir: FileSystemDirectoryHandle, name: string) {
  try {
    await dir.getFileHandle(name)
    return true
  } catch {
    return false
  }
}

/**
 * Scrive il file al percorso (creando le cartelle che mancano) e ne restituisce l'handle.
 * Se il file esiste già decide `overwrite`; null se l'utente non vuole sovrascriverlo.
 */
export async function writeInWorkspace(
  dir: FileSystemDirectoryHandle,
  path: string[],
  data: Uint8Array<ArrayBuffer> | Blob,
  overwrite: (name: string) => boolean,
): Promise<FileSystemFileHandle | null> {
  for (const seg of path.slice(0, -1)) dir = await dir.getDirectoryHandle(seg, { create: true })
  const name = path[path.length - 1]
  if ((await fileExists(dir, name)) && !overwrite(name)) return null
  const handle = await dir.getFileHandle(name, { create: true })
  await writeBytes(handle, data)
  // senza questa richiesta Safari può cancellare i dati dei siti non usati da qualche settimana
  void navigator.storage.persist?.().catch(() => false)
  return handle
}

/** Copia nella cartella i file scelti dal dispositivo; restituisce gli handle di quelli scritti. */
export async function importFiles(
  dir: FileSystemDirectoryHandle,
  files: File[],
  onError: (file: File, err: Error) => void,
): Promise<FileSystemFileHandle[]> {
  const out: FileSystemFileHandle[] = []
  for (const f of files) {
    try {
      const handle = await writeInWorkspace(dir, [f.name], f, (name) => confirm(`"${name}" esiste già qui. Sostituirlo?`))
      if (handle) out.push(handle)
    } catch (err) {
      onError(f, err as Error)
    }
  }
  return out
}

let cloneable: Promise<boolean> | undefined

/** Gli handle si possono salvare in IndexedDB? In Chromium sì; altri browser non sanno serializzarli. */
function handlesCloneable() {
  cloneable ??= workspaceRoot().then((r) => {
    if (!r) return true
    try {
      structuredClone(r)
      return true
    } catch {
      return false
    }
  })
  return cloneable
}

/** Riferimento a un file salvabile in IndexedDB: l'handle, o il suo percorso nello spazio dell'app. */
export interface StoredHandle {
  handle?: FileSystemFileHandle
  workspacePath?: string[]
}

export async function packHandle(handle: FileSystemFileHandle | undefined): Promise<StoredHandle> {
  if (!handle || (await handlesCloneable())) return { handle }
  const r = await workspaceRoot()
  const path = r && (await r.resolve(handle).catch(() => null))
  return path ? { workspacePath: path } : {}
}

/** L'handle salvato con `packHandle`; undefined se il file non c'è più. */
export async function unpackHandle(stored: StoredHandle): Promise<FileSystemFileHandle | undefined> {
  if (stored.handle) return stored.handle
  if (!stored.workspacePath) return undefined
  const r = await workspaceRoot()
  return (r && (await fileInFolder(r, stored.workspacePath))) ?? undefined
}
