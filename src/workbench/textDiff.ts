/**
 * L'unica modifica che trasforma `a` in `b`, tolti prefisso e suffisso comuni (null se sono uguali).
 * Così sostituire il testo con la versione su disco sposta cursore e blocchi chiusi solo dove serve.
 */
export function diffRange(a: string, b: string): { from: number; to: number; insert: string } | null {
  if (a === b) return null
  const max = Math.min(a.length, b.length)
  let start = 0
  while (start < max && a.charCodeAt(start) === b.charCodeAt(start)) start++
  let end = 0
  while (end < max - start && a.charCodeAt(a.length - 1 - end) === b.charCodeAt(b.length - 1 - end)) end++
  return { from: start, to: a.length - end, insert: b.slice(start, b.length - end) }
}
