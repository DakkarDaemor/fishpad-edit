import { Compartment, EditorSelection, EditorState, type Extension } from '@codemirror/state'
import {
  Direction,
  EditorView,
  crosshairCursor,
  type Rect,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
  type Command,
  type ViewUpdate,
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import {
  bracketMatching,
  codeFolding,
  defaultHighlightStyle,
  foldAll,
  HighlightStyle,
  foldGutter,
  foldKeymap,
  indentOnInput,
  syntaxHighlighting,
  unfoldAll,
} from '@codemirror/language'
import { highlightSelectionMatches, openSearchPanel, search, searchKeymap } from '@codemirror/search'
import { autocompletion, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { tags as t } from '@lezer/highlight'
import { oneDark } from '@codemirror/theme-one-dark'
import { foldLevel, indentationFolding, restoreFoldEffects } from './folding'
import { loadLanguage } from './languages'
import { DEFAULT_INDENT, indentCompartment, indentExtension, type Indent } from './indentation'
import { webExtensions } from './web'
import { typeCheckEnabled } from './typeLint'

/**
 * Posizione della spiegazione di un suggerimento: accanto alla lista se c'è spazio, altrimenti sotto o sopra
 * la lista intera. Il default di CodeMirror, sugli schermi stretti, la metteva sotto la voce evidenziata,
 * coprendo le voci seguenti.
 */
export function infoBesideList(view: EditorView, list: Rect, option: Rect, info: Rect, space: Rect) {
  const rtl = view.textDirection === Direction.RTL
  const spaceLeft = list.left - space.left
  const spaceRight = space.right - list.right
  const infoWidth = info.right - info.left
  const infoHeight = info.bottom - info.top
  const listHeight = list.bottom - list.top
  let left = rtl
  if (left && spaceLeft < Math.min(infoWidth, spaceRight)) left = false
  else if (!left && spaceRight < Math.min(infoWidth, spaceLeft)) left = true
  const side = left ? spaceLeft : spaceRight
  if (infoWidth <= side) {
    const top = Math.max(space.top, Math.min(option.top, space.bottom - infoHeight)) - list.top
    return { style: `top: ${top}px; max-width: ${Math.min(400, side)}px`, class: `cm-completionInfo-${left ? 'left' : 'right'}` }
  }
  const maxWidth = Math.min(400, (rtl ? list.right : space.right - list.left) - 30)
  const below = space.bottom - list.bottom >= infoHeight || space.bottom - list.bottom > list.top - space.top
  return {
    style: `${below ? 'top' : 'bottom'}: ${listHeight}px; max-width: ${maxWidth}px`,
    class: `cm-completionInfo-${rtl ? 'left' : 'right'}-narrow`,
  }
}

export const languageCompartment = new Compartment()
export const indentFoldCompartment = new Compartment()
export const themeCompartment = new Compartment()
export const fontCompartment = new Compartment()
export const wrapCompartment = new Compartment()
export const typeCheckCompartment = new Compartment()
/** Emmet, colori CSS, controllo JSON: dipendono dal linguaggio (vedi web.ts) */
export const webCompartment = new Compartment()

export interface EditorSettings {
  dark: boolean
  fontSize: number
  wrap: boolean
  /** controllo dei tipi TypeScript/TSX (vedi typeLint.ts) */
  typeCheck: boolean
}

// Un solo listener condiviso: gli EditorState delle tab vengono scambiati nella stessa view.
let updateHandler: ((u: ViewUpdate) => void) | null = null
export function setUpdateHandler(fn: (u: ViewUpdate) => void) {
  updateHandler = fn
}

const lightTheme = EditorView.theme(
  {
    '&': { backgroundColor: 'var(--bg-editor)', color: 'var(--fg)' },
    '.cm-gutters': { backgroundColor: 'var(--bg-editor)', color: 'var(--fg-muted)', border: 'none' },
    '.cm-activeLine': { backgroundColor: 'var(--active-line)' },
    '.cm-activeLineGutter': { backgroundColor: 'var(--active-line)' },
  },
  { dark: false },
)

// Lo stile di default di CodeMirror non colora tag e attributi: HTML, XML e JSX resterebbero neri.
const lightHighlight = syntaxHighlighting(
  HighlightStyle.define([
    ...defaultHighlightStyle.specs,
    { tag: [t.tagName, t.standard(t.tagName)], color: '#22863a' },
    { tag: t.attributeName, color: '#6f42c1' },
    { tag: t.angleBracket, color: '#6a737d' },
    { tag: t.character, color: '#e40' },
  ]),
)

export function themeExtension(dark: boolean): Extension {
  return dark ? oneDark : [lightTheme, lightHighlight]
}

const fontCache = new Map<number, Extension>()
export function fontExtension(size: number): Extension {
  let ext = fontCache.get(size)
  if (!ext) {
    ext = EditorView.theme({
      '&': { fontSize: `${size}px` },
      '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.5' },
    })
    fontCache.set(size, ext)
  }
  return ext
}

export function wrapExtension(wrap: boolean): Extension {
  return wrap ? EditorView.lineWrapping : []
}

/** Apre il pannello di ricerca con il cursore nel campo "Sostituisci" (openSearchPanel lo mette su "Cerca"). */
export const openReplacePanel: Command = (view) => {
  openSearchPanel(view)
  const field = view.dom.querySelector<HTMLInputElement>('.cm-search input[name=replace]')
  field?.focus()
  field?.select()
  return true
}

const extraKeymap = keymap.of([
  { key: 'Mod-h', run: openReplacePanel, preventDefault: true },
  // Stile VS Code: Ctrl+K poi Ctrl+0 / Ctrl+J / Ctrl+1..5
  { key: 'Mod-k Mod-0', run: foldAll },
  { key: 'Mod-k Mod-j', run: unfoldAll },
  ...[1, 2, 3, 4, 5].map((n) => ({ key: `Mod-k Mod-${n}`, run: foldLevel(n) })),
])

const italianPhrases = EditorState.phrases.of({
  Find: 'Cerca',
  Replace: 'Sostituisci',
  next: 'successivo',
  previous: 'precedente',
  all: 'tutti',
  'match case': 'maiuscole/minuscole',
  regexp: 'regex',
  'by word': 'parola intera',
  replace: 'sostituisci',
  'replace all': 'sostituisci tutti',
  close: 'chiudi',
  'current match': 'occorrenza corrente',
  'on line': 'alla riga',
  'replaced match on line $': 'sostituita occorrenza alla riga $',
  'replaced $ matches': 'sostituite $ occorrenze',
  'Go to line': 'Vai alla riga',
  go: 'vai',
  'Folded lines': 'Righe chiuse',
  'Unfolded lines': 'Righe aperte',
  'Fold line': 'Chiudi blocco',
  'Unfold line': 'Apri blocco',
  'folded code': 'codice chiuso',
  to: 'a',
})

function baseExtensions(settings: EditorSettings, indent: Indent): Extension[] {
  return [
    italianPhrases,
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    codeFolding({ placeholderText: '…' }),
    foldGutter({ openText: '▾', closedText: '▸' }),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    bracketMatching(),
    closeBrackets(),
    // suggerimenti dei linguaggi caricati (tag HTML, proprietà CSS, parole chiave e snippet JS/TS…): Invio accetta
    autocompletion({ positionInfo: infoBesideList }),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    search({ top: true }),
    // prima dei keymap dell'editor: il Tab di Emmet deve vincere su indentWithTab
    webCompartment.of([]),
    extraKeymap,
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
      indentWithTab,
    ]),
    languageCompartment.of([]),
    indentCompartment.of(indentExtension(indent)),
    indentFoldCompartment.of(indentationFolding),
    themeCompartment.of(themeExtension(settings.dark)),
    fontCompartment.of(fontExtension(settings.fontSize)),
    wrapCompartment.of(wrapExtension(settings.wrap)),
    typeCheckCompartment.of(typeCheckEnabled.of(settings.typeCheck)),
    EditorView.updateListener.of((u) => updateHandler?.(u)),
  ]
}

