/**
 * Trasformazioni del testo (Modifica → Trasforma) e pulizia al salvataggio.
 * Funzioni pure su stringhe con righe separate da \n, come le tiene CodeMirror.
 */

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/** Applica `fn` alle righe, lasciando com'è l'a capo finale. */
function byLines(text: string, fn: (lines: string[]) => string[]) {
  const end = text.endsWith('\n') ? '\n' : ''
  return fn((end ? text.slice(0, -1) : text).split('\n')).join('\n') + end
}

export const sortLines = (text: string, desc = false) =>
  byLines(text, (lines) => lines.sort((a, b) => (desc ? -1 : 1) * collator.compare(a, b)))

export const uniqueLines = (text: string) => byLines(text, (lines) => [...new Set(lines)])

export const reverseLines = (text: string) => byLines(text, (lines) => lines.reverse())

export const trimTrailing = (text: string) => text.replace(/[ \t]+$/gm, '')

export function base64Encode(text: string) {
  let bin = ''
  for (const b of new TextEncoder().encode(text)) bin += String.fromCharCode(b)
  return btoa(bin)
}

export function base64Decode(text: string) {
  // accetta anche la variante per URL (- e _) e il testo andato a capo
  const clean = text.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(clean.padEnd(Math.ceil(clean.length / 4) * 4, '='))
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
}

export const urlEncode = (text: string) => encodeURIComponent(text)
export const urlDecode = (text: string) => decodeURIComponent(text.replace(/\+/g, ' '))

type RawJson = { rawJSON?: (s: string) => unknown }

/** JSON.parse che non arrotonda i numeri grandi, dove il browser lo permette (source nel reviver e JSON.rawJSON). */
function parseExact(text: string): unknown {
  const raw = (JSON as RawJson).rawJSON
  return JSON.parse(text, function (_k, v, ctx?: { source?: string }) {
    return raw && typeof v === 'number' && ctx?.source && String(v) !== ctx.source ? raw(ctx.source) : v
  })
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys)
  // i valori di JSON.rawJSON sono oggetti congelati senza prototipo: vanno lasciati come sono
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(v)
        .sort(([a], [b]) => collator.compare(a, b))
        .map(([k, x]) => [k, sortKeys(x)]),
    )
  }
  return v
}

/** Chiavi degli oggetti in ordine alfabetico, a ogni livello; il risultato è indentato con `indent`. */
export const jsonSortKeys = (text: string, indent: string) => JSON.stringify(sortKeys(parseExact(text)), null, indent)

/** Toglie gli spazi fuori dalle stringhe: nessun numero passa da JSON.parse, che serve solo a validare. */
export function jsonMinify(text: string) {
  JSON.parse(text)
  return text.replace(/("(?:\\.|[^"\\])*")|\s+/g, (_m, str: string | undefined) => str ?? '')
}

export interface SaveCleanup {
  /** toglie spazi e tab a fine riga (non nel Markdown, dove due spazi finali vanno a capo) */
  trimTrailing: boolean
  /** il file finisce con un a capo */
  finalNewline: boolean
}

export function cleanForSave(text: string, opts: SaveCleanup, lang: string | null) {
  let out = opts.trimTrailing && lang !== 'Markdown' ? trimTrailing(text) : text
  if (opts.finalNewline && out && !out.endsWith('\n')) out += '\n'
  return out
}
