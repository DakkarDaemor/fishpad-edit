import { detectByFilename } from './editor/languages'

/** Richiesta GET di una tab collegata a un URL (tipicamente un'API che restituisce JSON). */
export interface UrlRequest {
  url: string
  headers?: Array<[string, string]>
}

/** Esito dell'ultima richiesta, mostrato nella barra di stato. */
export interface UrlResponse {
  status: number
  statusText: string
  ms: number
  contentType: string
}

export interface Fetched {
  text: string
  response: UrlResponse
}

const TIMEOUT_MS = 30_000

/** Header scritti uno per riga come `Nome: valore`; righe vuote e commenti (`#`) vengono saltati. */
export function parseHeaders(text: string): Array<[string, string]> {
  const out: Array<[string, string]> = []
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim()
    if (!line || line.startsWith('#')) return
    const colon = line.indexOf(':')
    const name = colon > 0 ? line.slice(0, colon).trim() : ''
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)) throw new Error(`Header alla riga ${i + 1}: serve "Nome: valore"`)
    out.push([name, line.slice(colon + 1).trim()])
  })
  return out
}

export const formatHeaders = (headers: Array<[string, string]> | undefined) => (headers ?? []).map(([k, v]) => `${k}: ${v}`).join('\n')

export function isLoopback(hostname: string) {
  return hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '[::1]' || /^127(\.\d{1,3}){3}$/.test(hostname)
}

/** URL scritto dall'utente: senza schema si assume https (http per localhost). Solo http e https. */
export function parseUrl(input: string): URL {
  const text = input.trim()
  if (!text) throw new Error('Scrivi un URL')
  const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(text)
    ? text
    : `${isLoopback(text.split(/[/:?#]/)[0]) ? 'http' : 'https'}://${text}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    throw new Error(`URL non valido: ${text}`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Sono supportati solo URL http e https')
  return url
}

/** Una pagina https non può chiamare un indirizzo http, a parte localhost (contenuto misto). */
export function blockedAsMixedContent(url: URL, pageProtocol: string) {
  return pageProtocol === 'https:' && url.protocol === 'http:' && !isLoopback(url.hostname)
}

/** Linguaggio della risposta dal Content-Type, poi dal nome nel percorso; undefined = da riconoscere dal contenuto. */
export function languageFor(contentType: string, url: URL): string | undefined {
  const type = contentType.split(';')[0].trim().toLowerCase()
  if (/[/+]json$/.test(type)) return 'JSON'
  if (type === 'text/html') return 'HTML'
  if (/[/+]xml$/.test(type)) return 'XML'
  if (type === 'text/css') return 'CSS'
  if (/(java|ecma)script$/.test(type)) return 'JavaScript'
  if (type === 'text/markdown') return 'Markdown'
  if (/[/+-]yaml$/.test(type)) return 'YAML'
  return detectByFilename(lastSegment(url) ?? '') ?? undefined
}

function lastSegment(url: URL) {
  const segments = url.pathname.split('/').filter(Boolean)
  return segments.length ? decodeURIComponent(segments[segments.length - 1]) : null
}

/** Nome della tab: ultimo pezzo del percorso con l'host tra parentesi, o solo l'host. */
export function tabNameFor(url: URL) {
  const last = lastSegment(url)
  return last ? `${last} (${url.host})` : url.host
}

/** Nome proposto per salvare la risposta su file (senza estensione se il percorso non ne ha una). */
export const fileBaseName = (url: URL) => lastSegment(url) ?? url.hostname

function explain(err: unknown, url: URL): string {
  if (err instanceof DOMException && err.name === 'TimeoutError') return `Nessuna risposta da ${url.host} entro ${TIMEOUT_MS / 1000} secondi`
  if (isLoopback(url.hostname) || /^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(url.hostname)) {
    return `${url.host} non risponde, o non consente richieste da questa app (CORS). Controlla anche il permesso di accesso alla rete locale del browser`
  }
  return `Richiesta bloccata: ${url.host} non è raggiungibile, oppure non consente richieste da questa app (CORS)`
}

/** GET dell'URL. Gli errori di rete diventano messaggi leggibili; le risposte 4xx/5xx non sono errori. */
export async function fetchUrl(req: UrlRequest, pageProtocol = location.protocol): Promise<Fetched> {
  const url = parseUrl(req.url)
  if (blockedAsMixedContent(url, pageProtocol)) {
    throw new Error(`Da una pagina https il browser non permette di chiamare indirizzi http (tranne localhost): usa https://${url.host}`)
  }
  const start = performance.now()
  let res: Response
  try {
    res = await fetch(url, { headers: req.headers, cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch (err) {
    throw new Error(explain(err, url), { cause: err })
  }
  const text = await res.text()
  return {
    text,
    response: {
      status: res.status,
      statusText: res.statusText,
      ms: Math.round(performance.now() - start),
      contentType: res.headers.get('content-type') ?? '',
    },
  }
}
