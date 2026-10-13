import { Compartment, EditorSelection, EditorState, type Extension } from '@codemirror/state'
import {
  EditorView,
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
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
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { tags as t } from '@lezer/highlight'
import { oneDark } from '@codemirror/theme-one-dark'
import { foldLevel, indentationFolding, restoreFoldEffects } from './folding'
import { loadLanguage } from './languages'
import { DEFAULT_INDENT, indentCompartment, indentExtension, type Indent } from './indentation'

export const languageCompartment = new Compartment()
export const indentFoldCompartment = new Compartment()
export const themeCompartment = new Compartment()
export const fontCompartment = new Compartment()
export const wrapCompartment = new Compartment()

export interface EditorSettings {
  dark: boolean
  fontSize: number
  wrap: boolean
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

const extraKeymap = keymap.of([
  { key: 'Mod-h', run: openSearchPanel, preventDefault: true },
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
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    search({ top: true }),
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

/** Effetti per allineare uno state alle impostazioni correnti (tema, font, a capo). */
export function settingsEffects(settings: EditorSettings) {
  return [
    themeCompartment.reconfigure(themeExtension(settings.dark)),
    fontCompartment.reconfigure(fontExtension(settings.fontSize)),
    wrapCompartment.reconfigure(wrapExtension(settings.wrap)),
  ]
}

/** Effetti per impostare il linguaggio (null = testo semplice). */
export async function languageEffects(name: string | null) {
  const loaded = name ? await loadLanguage(name) : null
  return [
    languageCompartment.reconfigure(loaded ? loaded.support : []),
    // Con parser Lezer il folding viene dall'albero sintattico; altrimenti dall'indentazione.
    indentFoldCompartment.reconfigure(!loaded || loaded.legacy ? indentationFolding : []),
  ]
}