export interface CreateStateOptions {
  content: string
  settings: EditorSettings
  cursor?: number
  folds?: Array<[number, number]>
  indent?: Indent
}

export function createEditorState({ content, settings, cursor, folds, indent }: CreateStateOptions): EditorState {
  let state = EditorState.create({ doc: content, extensions: baseExtensions(settings, indent ?? DEFAULT_INDENT) })
  const effects = folds?.length ? restoreFoldEffects(state, folds) : []
  const pos = Math.min(cursor ?? 0, state.doc.length)
  state = state.update({ selection: EditorSelection.cursor(pos), effects }).state
  return state
}

/** Effetti per allineare uno state alle impostazioni correnti (tema, font, a capo, controllo dei tipi). */
export function settingsEffects(settings: EditorSettings) {
  return [
    themeCompartment.reconfigure(themeExtension(settings.dark)),
    fontCompartment.reconfigure(fontExtension(settings.fontSize)),
    wrapCompartment.reconfigure(wrapExtension(settings.wrap)),
    typeCheckCompartment.reconfigure(typeCheckEnabled.of(settings.typeCheck)),
  ]
}

/** Effetti per impostare il linguaggio (null = testo semplice). */
export async function languageEffects(name: string | null) {
  const [loaded, web] = await Promise.all([name ? loadLanguage(name) : null, webExtensions(name)])
  return [
    webCompartment.reconfigure(web),
    languageCompartment.reconfigure(loaded ? loaded.support : []),
    // Con parser Lezer il folding viene dall'albero sintattico; altrimenti dall'indentazione.
    indentFoldCompartment.reconfigure(!loaded || loaded.legacy ? indentationFolding : []),
  ]
}
