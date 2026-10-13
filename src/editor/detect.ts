/**
 * Riconoscimento del linguaggio dal contenuto, per tab senza nome file (testo incollato).
 * Copre: JSON, HTML, CSS, JavaScript, TypeScript, JSX, TSX (+ shebang, PHP, XML).
 * Euristiche a punteggio: niente librerie, gira su ogni modifica (con debounce).
 */

const SAMPLE = 20_000

const count = (text: string, re: RegExp) => (text.match(re) ?? []).length

/** Segnali di JavaScript/TypeScript. */
function jsScore(t: string): number {
  return (
    count(t, /^\s*(import\s[\s\S]*?from\s+['"]|import\s+['"]|export\s+(default\b|function|class|const|let|async|\{|\*|type|interface))/gm) * 3 +
    count(t, /\b(const|let|var)\s+[\w$[{]/g) * 2 +
    count(t, /\bfunction\s*[\w$]*\s*\(/g) * 2 +
    count(t, /=>/g) * 2 +
    count(t, /\b(return|await|async|typeof|instanceof|new)\b/g) +
    count(t, /\b(console\.\w+|document\.\w+|window\.\w+|require\(|module\.exports|JSON\.\w+)/g) * 2 +
    count(t, /\b(useState|useEffect|useRef|useMemo|useCallback)\s*\(/g) * 3 +
    count(t, /===|!==|\?\?|\?\./g)
  )
}

/** Segnali di TypeScript (oltre al JS). */
function tsScore(t: string): number {
  return (
    count(t, /^\s*(export\s+)?(interface|type)\s+[A-Z]\w*(<[^>]*>)?\s*(=|\{|extends)/gm) * 3 +
    count(t, /^\s*(export\s+)?(declare\s+)?(enum|namespace|abstract\s+class)\s/gm) * 3 +
    count(t, /\bimport\s+type\b|\bas\s+const\b|\bsatisfies\b|\bkeyof\b|\breadonly\s/g) * 3 +
    count(t, /[\w)\]?]\s*:\s*(string|number|boolean|any|unknown|void|never|null|undefined|Record<|Array<|Promise<|React\.\w+)\b/g) * 2 +
    count(t, /\b(private|public|protected)\s+\w+\s*[:(]/g) * 2 +
    count(t, /\w<[A-Z]\w*(\[\])?(\s*\|\s*\w+)*>\s*\(/g)
  )
}

/** Segnali di JSX (tag dentro codice JS). */
function jsxScore(t: string): number {
  return (
    count(t, /return\s*\(?\s*<[A-Za-z>]/g) * 3 +
    count(t, /<[A-Z][\w.]*[\s/>]/g) * 2 +
    count(t, /\bclassName\s*=|\bon[A-Z]\w*=\{|\bkey=\{|\bhtmlFor=/g) * 3 +
    count(t, /<\/[\w.]+>|\/>/g) +
    count(t, /=\{[^}]*\}/g) +
    count(t, /^\s*<>|<\/>/gm) * 3
  )
}

/** Segnali di CSS (regole selettore { proprietà: valore; }). */
function cssScore(t: string): number {
  return (
    count(t, /^\s*([.#]?[\w-]+|\*|:root|@media[^{]*|@supports[^{]*|[.#][\w-]+(:[\w-]+)?([\s>+~,]+[.#]?[\w-:]+)*)\s*\{/gm) * 2 +
    count(t, /^\s*(--)?[a-z-]+\s*:\s*[^;{}]+;\s*$/gm) * 2 +
    count(t, /\b\d+(\.\d+)?(px|rem|em|vh|vw|%|ms|s|fr)\b/g) +
    count(t, /#[0-9a-fA-F]{3,8}\b|\b(rgb|rgba|hsl|hsla|var|calc|clamp)\(/g) +
    count(t, /^\s*@(import|media|keyframes|font-face|tailwind|layer)\b/gm) * 3
  )
}

/** Segnali di HTML puro (tag documento/blocchi, attributi tra virgolette). */
function htmlScore(t: string): number {
  return (
    count(t, /<\/?(html|head|body|div|span|p|a|ul|ol|li|section|header|footer|main|nav|script|style|link|meta|form|input|button|table|tr|td|img|h[1-6])\b[^>]*>/gi) +
    count(t, /\s(class|id|href|src|rel|type|style)="[^"]*"/g) * 2 +
    count(t, /<!--[\s\S]*?-->/g) * 2
  )
}

export function detectByContent(text: string): string | null {
  const head = text.slice(0, 2000).trimStart()
  if (!head) return null

  const firstLine = head.split('\n', 1)[0]
  if (firstLine.startsWith('#!')) {
    if (/python/.test(firstLine)) return 'Python'
    if (/node|deno|bun/.test(firstLine)) return 'JavaScript'
    if (/(ba|z)?sh\b/.test(firstLine)) return 'Shell'
  }
  if (head.startsWith('<?php')) return 'PHP'
  if (head.startsWith('<?xml')) return 'XML'
  if (/^<!doctype html|^<html[\s>]/i.test(head)) return 'HTML'
  if ((head.startsWith('{') || head.startsWith('[')) && text.length < 5_000_000) {
    try {
      JSON.parse(text)
      return 'JSON'
    } catch {
      /* non è JSON valido: prosegue con le euristiche */
    }
  }

  const t = text.slice(0, SAMPLE)
  const js = jsScore(t)
  const css = cssScore(t)
  const startsWithTag = /^<[a-zA-Z!]/.test(head)

  // Markup che inizia con un tag e non contiene codice JS: HTML
  if (startsWithTag && js < 4) return htmlScore(t) >= 2 ? 'HTML' : null

  if (js >= 4 && js >= css) {
    const ts = tsScore(t) >= 3
    const jsx = jsxScore(t) >= 4
    if (ts && jsx) return 'TSX'
    if (ts) return 'TypeScript'
    if (jsx) return 'JSX'
    return 'JavaScript'
  }
  if (css >= 4) return 'CSS'
  if (htmlScore(t) >= 4) return 'HTML'
  return null
}
