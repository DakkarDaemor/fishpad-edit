import type { Diagnostic } from '@codemirror/lint'
import type { EditorView } from '@codemirror/view'
import { Engine } from 'php-parser'

// suppressErrors: il parser continua dopo un errore e li raccoglie tutti in ast.errors
const parser = new Engine({ parser: { suppressErrors: true, extractDoc: false }, ast: { withPositions: true } })

/** Errori di sintassi PHP (solo sintassi: niente tipi né funzioni inesistenti). */
export function phpDiagnostics(code: string): Diagnostic[] {
  const clean = (m: string) => m.replace(/^Parse Error : /, '').replace(/ on line \d+$/, '')
  try {
    const seen = new Set<number>()
    return parser.parseCode(code, 'file.php').errors.flatMap((e) => {
      const from = e.loc?.start.offset ?? 0
      // dopo un errore il parser ne segnala altri nello stesso punto: si tiene il primo
      if (seen.has(from)) return []
      seen.add(from)
      return [{ from, to: Math.max(from, e.loc?.end.offset ?? from), severity: 'error' as const, message: clean(e.message), source: 'PHP' }]
    })
  } catch (e) {
    // errori da cui il parser non si riprende: arrivano come eccezione con riga e colonna
    const { lineNumber, columnNumber, message } = e as { lineNumber?: number; columnNumber?: number; message: string }
    const lines = code.split('\n').slice(0, Math.max(0, (lineNumber ?? 1) - 1))
    const from = Math.min(code.length, lines.reduce((n, l) => n + l.length + 1, 0) + (columnNumber ?? 0))
    return [{ from, to: from, severity: 'error', message: clean(message), source: 'PHP' }]
  }
}

export const phpLintSource = (view: EditorView) => {
  const max = view.state.doc.length
  return phpDiagnostics(view.state.doc.toString()).map((d) => ({ ...d, from: Math.min(d.from, max), to: Math.min(d.to, max) }))
}
