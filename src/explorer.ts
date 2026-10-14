/** Operazioni sulla cartella aperta nell'esplora file (una cartella del disco, o lo spazio dell'app). */
import { writeBytes } from './fs'

export type EntryHandle = FileSystemFileHandle | FileSystemDirectoryHandle

export interface TreeEntry {
  name: string
  /** percorso relativo alla cartella aperta, separato da `/` */
  path: string
  handle: EntryHandle
}

/** Voci non mostrate nell'albero. */
const HIDDEN = new Set(['.git'])

export const joinPath = (dir: string, name: string) => (dir ? `${dir}/${name}` : name)
export const parentPath = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf('/')))

const collator = new Intl.Collator('it', { numeric: true, sensitivity: 'base' })

/** Prima le cartelle, poi i file, in ordine naturale (file2 prima di file10). */
export function compareEntries(a: { name: string; handle: { kind: string } }, b: { name: string; handle: { kind: string } }) {
  if (a.handle.kind !== b.handle.kind) return a.handle.kind === 'directory' ? -1 : 1
  return collator.compare(a.name, b.name)
}

export async function listDir(dir: FileSystemDirectoryHandle, path: string): Promise<TreeEntry[]> {
  const out: TreeEntry[] = []
  for await (const handle of dir.values()) {
    if (!HIDDEN.has(handle.name)) out.push({ name: handle.name, path: joinPath(path, handle.name), handle })
  }
  return out.sort(compareEntries)
}

/** Messaggio d'errore se il nome non è valido per un file o una cartella (regole di Windows), altrimenti null. */
export function invalidName(name: string): string | null {
  if (!name.trim()) return 'Il nome è vuoto'
  if (name === '.' || name === '..') return 'Nome non valido'
  if (/[\\/:*?"<>|]/.test(name)) return 'Il nome non può contenere \\ / : * ? " < > |'
  if (/[. ]$/.test(name)) return 'Il nome non può finire con un punto o uno spazio'
  return null
}

/** Esiste già una voce con questo nome? Senza distinguere maiuscole, come su Windows. */
export async function hasEntry(dir: FileSystemDirectoryHandle, name: string) {
  const lower = name.toLowerCase()
  for await (const key of dir.keys()) if (key.toLowerCase() === lower) return true
  return false
}

async function checkNew(dir: FileSystemDirectoryHandle, name: string) {
  const invalid = invalidName(name)
  if (invalid) throw new Error(invalid)
  if (await hasEntry(dir, name)) throw new Error(`"${name}" esiste già`)
}

export async function createFile(dir: FileSystemDirectoryHandle, name: string) {
  await checkNew(dir, name)
  return dir.getFileHandle(name, { create: true })
}

export async function createFolder(dir: FileSystemDirectoryHandle, name: string) {
  await checkNew(dir, name)
  return dir.getDirectoryHandle(name, { create: true })
}

/**
 * Rinomina la voce di `parent` e restituisce l'handle al nuovo nome.
 * Usa `move()` dove il browser lo supporta; altrimenti, solo per i file, copia ed elimina l'originale.
 */
export async function renameEntry(parent: FileSystemDirectoryHandle, handle: EntryHandle, newName: string): Promise<EntryHandle> {
  const invalid = invalidName(newName)
  if (invalid) throw new Error(invalid)
  if (newName === handle.name) return handle
  const caseOnly = newName.toLowerCase() === handle.name.toLowerCase()
  if (!caseOnly && (await hasEntry(parent, newName))) throw new Error(`"${newName}" esiste già`)
  if (handle.move) {
    try {
      await handle.move(newName)
      return handle
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'NotSupportedError')) throw err
    }
  }
  // con la copia, cambiare solo le maiuscole su Windows riaprirebbe lo stesso file e poi lo cancellerebbe
  if (handle.kind === 'directory' || caseOnly) throw new Error('Il browser non permette questa modifica del nome')
  const copy = await parent.getFileHandle(newName, { create: true })
  await writeBytes(copy, await handle.getFile())
  await parent.removeEntry(handle.name)
  return copy
}

export const deleteEntry = (parent: FileSystemDirectoryHandle, name: string) => parent.removeEntry(name, { recursive: true })
