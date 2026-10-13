import { fileInFolder } from '../fs'
import { mimeFor, type AssetResolver } from './assets'

/** Testo di un file se è aperto nell'editor (anche con modifiche non salvate), altrimenti undefined. */
export type OpenText = (handle: FileSystemFileHandle) => Promise<string | undefined>

/** Cartella dell'anteprima e percorso, al suo interno, della cartella della pagina. */
export interface PreviewAssets {
  resolve: AssetResolver
  baseDir: string[]
}

/**
 * File locali per l'anteprima di `page`, letti da `dir`: i file aperti nell'editor danno il testo attuale,
 * gli altri si leggono da disco. null se la pagina non sta nella cartella (o il file non è su disco).
 */
export async function folderAssets(
  dir: FileSystemDirectoryHandle,
  page: FileSystemFileHandle | undefined,
  openText: OpenText,
): Promise<PreviewAssets | null> {
  const pagePath = page ? await dir.resolve(page).catch(() => null) : null
  if (!pagePath) return null
  const resolve: AssetResolver = async (path) => {
    const handle = await fileInFolder(dir, path)
    if (!handle) return null
    const mime = mimeFor(handle.name)
    const text = await openText(handle)
    if (text !== undefined) return { text, mime }
    try {
      return { bytes: new Uint8Array(await (await handle.getFile()).arrayBuffer()), mime }
    } catch {
      return null
    }
  }
  return { resolve, baseDir: pagePath.slice(0, -1) }
}
