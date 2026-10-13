export type Encoding = 'utf-8' | 'windows-1252'

export const ENCODING_LABELS: Record<Encoding, string> = { 'utf-8': 'UTF-8', 'windows-1252': 'Windows-1252' }

// Windows-1252: i byte 0x80–0x9F hanno caratteri propri, gli altri coincidono con Latin-1.
// I cinque byte non assegnati (0x81, 0x8D, 0x8F, 0x90, 0x9D) restano il code point omonimo, come in TextDecoder.
const CP1252_HIGH =
  '€\x81‚ƒ„…†‡ˆ‰Š‹Œ\x8DŽ\x8F' +
  '\x90‘’“”•–—˜™š›œ\x9DžŸ'
const CP1252_ENCODE = new Map([...CP1252_HIGH].map((ch, i) => [ch.charCodeAt(0), 0x80 + i]))

const hasUtf8Bom = (b: Uint8Array) => b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf

/**
 * Decodifica il contenuto di un file. Senza `forced`: UTF-8 se valido (il BOM viene rimosso),
 * altrimenti Windows-1252, la codifica più comune dei file di testo "vecchi" su Windows.
 */
export function decode(bytes: Uint8Array, forced?: Encoding): { text: string; encoding: Encoding } {
  const bom = hasUtf8Bom(bytes)
  const encoding = forced ?? (bom || isValidUtf8(bytes) ? 'utf-8' : 'windows-1252')
  const body = encoding === 'utf-8' && bom ? bytes.subarray(3) : bytes
  return { text: new TextDecoder(encoding).decode(body), encoding }
}

function isValidUtf8(bytes: Uint8Array) {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return true
  } catch {
    return false
  }
}

/** Codifica il testo. `unmappable` conta i caratteri non rappresentabili, scritti come `?`. */
export function encode(text: string, encoding: Encoding): { bytes: Uint8Array<ArrayBuffer>; unmappable: number } {
  if (encoding === 'utf-8') return { bytes: new TextEncoder().encode(text), unmappable: 0 }
  const out = new Uint8Array(text.length)
  let n = 0
  let unmappable = 0
  for (const ch of text) {
    const cp = ch.codePointAt(0)!
    let byte = cp < 0x80 || (cp >= 0xa0 && cp <= 0xff) ? cp : CP1252_ENCODE.get(cp)
    if (byte === undefined) {
      byte = 0x3f
      unmappable++
    }
    out[n++] = byte
  }
  return { bytes: out.slice(0, n), unmappable }
}
