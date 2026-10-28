import { EditorSelection, Prec, type ChangeSpec, type EditorState } from '@codemirror/state'
import { keymap, type Command, type EditorView } from '@codemirror/view'

/**
 * Formattazione Markdown: comandi per la barra sopra l'editor e scorciatoie (solo nelle tab Markdown).
 * Ogni comando, ripetuto, toglie la formattazione che ha messo.
 */

/** Quanti `ch` consecutivi ci sono da `pos` andando indietro (dir -1) o avanti (dir 1). */
function run(text: string, pos: number, dir: 1 | -1, ch: string) {
  let n = 0
  while (text[dir < 0 ? pos - 1 - n : pos + n] === ch) n++
  return n
}

/**
 * `mark` è presente in una sequenza di `n` caratteri uguali? Con gli asterischi `***` vale sia per il corsivo
 * sia per il grassetto, e `**` non è un corsivo.
 */
const hasMark = (mark: string, n: number) => (mark[0] === '*' ? n === mark.length || n === 3 : n >= mark.length)

/** Mette o toglie `mark` attorno alla selezione; senza selezione, attorno alla parola sotto il cursore. */
export const toggleInline = (mark: string): Command => (view) => {
  const { state } = view
  const ch = mark[0]
  view.dispatch(
    state.changeByRange((range) => {
      let { from, to } = range
      if (from === to) {
        const word = state.wordAt(from)
        if (!word) {
          return { changes: { from, insert: mark + mark }, range: EditorSelection.cursor(from + mark.length) }
        }
        ;({ from, to } = word)
      }
      const line = state.doc.lineAt(from)
      const text = line.text
      const a = from - line.from
      const b = Math.min(to, line.to) - line.from
      const inner = state.sliceDoc(from, to)
      const m = mark.length
      // segni dentro la selezione (**testo** selezionato tutto)
      if (inner.length >= 2 * m && hasMark(mark, run(inner, 0, 1, ch)) && hasMark(mark, run(inner, inner.length, -1, ch))) {
        return {
          changes: [{ from, to: from + m }, { from: to - m, to }],
          range: EditorSelection.range(from, to - 2 * m),
        }
      }
      // segni appena fuori dalla selezione
      if (hasMark(mark, run(text, a, -1, ch)) && hasMark(mark, run(text, b, 1, ch))) {
        return {
          changes: [{ from: from - m, to: from }, { from: to, to: to + m }],
          range: EditorSelection.range(from - m, to - m),
        }
      }
      return {
        changes: [{ from, insert: mark }, { from: to, insert: mark }],
        range: EditorSelection.range(from + m, to + m),
      }
    }),
  )
  return true
}

