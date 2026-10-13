/** Colori CSS (hex, rgb(), hsl()): lettura e riscrittura nello stesso formato, per il selettore di colore. */

export interface ParsedColor {
  r: number
  g: number
  b: number
  /** testo dell'alpha così com'era scritto (null se assente) */
  alpha: string | null
  format: 'hex' | 'rgb' | 'hsl'
  /** nome della funzione (rgb, rgba, hsl, hsla) */
  fn?: string
  /** argomenti separati da virgole (sintassi "legacy") invece che da spazi */
  commas?: boolean
  upper?: boolean
}

/** Trova i colori in un testo: `#abc`, `#aabbcc(dd)`, `rgb(...)`, `rgba(...)`, `hsl(...)`, `hsla(...)`. */
export const COLOR_RE = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![0-9a-zA-Z_-])|\b(?:rgba?|hsla?)\([^()]*\)/g

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

function channel(s: string): number | null {
  const m = /^(-?[\d.]+)(%?)$/.exec(s)
  if (!m) return null
  const n = parseFloat(m[1])
  if (Number.isNaN(n)) return null
  return clamp(Math.round(m[2] ? (n / 100) * 255 : n), 0, 255)
}

function hue(s: string): number | null {
  const m = /^(-?[\d.]+)(deg|turn|rad)?$/.exec(s)
  if (!m) return null
  const n = parseFloat(m[1])
  const deg = m[2] === 'turn' ? n * 360 : m[2] === 'rad' ? (n * 180) / Math.PI : n
  return ((deg % 360) + 360) % 360
}

function percent(s: string): number | null {
  const m = /^([\d.]+)%?$/.exec(s)
  return m ? clamp(parseFloat(m[1]), 0, 100) : null
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const sat = s / 100
  const lig = l / 100
  const k = (n: number) => (n + h / 30) % 12
  const a = sat * Math.min(lig, 1 - lig)
  const f = (n: number) => lig - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)]
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rr = r / 255
  const gg = g / 255
  const bb = b / 255
  const max = Math.max(rr, gg, bb)
  const min = Math.min(rr, gg, bb)
  const l = (max + min) / 2
  const d = max - min
  let h = 0
  let s = 0
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1))
    if (max === rr) h = ((gg - bb) / d) % 6
    else if (max === gg) h = (bb - rr) / d + 2
    else h = (rr - gg) / d + 4
    h *= 60
  }
  return [Math.round((h + 360) % 360), Math.round(s * 100), Math.round(l * 100)]
}

export function parseColor(text: string): ParsedColor | null {
  if (text.startsWith('#')) {
    let hex = text.slice(1)
    if (!/^(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(hex)) return null
    if (hex.length <= 4) hex = [...hex].map((c) => c + c).join('')
    const n = (i: number) => parseInt(hex.slice(i, i + 2), 16)
    return {
      r: n(0),
      g: n(2),
      b: n(4),
      alpha: hex.length === 8 ? hex.slice(6) : null,
      format: 'hex',
      upper: text !== text.toLowerCase(),
    }
  }
  const m = /^(rgba?|hsla?)\(([^()]*)\)$/i.exec(text)
  if (!m) return null
  const fn = m[1].toLowerCase()
  const body = m[2].trim()
  const commas = body.includes(',')
  let parts: string[]
  let alpha: string | null = null
  if (commas) {
    parts = body.split(',').map((p) => p.trim())
    if (parts.length === 4) alpha = parts.pop()!
  } else {
    const [main, a] = body.split('/').map((p) => p.trim())
    parts = main.split(/\s+/)
    alpha = a ?? null
  }
  if (parts.length !== 3) return null
  if (fn.startsWith('rgb')) {
    const [r, g, b] = parts.map(channel)
    if (r == null || g == null || b == null) return null
    return { r, g, b, alpha, format: 'rgb', fn: m[1], commas }
  }
  const h = hue(parts[0])
  const s = percent(parts[1])
  const l = percent(parts[2])
  if (h == null || s == null || l == null) return null
  const [r, g, b] = hslToRgb(h, s, l)
  return { r, g, b, alpha, format: 'hsl', fn: m[1], commas }
}

const hex2 = (n: number) => n.toString(16).padStart(2, '0')

/** `#rrggbb` per `<input type="color">`. */
export const toHex = (c: { r: number; g: number; b: number }) => `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`

/** Riscrive `original` con un nuovo colore (`#rrggbb`), mantenendo formato e alpha. */
export function replaceColor(original: ParsedColor, hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const { alpha, fn = '', commas } = original
  if (original.format === 'hex') {
    const out = `#${hex2(r)}${hex2(g)}${hex2(b)}${alpha ?? ''}`
    return original.upper ? out.toUpperCase() : out
  }
  const values = original.format === 'rgb' ? [r, g, b].map(String) : rgbToHsl(r, g, b).map((v, i) => (i ? `${v}%` : `${v}`))
  if (commas) return `${fn}(${[...values, ...(alpha != null ? [alpha] : [])].join(', ')})`
  return `${fn}(${values.join(' ')}${alpha != null ? ` / ${alpha}` : ''})`
}
