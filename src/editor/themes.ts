import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import type { Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'

/** Temi oltre a chiaro e scuro. I colori dell'interfaccia sono in styles.css, sotto [data-palette]. */
export type Palette = 'solarized-light' | 'dracula'

export const PALETTES: Record<Palette, { label: string; dark: boolean }> = {
  'solarized-light': { label: 'Solarized chiaro', dark: false },
  dracula: { label: 'Dracula', dark: true },
}

interface Colors {
  comment: string
  keyword: string
  string: string
  number: string
  fn: string
  type: string
  tag: string
  attr: string
  prop: string
  regexp: string
  heading: string
  invalid: string
}

const COLORS: Record<Palette, Colors> = {
  'solarized-light': {
    comment: '#93a1a1',
    keyword: '#859900',
    string: '#2aa198',
    number: '#d33682',
    fn: '#268bd2',
    type: '#b58900',
    tag: '#268bd2',
    attr: '#b58900',
    prop: '#268bd2',
    regexp: '#dc322f',
    heading: '#cb4b16',
    invalid: '#dc322f',
  },
  dracula: {
    comment: '#6272a4',
    keyword: '#ff79c6',
    string: '#f1fa8c',
    number: '#bd93f9',
    fn: '#50fa7b',
    type: '#8be9fd',
    tag: '#ff79c6',
    attr: '#50fa7b',
    prop: '#8be9fd',
    regexp: '#ff5555',
    heading: '#bd93f9',
    invalid: '#ff5555',
  },
}

function paletteTheme(palette: Palette): Extension {
  const c = COLORS[palette]
  return [
    EditorView.theme(
      {
        '&': { backgroundColor: 'var(--bg-editor)', color: 'var(--fg)' },
        '.cm-gutters': { backgroundColor: 'var(--bg-editor)', color: 'var(--fg-muted)', border: 'none' },
        '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--active-line)' },
        '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--fg)' },
        '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
          backgroundColor: 'var(--selection)',
        },
        '.cm-panels, .cm-tooltip': { backgroundColor: 'var(--bg-chrome)', color: 'var(--fg)', borderColor: 'var(--border)' },
      },
      { dark: PALETTES[palette].dark },
    ),
    syntaxHighlighting(
      HighlightStyle.define([
        { tag: t.comment, color: c.comment, fontStyle: 'italic' },
        { tag: t.keyword, color: c.keyword },
        { tag: t.string, color: c.string },
        { tag: [t.number, t.bool, t.null, t.atom], color: c.number },
        { tag: [t.function(t.variableName), t.function(t.propertyName)], color: c.fn },
        { tag: [t.typeName, t.className, t.namespace], color: c.type },
        { tag: t.tagName, color: c.tag },
        { tag: t.attributeName, color: c.attr },
        { tag: t.propertyName, color: c.prop },
        { tag: [t.regexp, t.escape], color: c.regexp },
        { tag: t.heading, color: c.heading, fontWeight: 'bold' },
        { tag: t.strong, fontWeight: 'bold' },
        { tag: t.emphasis, fontStyle: 'italic' },
        { tag: t.link, textDecoration: 'underline' },
        { tag: t.invalid, color: c.invalid },
      ]),
    ),
  ]
}

const cache = new Map<Palette, Extension>()
export function paletteExtension(palette: Palette): Extension {
  let ext = cache.get(palette)
  if (!ext) cache.set(palette, (ext = paletteTheme(palette)))
  return ext
}