/** Codice: in linea su una riga, blocco ``` se la selezione prende più righe. */
export const toggleCode: Command = (view) => {
  const { state } = view
  const sel = state.selection.main
  const first = state.doc.lineAt(sel.from)
  const last = state.doc.lineAt(sel.to)
  if (first.number === last.number && !(sel.empty && first.length === 0)) return toggleInline('`')(view)
  if (sel.empty) {
    view.dispatch({ changes: { from: first.from, insert: '```\n\n```' }, selection: { anchor: first.from + 4 } })
    return true
  }
  const fence = /^\s*```/
  const before = first.number > 1 ? state.doc.line(first.number - 1) : null
  const after = last.number < state.doc.lines ? state.doc.line(last.number + 1) : null
  if (before && after && fence.test(before.text) && fence.test(after.text)) {
    view.dispatch({ changes: [{ from: before.from, to: first.from }, { from: last.to, to: after.to }] })
    return true
  }
  view.dispatch({ changes: [{ from: first.from, insert: '```\n' }, { from: last.to, insert: '\n```' }] })
  return true
}

/** Link: il testo selezionato diventa il testo del link e resta selezionato l'indirizzo da scrivere; un URL selezionato diventa l'indirizzo. */
export const insertLink: Command = (view) => {
  const { state } = view
  view.dispatch(
    state.changeByRange(({ from, to }) => {
      const text = state.sliceDoc(from, to)
      if (/^(https?:\/\/|www\.)\S+$/.test(text)) {
        return { changes: { from, to, insert: `[](${text})` }, range: EditorSelection.cursor(from + 1) }
      }
      const url = 'https://'
      const insert = `[${text}](${url})`
      const at = from + text.length + 3
      return { changes: { from, to, insert }, range: text ? EditorSelection.range(at, at + url.length) : EditorSelection.cursor(from + 1) }
    }),
  )
  return true
}

export type LineKind = 'bullet' | 'ordered' | 'task' | 'quote'

const LINE_RE: Record<LineKind, RegExp> = {
  task: /^(\s*)[-*+]\s+\[[ xX]\]\s+/,
  bullet: /^(\s*)[-*+]\s+(?!\[[ xX]\]\s)/,
  ordered: /^(\s*)\d+[.)]\s+/,
  quote: /^(\s*)>\s?/,
}
const HEADING_RE = /^#{1,6}\s+/

/** Righe toccate dalla selezione principale (le vuote contano solo se è l'unica riga). */
function selectedLines(state: EditorState) {
  const sel = state.selection.main
  const first = state.doc.lineAt(sel.from).number
  // una selezione che finisce a inizio riga non prende quella riga
  let last = state.doc.lineAt(sel.to).number
  if (last > first && state.doc.line(last).from === sel.to) last--
  const lines = []
  for (let n = first; n <= last; n++) lines.push(state.doc.line(n))
  return lines.length > 1 ? lines.filter((l) => l.text.trim()) : lines
}

/** Titolo di livello `level`: la stessa scorciatoia sullo stesso livello lo toglie. */
export const toggleHeading = (level: number): Command => (view) => {
  const lines = selectedLines(view.state)
  const prefix = '#'.repeat(level) + ' '
  const all = lines.every((l) => l.text.startsWith(prefix) && !l.text.startsWith(prefix.slice(0, -1) + '#'))
  const changes: ChangeSpec[] = lines.map((l) => {
    const old = HEADING_RE.exec(l.text)?.[0].length ?? 0
    return { from: l.from, to: l.from + old, insert: all ? '' : prefix }
  })
  view.dispatch({ changes })
  return true
}

/** Elenco puntato, numerato, di cose da fare o citazione: lo mette alle righe o, se lo hanno già tutte, lo toglie. */
export const toggleLines = (kind: LineKind): Command => (view) => {
  const lines = selectedLines(view.state)
  const all = lines.every((l) => LINE_RE[kind].test(l.text))
  const changes: ChangeSpec[] = lines.map((l, i) => {
    const indent = /^\s*/.exec(l.text)![0]
    // un tipo di elenco ne sostituisce un altro (ma la citazione può contenere un elenco e viceversa)
    const others = kind === 'quote' ? [LINE_RE.quote] : [LINE_RE.task, LINE_RE.bullet, LINE_RE.ordered]
    const old = others.map((re) => re.exec(l.text)?.[0].length ?? 0).find((n) => n > 0) ?? indent.length
    const marker = kind === 'bullet' ? '- ' : kind === 'task' ? '- [ ] ' : kind === 'ordered' ? `${i + 1}. ` : '> '
    return { from: l.from, to: l.from + old, insert: all ? indent : indent + marker }
  })
  view.dispatch({ changes })
  return true
}

export interface MarkdownAction {
  id: string
  label: string
  /** testo del pulsante nella barra */
  icon: string
  shortcut?: string
  run: Command
}

export const MARKDOWN_ACTIONS: MarkdownAction[] = [
  { id: 'bold', label: 'Grassetto', icon: 'B', shortcut: 'Ctrl+B', run: toggleInline('**') },
  { id: 'italic', label: 'Corsivo', icon: 'I', shortcut: 'Ctrl+I', run: toggleInline('*') },
  { id: 'strike', label: 'Barrato', icon: 'S', shortcut: 'Ctrl+Shift+X', run: toggleInline('~~') },
  { id: 'code', label: 'Codice (in linea o blocco)', icon: '</>', shortcut: 'Ctrl+E', run: toggleCode },
  { id: 'link', label: 'Link', icon: '🔗', shortcut: 'Ctrl+Shift+L', run: insertLink },
  { id: 'h1', label: 'Titolo 1', icon: 'H1', shortcut: 'Ctrl+Shift+1', run: toggleHeading(1) },
  { id: 'h2', label: 'Titolo 2', icon: 'H2', shortcut: 'Ctrl+Shift+2', run: toggleHeading(2) },
  { id: 'h3', label: 'Titolo 3', icon: 'H3', shortcut: 'Ctrl+Shift+3', run: toggleHeading(3) },
  { id: 'bullet', label: 'Elenco puntato', icon: '•', shortcut: 'Ctrl+Shift+8', run: toggleLines('bullet') },
  { id: 'ordered', label: 'Elenco numerato', icon: '1.', shortcut: 'Ctrl+Shift+7', run: toggleLines('ordered') },
  { id: 'task', label: 'Cose da fare', icon: '☐', shortcut: 'Ctrl+Shift+9', run: toggleLines('task') },
  { id: 'quote', label: 'Citazione', icon: '❝', shortcut: 'Ctrl+Shift+.', run: toggleLines('quote') },
]

// per CodeMirror `Mod-B` è la B maiuscola: le lettere vanno minuscole (con Shift la riconosce dal tasto)
const keyOf = (shortcut: string) => shortcut.replace('Ctrl+', 'Mod-').replace(/\+/g, '-').replace(/-([A-Z])$/, (_, c: string) => '-' + c.toLowerCase())

/** Scorciatoie delle tab Markdown: sopra quelle generali (Ctrl+I altrimenti seleziona il blocco sintattico). */
export const markdownKeymap = Prec.high(
  keymap.of(MARKDOWN_ACTIONS.filter((a) => a.shortcut).map((a) => ({ key: keyOf(a.shortcut!), run: a.run, preventDefault: true }))),
)

/** Esegue un'azione dalla barra: il focus resta (o torna) nell'editor. */
export function runMarkdownAction(view: EditorView, action: MarkdownAction) {
  action.run(view)
  view.focus()
}
