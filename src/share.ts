/**
 * "Condividi → Fishpad" da un'altra app (Android, PWA installata). Il service worker riceve il POST
 * del Web Share Target (public/share-target-sw.js), mette testo e file nella cache e riapre l'app
 * con `?share-target`: qui si leggono e si cancellano.
 */

export const SHARE_PARAM = 'share-target'
const CACHE = 'fishpad-share'

export interface Shared {
  title?: string
  text?: string
  url?: string
  files: File[]
}

const isHttpUrl = (s: string | undefined) => !!s && /^https?:\/\/\S+$/i.test(s.trim())

/** L'URL condiviso, da aprire in una tab URL. Molte app (Chrome compreso) lo mettono nel campo del testo. */
export function sharedUrl({ url, text }: Pick<Shared, 'url' | 'text'>): string | null {
  if (isHttpUrl(url)) return url!.trim()
  if (isHttpUrl(text)) return text!.trim()
  return null
}

/** I dati condivisi arrivati con l'apertura dell'app; null se non ce ne sono. Li toglie dalla cache. */
export async function takeShared(): Promise<Shared | null> {
  const params = new URLSearchParams(location.search)
  if (!params.has(SHARE_PARAM) || !('caches' in window)) return null
  params.delete(SHARE_PARAM)
  const query = params.toString()
  history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`)
  const cache = await caches.open(CACHE)
  // stesse chiavi del service worker, che ha come scope la base dell'app
  const meta = await cache.match(new URL(`${import.meta.env.BASE_URL}__share/meta`, location.origin).href)
  if (!meta) return null
  const shared: Shared = { ...((await meta.json()) as Omit<Shared, 'files'>), files: [] }
  for (const req of await cache.keys()) {
    if (!new URL(req.url).pathname.includes('/__share/file/')) continue
    const res = (await cache.match(req))!
    const name = decodeURIComponent(res.headers.get('X-File-Name') ?? 'condiviso.txt')
    shared.files.push(new File([await res.blob()], name, { type: res.headers.get('Content-Type') ?? '' }))
  }
  await caches.delete(CACHE)
  return shared
}
