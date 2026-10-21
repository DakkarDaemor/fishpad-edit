import { Compartment, EditorState, type ChangeSpec, type Extension } from '@codemirror/state'
import { indentUnit } from '@codemirror/language'

export interface Indent {
  tabs: boolean
  size: number
}

export const DEFAULT_INDENT: Indent = { tabs: false, size: 2 }
export const indentCompartment = new Compartment()

export function indentExtension({ tabs, size }: Indent): Extension {
  return [indentUnit.of(tabs ? '\t' : ' '.repeat(size)), EditorState.tabSize.of(size)]
}

export const indentString = (i: Indent) => (i.tabs ? '	' : ' '.repeat(i.size))
export const indentLabel = (i: Indent) => (i.tabs ? `Tab: ${i.size}` : `Spazi: ${i.size}`)

/**
 * Rileva lo stile di indentazione guardando le prime righe:
 * - tab vs spazi: maggioranza delle righe indentate
 * - larghezza: differenza di indentazione più frequente tra righe consecutive (2, 4 o 8; 3 raro ma ammesso)
 * Restituisce null se il testo non ha abbastanza righe indentate per decidere.
 */
export function detectIndent(text: string, maxLines = 2000): Indent | null {
  const lines = text.split('\n', maxLines)
  let tabLines = 0
  let spaceLines = 0
  const deltas = new Map<number, number>()
  let prev = 0
  for (const raw of lines) {
    const line = raw.replace(/\r$/, '')
    if (!line.trim()) continue
    const lead = /^[ \t]*/.exec(line)![0]
    if (lead.startsWith('\t')) tabLines++
    else if (lead.length > 0 && !/^ \*/.test(line.slice(lead.length - 1))) spaceLines++ // esclude " * " dei commenti JSDoc
    if (!lead.includes('\t')) {
      const d = Math.abs(lead.length - prev)
      if (d >= 2 && d <= 8) deltas.set(d, (deltas.get(d) ?? 0) + 1)
      prev = lead.length
    }
  }
  if (tabLines === 0 && spaceLines === 0) return null
  if (tabLines > spaceLines) return { tabs: true, size: 4 }
  let best = 0
  let bestCount = 0
  for (const [d, c] of deltas) {
    // a parità preferisce la larghezza minore (un file a 2 spazi ha anche salti da 4)
    if (c > bestCount || (c === bestCount && d < best)) {
      best = d
      bestCount = c
    }
  }
  return { tabs: false, size: [2, 3, 4, 8].includes(best) ? best : 4 }
}

/** Converte l'indentazione iniziale di ogni riga dallo stile `from` allo stile `to`. */
export function convertIndentChanges(state: EditorState, from: Indent, to: Indent): ChangeSpec[] {
  const changes: ChangeSpec[] = []
  for (let n = 1; n <= state.doc.lines; n++) {
    const line = state.doc.line(n)
    const lead = /^[ \t]*/.exec(line.text)![0]
    if (!lead) continue
    let width = 0
    for (const ch of lead) width = ch === '\t' ? width + from.size - (width % from.size) : width + 1
    const levels = Math.floor(width / from.size)
    const rest = width % from.size
    const next = to.tabs ? '\t'.repeat(levels) + ' '.repeat(rest) : ' '.repeat(levels * to.size + rest)
    if (next !== lead) changes.push({ from: line.from, to: line.from + lead.length, insert: next })
  }
  return changes
}
