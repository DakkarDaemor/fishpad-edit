import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import type { Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'

/** Temi oltre a chiaro e scuro. I colori dell'interfaccia sono in styles.css, sotto [data-palette]. */
export type Palette = 'nebbia' | 'ardesia' | 'grafite' | 'solarized-light' | 'solarized-dark' | 'dracula' | 'monokai-dimmed' | 'abyss' | 'tomorrow-night-blue'

export const PALETTES: Record<Palette, { label: string; dark: boolean }> = {
  // luminosità media: grigi tra il chiaro e lo scuro
  nebbia: { label: 'Nebbia (grigio chiaro)', dark: false },
  ardesia: { label: 'Ardesia (grigio medio)', dark: true },
  grafite: { label: 'Grafite (grigio scuro)', dark: true },
  'solarized-light': { label: 'Solarized chiaro', dark: false },
  'solarized-dark': { label: 'Solarized scuro', dark: true },
  dracula: { label: 'Dracula', dark: true },
  'monokai-dimmed': { label: 'Monokai Dimmed', dark: true },
  abyss: { label: 'Abyss', dark: true },
  'tomorrow-night-blue': { label: 'Tomorrow Night Blue', dark: true },
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

const SOLARIZED: Colors = {
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
}

const COLORS: Record<Palette, Colors> = {
  // colori della sintassi scelti per un contrasto di almeno 4.5:1 sul fondo dell'editor (commenti un po' meno)
  nebbia: {
    comment: '#4a515c',
    keyword: '#74208a',
    string: '#265d0e',
    number: '#8a3c00',
    fn: '#184a94',
    type: '#6e5100',
    tag: '#86295a',
    attr: '#664400',
    prop: '#184a94',
    regexp: '#9a2019',
    heading: '#843600',
    invalid: '#9e1d27',
  },
  ardesia: {
    comment: '#cbd0d6',
    keyword: '#facdff',
    string: '#cdf2a8',
    number: '#ffd6aa',
    fn: '#bfe2ff',
    type: '#ffeaa8',
    tag: '#ffcad0',
    attr: '#ffd6aa',
    prop: '#bfe2ff',
    regexp: '#a8f2f2',
    heading: '#ffd6aa',
    invalid: '#ffc4c2',
  },
  grafite: {
    comment: '#a3aab3',
    keyword: '#f5b8ff',
    string: '#c2ec98',
    number: '#ffcc99',
    fn: '#a9d6ff',
    type: '#ffe599',
    tag: '#ffb5bd',
    attr: '#ffcc99',
    prop: '#a9d6ff',
    regexp: '#99ecec',
    heading: '#ffcc99',
    invalid: '#ffaaa7',
  },
  'solarized-light': SOLARIZED,
  'solarized-dark': { ...SOLARIZED, comment: '#586e75' },
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
  'monokai-dimmed': {
    comment: '#9a9b99',
    keyword: '#9872a2',
    string: '#9aa83a',
    number: '#6089b4',
    fn: '#ce6700',
    type: '#c7444a',
    tag: '#6089b4',
    attr: '#ce6700',
    prop: '#c5c8c6',
    regexp: '#d0b344',
    heading: '#ce6700',
    invalid: '#c7444a',
  },
  abyss: {
    comment: '#384887',
    keyword: '#225588',
    string: '#22aa44',
    number: '#f280d0',
    fn: '#ddbb88',
    type: '#ffeebb',
    tag: '#4499ff',
    attr: '#ddbb88',
    prop: '#6688cc',
    regexp: '#ff8800',
    heading: '#ddbb88',
    invalid: '#a22d44',
  },
  'tomorrow-night-blue': {
    comment: '#7285b7',
    keyword: '#ebbbff',
    string: '#d1f1a9',
    number: '#ffc58f',
    fn: '#bbdaff',
    type: '#ffeead',
    tag: '#ff9da4',
    attr: '#ffc58f',
    prop: '#bbdaff',
    regexp: '#99ffff',
    heading: '#bbdaff',
    invalid: '#ff9da4',
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
