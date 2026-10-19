import { createStore, del, get, set } from 'idb-keyval'
import { packHandle, unpackHandle, type StoredHandle } from './workspace'
import type { Doc } from './workbench/Workbench'

/** Una versione salvata nella cronologia locale (il testo sta in una chiave a parte, letta solo quando serve). */
export interface Version extends StoredHandle {
  id: string
  docId: string
  name: string
  url?: string
  time: number
  reason: string
  size: number
}

export const MAX_PER_DOC = 30
export const MAX_TOTAL = 400
/** Oltre questa lunghezza un testo non si salva in cronologia: occuperebbe troppo spazio. */
export const MAX_CHARS = 2_000_000

// un database a parte: le versioni possono pesare e non devono rallentare la lettura della sessione
const store = createStore('fishpad-history', 'versions')
const INDEX = 'index'
const textKey = (id: string) => `text:${id}`

/** Le versioni da tenere: al massimo MAX_PER_DOC per documento e MAX_TOTAL in tutto, le più recenti. */
export function prune(index: Version[]): { keep: Version[]; drop: Version[] } {
  const sorted = [...index].sort((a, b) => b.time - a.time)
  const perDoc = new Map<string, number>()
  const keep: Version[] = []
  const drop: Version[] = []
  for (const v of sorted) {
    const n = perDoc.get(v.docId) ?? 0
    if (n < MAX_PER_DOC && keep.length < MAX_TOTAL) {
      keep.push(v)
      perDoc.set(v.docId, n + 1)
    } else {
      drop.push(v)
    }
  }
  return { keep, drop }
}

/** Data della versione: solo l'ora se è di oggi. */
export function versionLabel(v: Pick<Version, 'time' | 'reason'>, now = Date.now()) {
  const d = new Date(v.time)
  const sameDay = new Date(now).toDateString() === d.toDateString()
  const when = sameDay
    ? d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  return `${when} · ${v.reason}`
}

export const sizeLabel = (chars: number) => (chars < 1024 ? `${chars} caratteri` : `${Math.round(chars / 1024)} kB`)

// IndexedDB può non esserci (navigazione privata): la cronologia smette di funzionare, l'app no
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    console.warn('[history]', err)
    return fallback
  }
}

const loadIndex = () => safe(async () => (await get<Version[]>(INDEX, store)) ?? [], [] as Version[])

/** Le scritture sull'indice vanno una dopo l'altra, o due salvataggi vicini si cancellerebbero a vicenda. */
let queue: Promise<unknown> = Promise.resolve()
const serial = <T>(fn: () => Promise<T>) => {
  const next = queue.then(fn, fn)
  queue = next.catch(() => {})
  return next
}

/** Salva il testo come nuova versione del documento, se è diverso dall'ultima. */
export function addVersion(doc: Doc, text: string, reason: string) {
  if (!text || text.length > MAX_CHARS) return Promise.resolve()
  return serial(() =>
    safe(async () => {
      const index = await loadIndex()
      const last = index.filter((v) => v.docId === doc.id).sort((a, b) => b.time - a.time)[0]
      if (last && (await get<string>(textKey(last.id), store)) === text) return
      const v: Version = {
        id: crypto.randomUUID(),
        docId: doc.id,
        name: doc.name,
        url: doc.request?.url,
        time: Date.now(),
        reason,
        size: text.length,
        ...(await packHandle(doc.handle)),
      }
      await set(textKey(v.id), text, store)
      const { keep, drop } = prune([...index, v])
      await set(INDEX, keep, store)
      await Promise.all(drop.map((d) => del(textKey(d.id), store)))
    }, undefined),
  )
}

/** Versioni del documento, le più recenti per prime: della tab, o dello stesso file o URL aperto in altre tab. */
export async function listVersions(doc: Doc): Promise<Version[]> {
  const index = await loadIndex()
  const out: Version[] = []
  for (const v of index) {
    if (v.docId === doc.id || (doc.request && v.url === doc.request.url)) out.push(v)
    else if (doc.handle && (v.handle || v.workspacePath)) {
      const h = await unpackHandle(v).catch(() => undefined)
      if (h && (await h.isSameEntry(doc.handle).catch(() => false))) out.push(v)
    }
  }
  return out.sort((a, b) => b.time - a.time)
}

export const readVersion = (v: Version) => safe(async () => (await get<string>(textKey(v.id), store)) ?? null, null)
