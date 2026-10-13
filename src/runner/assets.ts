/**
 * File locali nell'anteprima HTML. L'iframe ha un'origine opaca e non può leggere la cartella:
 * i riferimenti relativi (CSS, script, immagini…) vengono sostituiti con URL `data:` costruiti qui.
 * Un URL `data:` sta su una sola riga, quindi le righe degli errori restano quelle del file.
 */

/** Contenuto di un file della cartella: testo (anche non salvato, dall'editor) o byte da disco. null se non esiste. */
export type AssetResolver = (path: string[]) => Promise<{ text?: string; bytes?: Uint8Array; mime: string } | null>

const MIME: Record<string, string> = {
  css: 'text/css',
  js: 'text/javascript',
  mjs: 'text/javascript',
  json: 'application/json',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  ico: 'image/x-icon',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  mp4: 'video/mp4',
  webm: 'video/webm',
  txt: 'text/plain',
  html: 'text/html',
}

export const mimeFor = (name: string) => MIME[name.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream'

/**
 * Percorso nella cartella di un riferimento relativo, a partire dalla cartella `baseDir`.
 * null per URL assoluti (http:, data:, //host…), ancore e percorsi che escono dalla cartella.
 */
export function resolvePath(baseDir: string[], ref: string): string[] | null {
  const url = ref.trim().replace(/[?#].*$/, '')
  if (!url || /^[a-z][a-z\d+.-]*:/i.test(url) || url.startsWith('//')) return null
  let decoded: string
  try {
    decoded = decodeURIComponent(url)
  } catch {
    return null
  }
  const out = decoded.startsWith('/') ? [] : [...baseDir]
  for (const seg of decoded.split('/')) {
    if (!seg || seg === '.') continue
    if (seg === '..') {
      if (!out.length) return null
      out.pop()
    } else out.push(seg)
  }
  return out.length ? out : null
}

// Attributi che caricano un file, per tag. <link> solo per fogli di stile e icone.
const TAG_RE = /<(link|script|img|source|video|audio|track|input)\b[^>]*>/gi
const ATTR_RE = /(\s)(src|href|poster)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/gi

function toBase64(bytes: Uint8Array) {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

const dataUrl = (mime: string, bytes: Uint8Array) => `data:${mime};base64,${toBase64(bytes)}`

async function replaceAsync(text: string, re: RegExp, fn: (m: RegExpExecArray) => Promise<string>) {
  const parts: Array<string | Promise<string>> = []
  let last = 0
  for (const m of text.matchAll(re)) {
    parts.push(text.slice(last, m.index), fn(m as RegExpExecArray))
    last = m.index + m[0].length
  }
  parts.push(text.slice(last))
  return (await Promise.all(parts)).join('')
}

/** URL `data:` per un file della cartella; i CSS hanno a loro volta i `url(...)` risolti, relativi al CSS. */
async function assetUrl(path: string[], resolve: AssetResolver, depth: number): Promise<string | null> {
  const asset = await resolve(path)
  if (!asset) return null
  if (asset.mime === 'text/css' && depth < 3) {
    const css = asset.text ?? new TextDecoder().decode(asset.bytes)
    const inlined = await rewriteCssUrls(css, path.slice(0, -1), resolve, depth + 1)
    return dataUrl('text/css', new TextEncoder().encode(inlined))
  }
  return dataUrl(asset.mime, asset.bytes ?? new TextEncoder().encode(asset.text ?? ''))
}

/** Sostituisce i `url(...)` relativi di un CSS. */
export function rewriteCssUrls(css: string, baseDir: string[], resolve: AssetResolver, depth = 0): Promise<string> {
  return replaceAsync(css, /url\(\s*(["']?)([^"')]+)\1\s*\)/gi, async (m) => {
    const path = resolvePath(baseDir, m[2])
    const url = path && (await assetUrl(path, resolve, depth))
    return url ? `url("${url}")` : m[0]
  })
}

/** Sostituisce i riferimenti relativi di una pagina HTML (`baseDir`: cartella della pagina). */
export function rewriteHtml(html: string, baseDir: string[], resolve: AssetResolver): Promise<string> {
  return replaceAsync(html, TAG_RE, async (tag) => {
    const name = tag[1].toLowerCase()
    if (name === 'link' && !/\srel\s*=\s*["']?[^"'>]*\b(stylesheet|icon)\b/i.test(tag[0])) return tag[0]
    return replaceAsync(tag[0], ATTR_RE, async (attr) => {
      const value = attr[4] ?? attr[5] ?? attr[6] ?? ''
      const path = resolvePath(baseDir, value)
      const url = path && (await assetUrl(path, resolve, 0))
      // lo spazio prima dell'attributo resta quello originale (anche un a capo): le righe non cambiano
      return url ? `${attr[1]}${attr[2]}="${url}"` : attr[0]
    })
  })
}
