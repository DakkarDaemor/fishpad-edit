import { syntaxTree } from '@codemirror/language'
import { RangeSetBuilder, type Extension } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { COLOR_RE, parseColor, replaceColor, toHex } from './colorValue'

/**
 * Quadratino colorato prima di ogni colore CSS. Un clic apre il selettore di colore del sistema
 * e riscrive il valore nello stesso formato (hex, rgb, hsl), mantenendo l'alpha.
 */
class SwatchWidget extends WidgetType {
  readonly color: string
  readonly from: number

  constructor(color: string, from: number) {
    super()
    this.color = color
    this.from = from
  }

  eq(other: SwatchWidget) {
    return other.color === this.color && other.from === this.from
  }

  toDOM(view: EditorView) {
    const el = document.createElement('span')
    el.className = 'cm-color-swatch'
    el.title = 'Clic per scegliere il colore'
    el.style.setProperty('--swatch', this.color)
    el.addEventListener('mousedown', (e) => {
      e.preventDefault()
      openPicker(view, this.from, this.color, el)
    })
    return el
  }

  ignoreEvent() {
    return true
  }
}

/** Input del selettore aperto: se l'utente lo chiude senza scegliere non arriva nessun evento, lo si toglie al successivo. */
let openInput: HTMLInputElement | null = null

function openPicker(view: EditorView, from: number, text: string, anchor: HTMLElement) {
  const parsed = parseColor(text)
  if (!parsed) return
  openInput?.remove()
  const input = document.createElement('input')
  openInput = input
  input.type = 'color'
  input.value = toHex(parsed)
  // il selettore si apre vicino al quadratino
  const rect = anchor.getBoundingClientRect()
  Object.assign(input.style, { position: 'fixed', left: `${rect.left}px`, top: `${rect.bottom}px`, width: '1px', height: '1px', opacity: '0' })
  document.body.appendChild(input)
  let current = text
  input.addEventListener('input', () => {
    const next = replaceColor(parsed, input.value)
    // il valore potrebbe essere stato spostato da altre modifiche: lo si cerca dove ci si aspetta
    if (view.state.sliceDoc(from, from + current.length) !== current) return
    view.dispatch({ changes: { from, to: from + current.length, insert: next }, userEvent: 'input.color' })
    current = next
  })
  input.addEventListener('change', () => {
    input.remove()
    if (openInput === input) openInput = null
  })
  try {
    input.showPicker()
  } catch {
    input.click()
  }
}

/**
 * Il colore trovato dalla regex è davvero un valore? Esclude `#id` nei selettori e le entità `&#123;`.
 * Se il parser lo riconosce come colore basta quello; altrimenti (Sass, attributi `style` in HTML)
 * deve seguire un `:` sulla stessa riga, come in una dichiarazione `proprietà: valore`.
 */
function isColorValue(view: EditorView, from: number, text: string) {
  if (!text.startsWith('#')) return true
  if (view.state.sliceDoc(from - 1, from) === '&') return false
  if (syntaxTree(view.state).resolveInner(from + 1, 1).name === 'ColorLiteral') return true
  const line = view.state.doc.lineAt(from)
  return /:[^;{}]*[\s:(,]$/.test(view.state.sliceDoc(line.from, from))
}

function build(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.sliceDoc(from, to)
    for (const m of text.matchAll(COLOR_RE)) {
      const pos = from + m.index
      if (!isColorValue(view, pos, m[0]) || !parseColor(m[0])) continue
      builder.add(pos, pos, Decoration.widget({ widget: new SwatchWidget(m[0], pos), side: -1 }))
    }
  }
  return builder.finish()
}

const swatchPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = build(view)
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged || syntaxTree(u.startState) !== syntaxTree(u.state)) this.decorations = build(u.view)
    }
  },
  { decorations: (v) => v.decorations },
)

const swatchTheme = EditorView.baseTheme({
  '.cm-color-swatch': {
    display: 'inline-block',
    width: '0.8em',
    height: '0.8em',
    margin: '0 3px 0 1px',
    verticalAlign: '-0.05em',
    borderRadius: '2px',
    cursor: 'pointer',
    // scacchiera sotto il colore, per vedere la trasparenza
    background:
      'linear-gradient(var(--swatch), var(--swatch)), repeating-conic-gradient(#ccc 0 25%, #fff 0 50%) 0 0 / 6px 6px',
    boxShadow: 'inset 0 0 0 1px rgb(0 0 0 / 0.25)',
  },
})

export const colorSwatches: Extension = [swatchPlugin, swatchTheme]
