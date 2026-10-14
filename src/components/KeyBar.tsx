import type { MouseEvent as ReactMouseEvent } from 'react'
import { runScopeHandlers, type EditorView } from '@codemirror/view'
import { cursorCharLeft, cursorCharRight, cursorLineDown, cursorLineUp, redo, undo } from '@codemirror/commands'
import { openSearchPanel } from '@codemirror/search'

interface Props {
  view: () => EditorView | undefined
  canRun: boolean
  onRun: () => void
}

type Key = { label: string; title: string } & ({ key: string } | { command: (v: EditorView) => boolean } | { text: string })

/** Tasti che la tastiera del telefono non ha, o nasconde dietro più tocchi. */
const KEYS: Key[] = [
  { label: '⇥', title: 'Tab (espande anche le abbreviazioni Emmet)', key: 'Tab' },
  { label: 'Esc', title: 'Esc', key: 'Escape' },
  { label: '↶', title: 'Annulla', command: undo },
  { label: '↷', title: 'Ripeti', command: redo },
  { label: '←', title: 'Sinistra', command: cursorCharLeft },
  { label: '↑', title: 'Su', command: cursorLineUp },
  { label: '↓', title: 'Giù', command: cursorLineDown },
  { label: '→', title: 'Destra', command: cursorCharRight },
  ...['{', '}', '(', ')', '[', ']', '<', '>', '/', '=', ';', ':', '"', "'", '`', '|', '&', '!', '$', '#', '_', '-', '+', '*', '\\'].map(
    (ch) => ({ label: ch, title: ch, text: ch }),
  ),
]

const SEARCH: Key = { label: 'Cerca', title: 'Cerca e sostituisci', command: openSearchPanel }

// toccare un tasto non deve togliere il focus all'editor, altrimenti la tastiera si chiude
const keepFocus = (e: ReactMouseEvent) => e.preventDefault()

/** Il tasto passa dai keymap dell'editor, come se fosse stato premuto (Tab → Emmet o indentazione). */
function pressKey(view: EditorView, key: string) {
  if (runScopeHandlers(view, new KeyboardEvent('keydown', { key, code: key }), 'editor')) return
  if (key === 'Tab') view.dispatch(view.state.replaceSelection('\t'), { userEvent: 'input.type', scrollIntoView: true })
}

/** Barra sopra la tastiera virtuale, visibile mentre si scrive nell'editor su un dispositivo touch. */
export function KeyBar({ view, canRun, onRun }: Props) {
  const press = (k: Key) => {
    const v = view()
    if (!v) return
    if ('key' in k) pressKey(v, k.key)
    else if ('command' in k) k.command(v)
    else v.dispatch(v.state.replaceSelection(k.text), { userEvent: 'input.type', scrollIntoView: true })
  }
  return (
    <div className="keybar" role="toolbar" aria-label="Tasti aggiuntivi">
      {KEYS.map((k) => (
        <button key={k.label} tabIndex={-1} title={k.title} aria-label={k.title} onMouseDown={keepFocus} onClick={() => press(k)}>
          {k.label}
        </button>
      ))}
      <span className="keybar-sep" />
      <button tabIndex={-1} title={SEARCH.title} onMouseDown={keepFocus} onClick={() => press(SEARCH)}>
        {SEARCH.label}
      </button>
      {canRun && (
        <button tabIndex={-1} title="Esegui o anteprima (Ctrl+Enter)" aria-label="Esegui" onMouseDown={keepFocus} onClick={onRun}>
          ▶
        </button>
      )}
    </div>
  )
}
